import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { TrainStatus } from '../../src/contract.ts'
import { readBody, sendJson, type ApiContext, type Route } from './http.ts'
import { routes as trainRoutes } from './train.ts'
import { routes as worldRoutes, slugify } from './world.ts'

// Prebuilt game cache keyed by slug (generic: nothing here knows any job).
//   POST /api/research {prompt}: when games/<slug>/ holds a complete prebuilt game (research.json v2,
//     world.json v2 with 4 levels, graph_report.json not failing; working tree first, then the game/<slug>
//     branch), answer {brief, world, slug, branch, graph} after PREBUILT_DELAY_MS (default 2500, so the
//     loading screen still shows briefly) and skip the researcher and builder.
//   POST /api/train {slug, fresh?}: when games/<slug>/training/ holds a cached training (training.json
//     {training_id}, runs/<training_id>/, skills/<level_id>/), restore it into runs/ and skills/ and
//     answer 202 like a live start. The status reads 'running' for TRAIN_CACHE_REPLAY_MS (default 8000)
//     so the runs viewer shows the recorded runs, then the cached final status (skills ready).
// Anything else falls through to the regular handlers (world.ts, train.ts). PREBUILT_GAMES=0 disables
// both hooks; {fresh: true} on /api/train forces a live training.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export interface PrebuiltGame {
  brief: Record<string, unknown>
  world: { slug?: string; branch?: string; levels?: unknown[]; version?: number }
  slug: string
  branch: string
  graph: Record<string, unknown> | null
}

function readJsonFile(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function fromBranch(repoRoot: string, slug: string, file: string): Record<string, unknown> | null {
  try {
    const out = execFileSync('git', ['show', `game/${slug}:games/${slug}/${file}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 50_000_000 })
    return JSON.parse(out) as Record<string, unknown>
  } catch {
    return null
  }
}

function gameFile(repoRoot: string, slug: string, file: string): Record<string, unknown> | null {
  return readJsonFile(path.join(repoRoot, 'games', slug, file)) ?? fromBranch(repoRoot, slug, file)
}

const enabled = (ctx: ApiContext) => (ctx.env.PREBUILT_GAMES ?? process.env.PREBUILT_GAMES) !== '0'
const delayMs = (ctx: ApiContext, key: string, fallback: number) => {
  const n = Number(ctx.env[key] ?? process.env[key])
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** A complete prebuilt game for the slug, or null. */
export function prebuiltGame(repoRoot: string, slug: string): PrebuiltGame | null {
  if (!SLUG.test(slug)) return null
  const brief = gameFile(repoRoot, slug, 'research.json')
  const world = gameFile(repoRoot, slug, 'world.json') as PrebuiltGame['world'] | null
  if (!brief || brief.version !== 2 || !Array.isArray(brief.tasks)) return null
  if (!world || world.version !== 2 || !Array.isArray(world.levels) || world.levels.length !== 4 || world.slug !== slug) return null
  const graph = gameFile(repoRoot, slug, 'graph_report.json')
  if (graph && graph.ok === false) return null
  return { brief, world, slug, branch: world.branch ?? `game/${slug}`, graph }
}

function trainingDir(repoRoot: string, slug: string): string {
  return path.join(repoRoot, 'games', slug, 'training')
}

/** The cached training id for the slug, if games/<slug>/training/ is complete. */
export function cachedTrainingId(repoRoot: string, slug: string): string | null {
  if (!SLUG.test(slug)) return null
  const dir = trainingDir(repoRoot, slug)
  const meta = readJsonFile(path.join(dir, 'training.json'))
  const id = typeof meta?.training_id === 'string' ? meta.training_id : null
  if (!id || !SLUG.test(id)) return null
  if (!fs.existsSync(path.join(dir, 'runs', id, 'status.json')) || !fs.existsSync(path.join(dir, 'skills'))) return null
  return id
}

const replayTimers = new Map<string, NodeJS.Timeout>()

function writeStatus(file: string, status: TrainStatus): void {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(status, null, 2))
  fs.renameSync(`${file}.tmp`, file)
}

/** Copies the cached runs and skills into runs/ and skills/ and points runs/latest.json at them. */
export function restoreTraining(repoRoot: string, slug: string, replayMs: number): TrainStatus | null {
  const id = cachedTrainingId(repoRoot, slug)
  if (!id) return null
  const src = trainingDir(repoRoot, slug)
  const runsDir = path.join(repoRoot, 'runs', id)
  fs.mkdirSync(path.dirname(runsDir), { recursive: true })
  fs.cpSync(path.join(src, 'runs', id), runsDir, { recursive: true })
  for (const e of fs.readdirSync(path.join(src, 'skills'), { withFileTypes: true })) {
    if (e.isDirectory() && ID.test(e.name)) fs.cpSync(path.join(src, 'skills', e.name), path.join(repoRoot, 'skills', e.name), { recursive: true })
  }
  const final = JSON.parse(fs.readFileSync(path.join(runsDir, 'status.json'), 'utf8')) as TrainStatus
  const statusFile = path.join(runsDir, 'status.json')
  fs.writeFileSync(path.join(repoRoot, 'runs', 'latest.json'), JSON.stringify({ training_id: id, slug }))
  clearTimeout(replayTimers.get(id))
  if (replayMs <= 0) return final
  const replaying: TrainStatus = { ...final, status: 'running', skills_ready: false }
  writeStatus(statusFile, replaying)
  const timer = setTimeout(() => {
    replayTimers.delete(id)
    writeStatus(statusFile, final)
  }, replayMs)
  timer.unref?.()
  replayTimers.set(id, timer)
  return replaying
}

/** The request again, with its already-read body, for the regular handler. */
function replay(req: IncomingMessage, body: Buffer): IncomingMessage {
  return Object.assign(Readable.from([body]), {
    headers: req.headers,
    method: req.method,
    url: req.url,
    socket: req.socket,
    httpVersion: req.httpVersion,
  }) as unknown as IncomingMessage
}

function parse(body: Buffer): Record<string, unknown> {
  try {
    const data = JSON.parse(body.toString('utf8') || '{}')
    return typeof data === 'object' && data !== null ? data : {}
  } catch {
    return {}
  }
}

const fallthrough = (list: Route[], method: string, p: string) => list.find((r) => r.method === method && r.path === p)!.handler

export const routes: Route[] = [
  {
    method: 'POST',
    path: '/api/research',
    handler: async (req, res, ctx, params) => {
      const body = await readBody(req)
      const prompt = parse(body).prompt
      const game = enabled(ctx) && typeof prompt === 'string' ? prebuiltGame(ctx.repoRoot, slugify(prompt.trim())) : null
      if (!game) return fallthrough(worldRoutes, 'POST', '/api/research')(replay(req, body), res, ctx, params)
      await new Promise((r) => setTimeout(r, delayMs(ctx, 'PREBUILT_DELAY_MS', 2500)))
      sendJson(res, 200, { ...game, prebuilt: true })
    },
  },
  {
    method: 'POST',
    path: '/api/train',
    handler: async (req, res, ctx, params) => {
      const body = await readBody(req)
      const data = parse(body)
      const slug = typeof data.slug === 'string' ? data.slug.trim() : ''
      const status = enabled(ctx) && data.fresh !== true ? restoreTraining(ctx.repoRoot, slug, delayMs(ctx, 'TRAIN_CACHE_REPLAY_MS', 8000)) : null
      if (!status) return fallthrough(trainRoutes, 'POST', '/api/train')(replay(req, body), res, ctx, params)
      sendJson(res, 202, status)
    },
  },
]
