import fs from 'node:fs'
import path from 'node:path'
import { HttpError, sendJson, type Route } from './http.ts'

// Owner: loading. Read-only view of the research -> build pipeline for the loading screen.
//   GET /api/research/progress?run=<token> -> ResearchProgress
// The first poll for a token marks when that research started. A step counts as done once its
// artifact (contract sections b and i: games/<slug>/research.json, world.json, graph_report.json;
// the legacy handler writes research.json and world.json at the repo root) is newer than that.

export type ResearchPhase = 'research' | 'build' | 'check' | 'commit'

export interface ResearchProgress {
  phase: ResearchPhase
  tasks: string[]
}

const TOKEN = /^[A-Za-z0-9-]{1,64}$/
const TTL_MS = 60 * 60 * 1000
const started = new Map<string, number>()

function newest(repoRoot: string, file: string, since: number): string | null {
  const gamesDir = path.join(repoRoot, 'games')
  let slugs: string[] = []
  try {
    slugs = fs.readdirSync(gamesDir)
  } catch {
    // no games/ yet
  }
  let best: { file: string; mtime: number } | null = null
  for (const candidate of [path.join(repoRoot, file), ...slugs.map((s) => path.join(gamesDir, s, file))]) {
    try {
      const mtime = fs.statSync(candidate).mtimeMs
      if (mtime >= since && (!best || mtime > best.mtime)) best = { file: candidate, mtime }
    } catch {
      // missing
    }
  }
  return best?.file ?? null
}

function taskTitles(file: string): string[] {
  try {
    const brief = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      tasks?: { title?: string }[]
      levels?: { title?: string }[]
    }
    return (brief.tasks ?? brief.levels ?? [])
      .map((t) => String(t?.title ?? '').trim())
      .filter(Boolean)
      .slice(0, 6)
  } catch {
    return [] // still being written
  }
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/research/progress',
    handler: (req, res, ctx) => {
      const run = new URL(req.url ?? '', 'http://x').searchParams.get('run') ?? ''
      if (!TOKEN.test(run)) throw new HttpError(400, 'run must be 1-64 letters, digits or dashes')
      const now = Date.now()
      for (const [id, at] of started) if (now - at > TTL_MS) started.delete(id)
      if (!started.has(run)) started.set(run, now)
      const since = started.get(run)!

      const research = newest(ctx.repoRoot, 'research.json', since)
      const phase: ResearchPhase = newest(ctx.repoRoot, 'graph_report.json', since)
        ? 'commit'
        : newest(ctx.repoRoot, 'world.json', since)
          ? 'check'
          : research
            ? 'build'
            : 'research'
      const body: ResearchProgress = { phase, tasks: research ? taskTitles(research) : [] }
      sendJson(res, 200, body)
    },
  },
]
