import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import type { TrainStatus } from '../../src/contract.ts'
import { HttpError, readJson, sendJson, type Route } from './http.ts'
import { latestTraining } from './runs.ts'

// Owner: actor agent. shared/game_contract.md section d.
//   POST /api/train          {slug} -> 202 TrainStatus (starts actor/agent.py; 4 levels concurrent, 10 sequential attempts each)
//   GET  /api/train/status   -> TrainStatus

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const IDLE: TrainStatus = { training_id: null, status: 'idle', slug: null, levels: [], skills_ready: false }
let child: ChildProcess | null = null

function statusPath(repoRoot: string, trainingId: string): string {
  return path.join(repoRoot, 'runs', trainingId, 'status.json')
}

function readStatus(repoRoot: string, trainingId: string): TrainStatus | null {
  try {
    return JSON.parse(fs.readFileSync(statusPath(repoRoot, trainingId), 'utf8')) as TrainStatus
  } catch {
    return null
  }
}

function writeStatus(repoRoot: string, status: TrainStatus): void {
  const file = statusPath(repoRoot, status.training_id as string)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(status, null, 2))
  fs.renameSync(`${file}.tmp`, file)
}

/** games/<slug>/world.json, then the game/<slug> branch (section i). */
function readWorld(repoRoot: string, slug: string): { levels?: { id: string; title?: string }[] } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'games', slug, 'world.json'), 'utf8'))
  } catch {
    try {
      return JSON.parse(execFileSync('git', ['show', `game/${slug}:games/${slug}/world.json`], { cwd: repoRoot, encoding: 'utf8' }))
    } catch {
      return null
    }
  }
}

export const routes: Route[] = [
  {
    method: 'POST',
    path: '/api/train',
    handler: async (req, res, ctx) => {
      const body = await readJson<{ slug?: string }>(req)
      const slug = String(body.slug ?? '').trim()
      if (!SLUG.test(slug)) throw new HttpError(400, '"slug" must be the game slug')
      const current = latestTraining(ctx.repoRoot)
      if (child && child.exitCode === null && current) {
        const running = readStatus(ctx.repoRoot, current.training_id)
        if (running) return sendJson(res, 202, running)
      }

      const attempts = Math.max(1, Number(ctx.env.ACTOR_ATTEMPTS || process.env.ACTOR_ATTEMPTS || 10) || 10)
      const trainingId = `${slug}-${Date.now()}`
      const world = readWorld(ctx.repoRoot, slug)
      const status: TrainStatus = {
        training_id: trainingId,
        status: 'running',
        slug,
        levels: (world?.levels ?? []).map((l) => ({
          level_id: l.id,
          level_title: l.title ?? l.id,
          attempts_done: 0,
          attempts_total: attempts,
          best_score: null,
          status: 'queued' as const,
        })),
        skills_ready: false,
      }
      writeStatus(ctx.repoRoot, status)
      fs.writeFileSync(path.join(ctx.repoRoot, 'runs', 'latest.json'), JSON.stringify({ training_id: trainingId, slug }))

      // This server over loopback, in the family the request came in on (Vite may listen on ::1 only, so
      // 127.0.0.1 is not always reachable). Not localAddress itself: on Cloud Run that is a link-local
      // interface address (169.254.x.x) that refuses connections from inside the container.
      const addr = req.socket.localAddress ?? '127.0.0.1'
      const host = addr.includes(':') && !addr.startsWith('::ffff:') ? '[::1]' : '127.0.0.1'
      const args = ['-m', 'actor.agent', '--slug', slug, '--training-id', trainingId,
        '--base-url', `http://${host}:${req.socket.localPort}`, '--attempts', String(attempts)]
      const gameUrl = ctx.env.ACTOR_GAME_URL || process.env.ACTOR_GAME_URL
      if (gameUrl) args.push('--game-url', gameUrl)
      const log = fs.openSync(path.join(ctx.repoRoot, 'runs', trainingId, 'actor.log'), 'a')
      const proc = spawn('python3', args, { cwd: ctx.repoRoot, env: { ...process.env, ...ctx.env }, stdio: ['ignore', 'ignore', log] })
      child = proc
      proc.on('exit', (code) => {
        fs.closeSync(log)
        if (child === proc) child = null
        const last = readStatus(ctx.repoRoot, trainingId)
        if (last && last.status === 'running') {
          writeStatus(ctx.repoRoot, { ...last, status: 'error', error: `Actor exited with code ${code}; see runs/${trainingId}/actor.log` })
        }
      })
      proc.on('error', (err) => {
        const last = readStatus(ctx.repoRoot, trainingId) ?? status
        writeStatus(ctx.repoRoot, { ...last, status: 'error', error: `Could not start the actor: ${err.message}` })
      })
      sendJson(res, 202, status)
    },
  },
  {
    method: 'GET',
    path: '/api/train/status',
    handler: (_req, res, ctx) => {
      const latest = latestTraining(ctx.repoRoot)
      sendJson(res, 200, (latest && readStatus(ctx.repoRoot, latest.training_id)) ?? IDLE)
    },
  },
]
