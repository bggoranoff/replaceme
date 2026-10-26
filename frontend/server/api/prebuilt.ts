import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { TrainStatus } from '../../src/contract.ts'
import { readBody, sendJson, type ApiContext, type Route } from './http.ts'
import { routes as trainRoutes } from './train.ts'
import { routes as worldRoutes, slugify } from './world.ts'

// Prebuilt game cache keyed by slug. Generic: nothing here knows any job; the games live in data files.
//
// A prebuilt game is a games/<slug>/ folder in the working tree holding
//   prebuilt.json        the marker: {slug, aliases?: [slug, ...]}; without it a folder is an ordinary generated game
//   research.json        research.json v2 (ResearchBrief)
//   world.json           world.json v2 with 4 levels and the same slug
//   graph_report.json    the Entire Graph rules check, ok: true
// and optionally a cached training:
//   training/training.json                 {training_id} (optional when runs/ holds exactly one training)
//   training/runs/<training_id>/           status.json, learning/<level_id>.json, <run_id>.jsonl (runs/ layout, contract d)
//   training/skills/<level_id>/            skill.json and SKILL.md (contract e)
//
//   POST /api/research {prompt}: slugify(prompt), or an alias, names a prebuilt game -> after PREBUILT_DELAY_MS
//     (default 25000, so the loading screen walks through every step) answer {brief, world, slug, branch, graph, prebuilt: true}
//     without running the researcher and builder.
//   POST /api/train {slug, fresh?}: the prebuilt game has a cached training -> copy it into runs/<new training id>/ and
//     skills/ (the cached training id is rewritten to a fresh <slug>-<unix_ms>), reveal the recorded attempts round by
//     round over TRAIN_CACHE_REPLAY_MS (default 15000; 0 = at once), then write the final status with skills_ready.
// Everything else falls through to world.ts and train.ts. PREBUILT_GAMES=0 disables both hooks; {fresh: true} on
// /api/train forces a live training.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const MARKER = 'prebuilt.json'

export interface PrebuiltGame {
  brief: Record<string, unknown>
  world: { slug?: string; branch?: string; levels?: unknown[]; version?: number }
  slug: string
  branch: string
  graph: Record<string, unknown>
}

function readJsonFile(file: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const gamesDir = (repoRoot: string) => path.join(repoRoot, 'games')

/** The games/<dir> whose prebuilt.json marker claims this slug: its own folder first, then any alias. */
export function markedDir(repoRoot: string, slug: string): string | null {
  if (fs.existsSync(path.join(gamesDir(repoRoot), slug, MARKER))) return slug
  let dirs: fs.Dirent[] = []
  try {
    dirs = fs.readdirSync(gamesDir(repoRoot), { withFileTypes: true })
  } catch {
    return null
  }
  for (const d of dirs) {
    if (!d.isDirectory() || !SLUG.test(d.name)) continue
    const aliases = readJsonFile(path.join(gamesDir(repoRoot), d.name, MARKER))?.aliases
    if (Array.isArray(aliases) && aliases.some((a) => typeof a === 'string' && slugify(a) === slug)) return d.name
  }
  return null
}

/** The complete prebuilt game a slug (or alias) names, or null. */
export function prebuiltGame(repoRoot: string, slug: string): PrebuiltGame | null {
  if (!SLUG.test(slug)) return null
  const dir = markedDir(repoRoot, slug)
  if (!dir) return null
  const file = (name: string) => readJsonFile(path.join(gamesDir(repoRoot), dir, name))
  const marker = file(MARKER)
  if (!marker || (marker.slug !== undefined && marker.slug !== dir)) return null
  const brief = file('research.json')
  const world = file('world.json') as PrebuiltGame['world'] | null
  const graph = file('graph_report.json')
  if (!brief || brief.version !== 2 || !Array.isArray(brief.tasks)) return null
  if (!world || world.version !== 2 || world.slug !== dir || !Array.isArray(world.levels) || world.levels.length !== 4) return null
  if (!graph || graph.ok !== true) return null
  return { brief, world, slug: dir, branch: world.branch ?? `game/${dir}`, graph }
}

function trainingDir(repoRoot: string, slug: string): string {
  return path.join(gamesDir(repoRoot), slug, 'training')
}

/** The cached training id of a prebuilt game: training.json, else the only runs/<id>/ with a status.json. */
export function cachedTrainingId(repoRoot: string, slug: string): string | null {
  if (!SLUG.test(slug) || !prebuiltGame(repoRoot, slug) || markedDir(repoRoot, slug) !== slug) return null
  const dir = trainingDir(repoRoot, slug)
  const named = readJsonFile(path.join(dir, 'training.json'))?.training_id
  let candidates: string[] = []
  try {
    candidates = fs.readdirSync(path.join(dir, 'runs')).filter((d) => SLUG.test(d) && fs.existsSync(path.join(dir, 'runs', d, 'status.json')))
  } catch {
    return null
  }
  const id = typeof named === 'string' ? named : candidates.length === 1 ? candidates[0] : null
  if (!id || !candidates.includes(id) || !fs.existsSync(path.join(dir, 'skills'))) return null
  return id
}

// --- training replay ---------------------------------------------------------

interface Replay {
  slug: string
  statusFile: string
  timers: NodeJS.Timeout[]
  done: boolean
}

let active: Replay | null = null

function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, text)
  fs.renameSync(`${file}.tmp`, file)
}

function listFiles(dir: string, rel = ''): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name)
    if (e.isDirectory()) out.push(...listFiles(dir, r))
    else if (e.isFile()) out.push(r)
  }
  return out
}

/** Score of a run from its run_finished event, if any. */
function runScore(text: string): number | null {
  for (const line of text.trim().split('\n').reverse()) {
    try {
      const ev = JSON.parse(line) as { type?: string; score?: unknown }
      if (ev.type === 'run_finished') return typeof ev.score === 'number' ? ev.score : null
    } catch {
      // skip a torn line
    }
  }
  return null
}

function freshTrainingId(repoRoot: string, slug: string, old: string): string {
  let ms = Date.now()
  while (`${slug}-${ms}` === old || fs.existsSync(path.join(repoRoot, 'runs', `${slug}-${ms}`))) ms += 1
  return `${slug}-${ms}`
}

/**
 * Restores a prebuilt game's cached training under a fresh training id and replays it round by round.
 * Returns the TrainStatus to answer with (the final one when replayMs <= 0), or null when there is no cached training.
 */
export function restoreTraining(repoRoot: string, slug: string, replayMs: number): TrainStatus | null {
  const oldId = cachedTrainingId(repoRoot, slug)
  if (!oldId) return null
  if (active && !active.done && active.slug === slug) {
    const current = readJsonFile(active.statusFile)
    if (current) return current as unknown as TrainStatus // a replay of this game is already on screen
  }
  if (active) active.timers.forEach(clearTimeout)

  const srcRuns = path.join(trainingDir(repoRoot, slug), 'runs', oldId)
  const srcSkills = path.join(trainingDir(repoRoot, slug), 'skills')
  const id = freshTrainingId(repoRoot, slug, oldId)
  const rewrite = (text: string) => text.split(oldId).join(id)
  const runsDir = path.join(repoRoot, 'runs', id)
  const statusFile = path.join(runsDir, 'status.json')
  const final = JSON.parse(rewrite(fs.readFileSync(path.join(srcRuns, 'status.json'), 'utf8'))) as TrainStatus

  // Recorded runs grouped by attempt: run id = <training_id>-l<index>-a<NN>.
  const runRe = new RegExp(`^${oldId}-l(\\d+)-a(\\d+)\\.jsonl$`)
  const rounds = new Map<number, { file: string; level: number; text: string }[]>()
  for (const rel of listFiles(srcRuns)) {
    if (rel === 'status.json') continue
    const text = rewrite(fs.readFileSync(path.join(srcRuns, rel), 'utf8'))
    const m = runRe.exec(rel)
    if (!m) {
      writeAtomic(path.join(runsDir, rewrite(rel)), text) // learning records and anything else: at once
      continue
    }
    const attempt = Number(m[2])
    rounds.set(attempt, [...(rounds.get(attempt) ?? []), { file: rewrite(rel), level: Number(m[1]), text }])
  }
  const order = [...rounds.keys()].sort((a, b) => a - b)
  const levelIndex = new Map((final.levels ?? []).map((lv, i) => [lv.level_id, i + 1]))
  const progress = new Map<number, { done: number; best: number | null }>()

  const status = (): TrainStatus => ({
    ...final,
    status: 'running',
    skills_ready: false,
    levels: (final.levels ?? []).map((lv) => {
      const p = progress.get(levelIndex.get(lv.level_id) ?? -1)
      return { ...lv, attempts_done: p?.done ?? 0, best_score: p?.best ?? null, status: p ? 'running' : 'queued' }
    }),
  })
  const reveal = (attempt: number) => {
    for (const run of rounds.get(attempt) ?? []) {
      writeAtomic(path.join(runsDir, run.file), run.text)
      const p = progress.get(run.level) ?? { done: 0, best: null }
      const score = runScore(run.text)
      progress.set(run.level, { done: p.done + 1, best: score === null ? p.best : Math.max(p.best ?? score, score) })
    }
    writeAtomic(statusFile, JSON.stringify(status(), null, 2))
  }
  const finish = () => {
    for (const e of fs.readdirSync(srcSkills, { withFileTypes: true })) {
      if (!e.isDirectory() || !ID.test(e.name)) continue
      for (const rel of listFiles(path.join(srcSkills, e.name))) {
        writeAtomic(path.join(repoRoot, 'skills', e.name, rel), rewrite(fs.readFileSync(path.join(srcSkills, e.name, rel), 'utf8')))
      }
    }
    writeAtomic(statusFile, JSON.stringify(final, null, 2))
    replay.done = true
  }

  const replay: Replay = { slug, statusFile, timers: [], done: false }
  active = replay
  writeAtomic(statusFile, JSON.stringify(status(), null, 2))
  writeAtomic(path.join(repoRoot, 'runs', 'latest.json'), JSON.stringify({ training_id: id, slug }))
  if (replayMs <= 0 || !order.length) {
    order.forEach(reveal)
    finish()
    return final
  }
  const step = replayMs / order.length
  reveal(order[0])
  order.slice(1).forEach((attempt, i) => replay.timers.push(setTimeout(() => reveal(attempt), step * (i + 1))))
  replay.timers.push(setTimeout(finish, replayMs))
  replay.timers.forEach((t) => t.unref?.())
  return readJsonFile(statusFile) as unknown as TrainStatus
}

// --- routes ------------------------------------------------------------------

const enabled = (ctx: ApiContext) => (ctx.env.PREBUILT_GAMES ?? process.env.PREBUILT_GAMES) !== '0'
const delayMs = (ctx: ApiContext, key: string, fallback: number) => {
  const raw = ctx.env[key] ?? process.env[key]
  const n = Number(raw)
  return raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0 ? n : fallback
}

/** The request again, with its already-read body, for the regular handler. */
function replayRequest(req: IncomingMessage, body: Buffer): IncomingMessage {
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
    const data: unknown = JSON.parse(body.toString('utf8') || '{}')
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
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
      if (!game) return fallthrough(worldRoutes, 'POST', '/api/research')(replayRequest(req, body), res, ctx, params)
      // Walk the loading screen through every step (progress.ts reads artifact mtimes):
      // research found -> world built -> rules checked -> saved, over PREBUILT_DELAY_MS.
      const total = delayMs(ctx, 'PREBUILT_DELAY_MS', 25000)
      const dir = path.join(gamesDir(ctx.repoRoot), game.slug)
      const stages: [string, number][] = [['research.json', 0.3], ['world.json', 0.6], ['graph_report.json', 0.8]]
      let at = 0
      for (const [name, frac] of stages) {
        await new Promise((r) => setTimeout(r, total * frac - at))
        at = total * frac
        const now = new Date()
        try {
          fs.utimesSync(path.join(dir, name), now, now)
        } catch {
          // read-only image: the screen just skips that step
        }
      }
      await new Promise((r) => setTimeout(r, total - at))
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
      const status =
        enabled(ctx) && data.fresh !== true ? restoreTraining(ctx.repoRoot, slug, delayMs(ctx, 'TRAIN_CACHE_REPLAY_MS', 15000)) : null
      if (!status) return fallthrough(trainRoutes, 'POST', '/api/train')(replayRequest(req, body), res, ctx, params)
      sendJson(res, 202, status)
    },
  },
]
