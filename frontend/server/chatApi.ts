import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { loadEnv, type Connect, type Plugin } from 'vite'

type ChatRole = 'user' | 'model'
interface ChatMessage {
  role: ChatRole
  text: string
}
interface ChatRequest {
  skill: string
  messages: ChatMessage[]
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

const DEFAULT_MODEL = 'gemini-2.5-flash'
const MAX_BODY_BYTES = 1_000_000

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

function parseRequest(raw: string): ChatRequest {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'Body must be valid JSON')
  }
  if (typeof data !== 'object' || data === null) {
    throw new HttpError(400, 'Body must be a JSON object')
  }
  const { skill, messages } = data as Record<string, unknown>
  if (typeof skill !== 'string' || skill.trim() === '') {
    throw new HttpError(400, '"skill" must be a non-empty string')
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, '"messages" must be a non-empty array')
  }
  for (const m of messages) {
    if (
      typeof m !== 'object' ||
      m === null ||
      (m.role !== 'user' && m.role !== 'model') ||
      typeof m.text !== 'string'
    ) {
      throw new HttpError(400, 'Each message must be { role: "user" | "model", text: string }')
    }
  }
  return { skill, messages: messages as ChatMessage[] }
}

function systemInstruction(skill: string): string {
  return [
    'You are the replaceme actor agent. You learned the skill described below by passing a game level, and you are now explaining that skill.',
    'Answer questions about the skill concisely, grounded in the SKILL.md below.',
    'If asked something outside the skill, say so briefly.',
    '',
    '--- SKILL.md ---',
    skill,
  ].join('\n')
}

async function callGemini(apiKey: string, model: string, req: ChatRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction(req.skill) }] },
        contents: req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      }),
    })
  } catch (err) {
    throw new HttpError(502, `Gemini request failed: ${(err as Error).message}`)
  }

  let data: GeminiResponse = {}
  try {
    data = (await upstream.json()) as GeminiResponse
  } catch {
    // fall through with empty data
  }
  if (!upstream.ok) {
    const detail = data.error?.message ?? upstream.statusText
    throw new HttpError(502, `Gemini error (${upstream.status}): ${detail}`)
  }
  const reply = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!reply) {
    throw new HttpError(502, 'Gemini returned an empty response')
  }
  return reply
}

function createHandler(getEnv: () => Record<string, string>): Connect.NextHandleFunction {
  return (req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0]
    if (pathname !== '/api/chat') return next()

    void (async () => {
      try {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          throw new HttpError(405, 'Method not allowed; use POST')
        }
        const env = getEnv()
        const apiKey = env.GEMINI_API_KEY
        if (!apiKey) {
          throw new HttpError(503, 'GEMINI_API_KEY is not set in replaceme/.env')
        }
        const body = parseRequest(await readBody(req))
        const reply = await callGemini(apiKey, env.GEMINI_MODEL || DEFAULT_MODEL, body)
        sendJson(res, 200, { reply })
      } catch (err) {
        if (err instanceof HttpError) {
          sendJson(res, err.status, { error: err.message })
        } else {
          sendJson(res, 500, { error: (err as Error).message ?? 'Internal error' })
        }
      }
    })()
  }
}

/** Server-side Gemini chat endpoint (POST /api/chat). The API key never reaches the client. */
export function chatApi(): Plugin {
  let mode = 'development'
  let repoRoot = path.resolve(process.cwd(), '..')
  // Re-read on each request so editing .env doesn't require a restart.
  const getEnv = () => loadEnv(mode, repoRoot, '')

  return {
    name: 'replaceme-chat-api',
    configResolved(config) {
      mode = config.mode
      repoRoot = path.resolve(config.root, '..') // frontend/.. = replaceme/
    },
    configureServer(server) {
      server.middlewares.use(createHandler(getEnv))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHandler(getEnv))
    },
  }
}
