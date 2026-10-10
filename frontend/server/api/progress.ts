import fs from 'node:fs'
import path from 'node:path'
import { HttpError, sendJson, type Route } from './http.ts'

// Owner: loading. Read-only view of the research -> build pipeline for the loading screen.
//   GET /api/research/progress?run=<token> -> ResearchProgress
// The first poll for a token marks when that research started. A step counts as done once its
// artifact (contract sections b and i: games/<slug>/research.json, world.json, graph_report.json;
// the legacy handler writes research.json and world.json at the repo root) is newer than that.
// world.json and graph_report.json are read from the folder of the games/<slug>/research.json that
// was found, so another game being generated in a different folder does not move this screen forward.

export type ResearchPhase = 'research' | 'build' | 'check' | 'commit'

export interface ResearchProgress {
  phase: ResearchPhase
  tasks: string[]
}

const TOKEN = /^[A-Za-z0-9-]{1,64}$/
const TTL_MS = 60 * 60 * 1000
const MAX_RUNS = 500
const started = new Map<string, number>()

function gameDirs(repoRoot: string): string[] {
  const gamesDir = path.join(repoRoot, 'games')
  try {
    return fs.readdirSync(gamesDir).map((s) => path.join(gamesDir, s))
  } catch {
    return [] // no games/ yet
  }
}

/** Newest of `files` written since `since`. */
function newest(files: string[], since: number): string | null {
  let best: { file: string; mtime: number } | null = null
  for (const file of files) {
    try {
      const mtime = fs.statSync(file).mtimeMs
      if (mtime >= since && (!best || mtime > best.mtime)) best = { file, mtime }
    } catch {
      // missing
    }
  }
  return best?.file ?? null
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null // missing or still being written
  }
}

function taskTitles(brief: Record<string, unknown> | null): string[] {
  const list = (brief?.tasks ?? brief?.levels) as { title?: unknown }[] | undefined
  if (!Array.isArray(list)) return []
  return list
    .map((t) => String(t?.title ?? '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

function progress(repoRoot: string, since: number): ResearchProgress {
  const dirs = gameDirs(repoRoot)
  const v2 = newest(dirs.map((d) => path.join(d, 'research.json')), since)
  const research = v2 ?? newest([path.join(repoRoot, 'research.json')], since)
  if (!research) return { phase: 'research', tasks: [] }
  // games/<slug>/research.json: its world.json and graph_report.json sit next to it (contract b).
  // Legacy root research.json: the builder may still write games/<slug>/, so look everywhere.
  const places = v2 ? [path.dirname(research), repoRoot] : [repoRoot, ...dirs]
  const report = newest(places.map((d) => path.join(d, 'graph_report.json')), since)
  const world = newest(places.map((d) => path.join(d, 'world.json')), since)
  // A failing world is never committed (contract b): stay on the rules check instead of "saving".
  const phase: ResearchPhase = report && readJson(report)?.ok !== false ? 'commit' : report || world ? 'check' : 'build'
  return { phase, tasks: taskTitles(readJson(research)) }
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/research/progress',
    handler: (req, res, ctx) => {
      const run = new URL(req.url ?? '', 'http://x').searchParams.get('run') ?? ''
      if (!TOKEN.test(run)) throw new HttpError(400, 'run must be 1-64 letters, digits or dashes')
      const now = Date.now()
      for (const [id, at] of started) if (now - at > TTL_MS || started.size > MAX_RUNS) started.delete(id)
      // Re-insert on every poll so the size cap drops idle tokens first, never one still polling.
      const since = started.get(run) ?? now
      started.delete(run)
      started.set(run, since)

      sendJson(res, 200, progress(ctx.repoRoot, since))
    },
  },
]
