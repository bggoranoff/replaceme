import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { HttpError, readJson, sendJson, type ApiContext, type Route } from './http.ts'

// Owner: world agent. shared/game_contract.md sections b and i.
//   POST /api/research  {prompt} -> {brief, world, slug, branch, graph}  (researcher, then builder)
//   GET  /api/world     ?slug=   -> world.json v2 (games/<slug>/world.json, else git show game/<slug>:games/<slug>/world.json)

const execFileAsync = promisify(execFile)
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PY_TIMEOUT_MS = 10 * 60_000

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function readJsonFile(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function gamesDir(ctx: ApiContext) {
  return path.join(ctx.repoRoot, 'games')
}

/** Newest games/<slug>/<file>, optionally only files written after `since`. */
function newestGameFile(ctx: ApiContext, file: string, since = 0): string | null {
  let best: { slug: string; mtime: number } | null = null
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(gamesDir(ctx), { withFileTypes: true })
  } catch {
    return null
  }
  for (const d of entries) {
    if (!d.isDirectory() || !SLUG.test(d.name)) continue
    try {
      const mtime = fs.statSync(path.join(gamesDir(ctx), d.name, file)).mtimeMs
      if (mtime >= since && (!best || mtime > best.mtime)) best = { slug: d.name, mtime }
    } catch {
      // no such file in this game
    }
  }
  return best?.slug ?? null
}

async function loadWorld(ctx: ApiContext, slug: string): Promise<unknown | null> {
  const local = readJsonFile(path.join(gamesDir(ctx), slug, 'world.json'))
  if (local) return local
  try {
    const { stdout } = await execFileAsync('git', ['show', `game/${slug}:games/${slug}/world.json`], { cwd: ctx.repoRoot, maxBuffer: 20_000_000 })
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function pyEnv(ctx: ApiContext): NodeJS.ProcessEnv {
  return { ...process.env, ...ctx.env }
}

async function runPython(ctx: ApiContext, args: string[], what: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('python3', args, { cwd: ctx.repoRoot, env: pyEnv(ctx), timeout: PY_TIMEOUT_MS, maxBuffer: 50_000_000 })
    return stdout
  } catch (err) {
    const e = err as { stderr?: string; message: string }
    const tail = (e.stderr ?? e.message).trim().split('\n').slice(-3).join(' ')
    throw new HttpError(502, `${what} failed: ${tail}`)
  }
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/world',
    handler: async (req, res, ctx) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const slug = url.searchParams.get('slug') ?? newestGameFile(ctx, 'world.json')
      if (!slug || !SLUG.test(slug)) throw new HttpError(404, 'World not generated yet')
      const world = await loadWorld(ctx, slug)
      if (!world) throw new HttpError(404, `No world for "${slug}"`)
      sendJson(res, 200, world)
    },
  },
  {
    method: 'POST',
    path: '/api/research',
    handler: async (req, res, ctx) => {
      const body = await readJson<{ prompt?: unknown }>(req)
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      if (!prompt) throw new HttpError(400, '"prompt" must be a non-empty string')
      const started = Date.now() - 1000

      await runPython(ctx, ['-m', 'researcher.agent', prompt], 'Researcher')
      const guess = slugify(prompt)
      const fresh = (s: string) => {
        try {
          return fs.statSync(path.join(gamesDir(ctx), s, 'research.json')).mtimeMs >= started
        } catch {
          return false
        }
      }
      const slug = SLUG.test(guess) && fresh(guess) ? guess : newestGameFile(ctx, 'research.json', started)
      if (!slug) throw new HttpError(502, 'Researcher did not write games/<slug>/research.json')

      await runPython(ctx, ['-m', 'builder.agent', '--brief', path.join('games', slug, 'research.json')], 'Builder')
      const brief = readJsonFile(path.join(gamesDir(ctx), slug, 'research.json'))
      const world = readJsonFile(path.join(gamesDir(ctx), slug, 'world.json')) as { slug?: string; branch?: string } | null
      if (!world) throw new HttpError(502, 'Builder did not write games/<slug>/world.json')
      const graph = readJsonFile(path.join(gamesDir(ctx), slug, 'graph_report.json'))
      sendJson(res, 200, { brief, world, slug: world.slug ?? slug, branch: world.branch ?? `game/${slug}`, graph })
    },
  },
]
