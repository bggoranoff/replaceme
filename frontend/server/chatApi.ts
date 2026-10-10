import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadEnv, type Connect, type Plugin } from 'vite'
import { dispatch } from './api/index.ts'

const execFileAsync = promisify(execFile)

const MAX_BODY_BYTES = 2_000_000

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function createHandler(getEnv: () => Record<string, string>, getRepoRoot: () => string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (dispatch(req, res, { repoRoot: getRepoRoot(), env: getEnv() })) return
    const pathname = (req.url ?? '').split('?')[0]

    // Endpoint 1: /api/research (Researcher + Builder Agents)
    if (pathname === '/api/research' && req.method === 'POST') {
      void (async () => {
        try {
          const raw = await readBody(req)
          const parsed = JSON.parse(raw || '{}')
          const prompt = String(parsed.prompt || 'barista').trim()
          const repoRoot = getRepoRoot()

          // 1. Execute python researcher agent to produce scenarios
          try {
            await execFileAsync('python3', ['-m', 'researcher.agent', prompt], { cwd: repoRoot, env: { ...process.env, ...getEnv() } })
          } catch (pyErr) {
            console.warn('[Server] python3 -m researcher.agent warning:', pyErr)
          }

          // 2. Execute python builder agent to synthesize the playable world & Entire branch
          try {
            await execFileAsync('python3', ['-m', 'builder.agent', '--brief', 'research.json'], { cwd: repoRoot, env: { ...process.env, ...getEnv() } })
          } catch (pyErr) {
            console.warn('[Server] python3 -m builder.agent warning:', pyErr)
          }

          // Read research.json & world.json if produced
          const researchFile = path.resolve(repoRoot, 'research.json')
          const worldFile = path.resolve(repoRoot, 'world.json')

          let briefData: any = null
          let worldData: any = null

          if (fs.existsSync(researchFile)) {
            briefData = JSON.parse(fs.readFileSync(researchFile, 'utf8'))
          }
          if (fs.existsSync(worldFile)) {
            worldData = JSON.parse(fs.readFileSync(worldFile, 'utf8'))
          }

          sendJson(res, 200, {
            brief: briefData,
            world: worldData,
            role: prompt,
            levels: briefData?.levels || worldData?.levels || [],
          })
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message ?? 'Research failed' })
        }
      })()
      return
    }

    // Endpoint 1b: /api/world (Get current world specification)
    if (pathname === '/api/world' && req.method === 'GET') {
      const repoRoot = getRepoRoot()
      const worldFile = path.resolve(repoRoot, 'world.json')
      if (fs.existsSync(worldFile)) {
        const worldData = JSON.parse(fs.readFileSync(worldFile, 'utf8'))
        sendJson(res, 200, worldData)
        return
      }
      sendJson(res, 404, { error: 'World not generated yet' })
      return
    }

    // Endpoint 2: /api/train (Actor Agent)
    if (pathname === '/api/train' && req.method === 'POST') {
      void (async () => {
        try {
          const repoRoot = getRepoRoot()
          const parsedBody = JSON.parse((await readBody(req)) || '{}')

          // Train on the brief this client researched; fall back to the shared research.json.
          let briefPath = 'research.json'
          let tempDir: string | undefined
          const brief = parsedBody.brief
          if (brief && typeof brief === 'object' && Array.isArray(brief.levels) && brief.levels.length > 0) {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replaceme-brief-'))
            briefPath = path.join(tempDir, 'research.json')
            fs.writeFileSync(briefPath, JSON.stringify(brief))
          }

          // Run actor agent training; a failed run is an error, never stale or placeholder skills.
          try {
            const { stdout } = await execFileAsync('python3', ['-m', 'actor.agent', '--brief', briefPath, '--episodes', '20'], {
              cwd: repoRoot,
              env: { ...process.env, ...getEnv() },
            })
            const lines = stdout.trim().split('\n')
            const jsonStart = lines.findIndex((l) => l.trim().startsWith('{'))
            const result = jsonStart !== -1 ? JSON.parse(lines.slice(jsonStart).join('\n')) : null
            if (!result || !Array.isArray(result.skills) || result.skills.length === 0) {
              throw new HttpError(502, 'Actor agent produced no skills')
            }
            sendJson(res, 200, result)
          } catch (pyErr) {
            console.warn('[Server] python3 -m actor.agent error:', pyErr)
            sendJson(res, pyErr instanceof HttpError ? pyErr.status : 502, {
              error: pyErr instanceof HttpError ? pyErr.message : 'Actor agent failed',
            })
          } finally {
            if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
          }
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message ?? 'Training failed' })
        }
      })()
      return
    }

    next()
  }
}

/** Server-side API plugin for Researcher and Actor training; feature routes come from ./api (skills chat in api/skills.ts). */
export function chatApi(): Plugin {
  let mode = 'development'
  let repoRoot = path.resolve(process.cwd(), '..')
  const getEnv = () => loadEnv(mode, repoRoot, '')
  const getRepoRoot = () => repoRoot

  return {
    name: 'replaceme-chat-api',
    configResolved(config) {
      mode = config.mode
      repoRoot = path.resolve(config.root, '..') // frontend/.. = replaceme/
    },
    configureServer(server) {
      server.middlewares.use(createHandler(getEnv, getRepoRoot))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHandler(getEnv, getRepoRoot))
    },
  }
}
