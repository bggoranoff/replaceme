import fs from 'node:fs'
import path from 'node:path'
import type { ServerResponse } from 'node:http'
import type { RunEvent, RunSummary } from '../../src/contract.ts'
import { HttpError, readJson, sendJson, type Route } from './http.ts'

// Owner: actor agent. shared/game_contract.md section d. Types in src/contract.ts.
//   POST /api/runs/:id/events  {events: RunEvent[]} -> {ok: true}   (first run_started creates the run)
//   GET  /api/runs             ?training_id= -> {runs: RunSummary[]} ordered by level_index, attempt
//   GET  /api/runs/:id         -> {run: RunSummary, events: RunEvent[]}
//   GET  /api/runs/:id/stream  SSE: replays stored events, then live; `event: run_event` data: RunEvent

interface RunRecord {
  run: RunSummary
  events: RunEvent[]
  subscribers: Set<ServerResponse>
}

const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-l\d+-a\d+$/
const store = new Map<string, RunRecord>()

export function trainingIdOf(runId: string): string {
  return runId.replace(/-l\d+-a\d+$/, '')
}

function runsDir(repoRoot: string): string {
  return path.join(repoRoot, 'runs')
}

export function latestTraining(repoRoot: string): { training_id: string; slug: string } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(runsDir(repoRoot), 'latest.json'), 'utf8'))
  } catch {
    return null
  }
}

function apply(rec: RunRecord | undefined, runId: string, ev: RunEvent): RunRecord | undefined {
  if (ev.type === 'run_started') {
    const r = ev.run
    rec = rec ?? { run: undefined as unknown as RunSummary, events: [], subscribers: new Set() }
    rec.run = { ...r, id: runId, status: 'running', score: null, started_at: ev.at, finished_at: null }
  }
  if (!rec) return undefined
  rec.events.push(ev)
  if (ev.type === 'run_finished') {
    rec.run = { ...rec.run, status: ev.status, score: ev.score, finished_at: ev.at }
  }
  return rec
}

/** Loads runs/<training_id>/*.jsonl that are not in memory yet (e.g. after a server restart). */
function loadTraining(repoRoot: string, trainingId: string): void {
  const dir = path.join(runsDir(repoRoot), trainingId)
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return
  }
  for (const file of files) {
    const runId = file.slice(0, -'.jsonl'.length)
    if (store.has(runId) || !RUN_ID.test(runId)) continue
    let rec: RunRecord | undefined
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        rec = apply(rec, runId, JSON.parse(line) as RunEvent)
      } catch {
        // skip a torn last line
      }
    }
    if (rec) store.set(runId, rec)
  }
}

function getRun(repoRoot: string, runId: string): RunRecord {
  if (!RUN_ID.test(runId)) throw new HttpError(400, 'Invalid run id')
  if (!store.has(runId)) loadTraining(repoRoot, trainingIdOf(runId))
  const rec = store.get(runId)
  if (!rec) throw new HttpError(404, 'Run not found')
  return rec
}

function sse(res: ServerResponse, ev: RunEvent): void {
  res.write(`event: run_event\ndata: ${JSON.stringify(ev)}\n\n`)
}

export const routes: Route[] = [
  {
    method: 'POST',
    path: '/api/runs/:id/events',
    handler: async (req, res, ctx, { id }) => {
      if (!RUN_ID.test(id)) throw new HttpError(400, 'Invalid run id')
      const body = await readJson<{ events?: RunEvent[] }>(req)
      if (!Array.isArray(body.events)) throw new HttpError(400, '"events" must be an array')
      const dir = path.join(runsDir(ctx.repoRoot), trainingIdOf(id))
      fs.mkdirSync(dir, { recursive: true })
      let rec = store.get(id)
      for (const ev of body.events) {
        if (!ev || typeof ev.type !== 'string') throw new HttpError(400, 'Each event needs a type')
        rec = apply(rec, id, ev)
        if (!rec) throw new HttpError(409, 'The first event of a run must be run_started')
        store.set(id, rec)
        fs.appendFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify(ev) + '\n')
        for (const sub of rec.subscribers) sse(sub, ev)
      }
      sendJson(res, 200, { ok: true })
    },
  },
  {
    method: 'GET',
    path: '/api/runs',
    handler: (req, res, ctx) => {
      const url = new URL(req.url ?? '', 'http://local')
      const trainingId = url.searchParams.get('training_id') || latestTraining(ctx.repoRoot)?.training_id
      if (!trainingId) return sendJson(res, 200, { runs: [] })
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trainingId)) throw new HttpError(400, 'Invalid training id')
      loadTraining(ctx.repoRoot, trainingId)
      const runs = [...store.values()]
        .map((r) => r.run)
        .filter((r) => r.training_id === trainingId)
        .sort((a, b) => a.level_index - b.level_index || a.attempt - b.attempt)
      sendJson(res, 200, { runs })
    },
  },
  {
    method: 'GET',
    path: '/api/runs/:id',
    handler: (_req, res, ctx, { id }) => {
      const rec = getRun(ctx.repoRoot, id)
      sendJson(res, 200, { run: rec.run, events: rec.events })
    },
  },
  {
    method: 'GET',
    path: '/api/runs/:id/stream',
    handler: (req, res, ctx, { id }) => {
      const rec = getRun(ctx.repoRoot, id)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      for (const ev of rec.events) sse(res, ev)
      rec.subscribers.add(res)
      const ping = setInterval(() => res.write(': ping\n\n'), 15000)
      req.on('close', () => {
        clearInterval(ping)
        rec.subscribers.delete(res)
      })
    },
  },
]
