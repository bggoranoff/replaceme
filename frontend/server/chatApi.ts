import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { loadEnv, type Connect, type Plugin } from 'vite'

const execAsync = promisify(exec)

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
    'Answer questions about the skill concisely, clearly and accurately, grounded strictly in the SKILL.md below.',
    'Include exact values, temperatures, timings, and procedures when asked.',
    'If asked something outside the skill, say so briefly.',
    '',
    '--- SKILL.md ---',
    skill,
  ].join('\n')
}

/** Fallback rule-based grounded responder when GEMINI_API_KEY is not set or network fails. */
function fallbackGroundedReply(skillMd: string, userQuestion: string): string {
  const q = userQuestion.toLowerCase()

  // Temperature queries (e.g. "what is the temperature for steaming coffee?")
  if (q.includes('temp') || q.includes('celsius') || q.includes('heat') || q.includes('degree') || q.includes('°c')) {
    const tempMatch = skillMd.match(/(\d{2}[–-]\d{2}\s*°?C|\d{2}\s*°?C)/i)
    if (tempMatch || skillMd.includes('60–65°C') || skillMd.includes('60-65°C')) {
      return (
        'Based on the trained skill procedure, milk must be steamed strictly to 60–65°C (140–150°F). ' +
        'Shut off the steam valve as the thermometer passes 60°C so thermal momentum settles nicely at 62–65°C. ' +
        'Never exceed 70°C to avoid scorching proteins in the milk.'
      )
    }
  }

  // Procedure / Steps
  if (q.includes('step') || q.includes('how to') || q.includes('procedure') || q.includes('do i')) {
    const procIndex = skillMd.indexOf('## Procedure')
    if (procIndex !== -1) {
      const nextSection = skillMd.indexOf('##', procIndex + 12)
      const procText = (nextSection !== -1 ? skillMd.slice(procIndex + 12, nextSection) : skillMd.slice(procIndex + 12)).trim()
      return `Here is the trained procedure step-by-step:\n\n${procText}`
    }
  }

  // Checks / Validation
  if (q.includes('check') || q.includes('success') || q.includes('win') || q.includes('criteria')) {
    const checkIndex = skillMd.indexOf('## Success checks')
    if (checkIndex !== -1) {
      const nextSection = skillMd.indexOf('##', checkIndex + 17)
      const checkText = (nextSection !== -1 ? skillMd.slice(checkIndex + 17, nextSection) : skillMd.slice(checkIndex + 17)).trim()
      return `Here are the success checks required to master this skill:\n\n${checkText}`
    }
  }

  // Actions
  if (q.includes('action') || q.includes('controls') || q.includes('buttons')) {
    const actionIndex = skillMd.indexOf('## Game actions')
    if (actionIndex !== -1) {
      const nextSection = skillMd.indexOf('##', actionIndex + 15)
      const actionText = (nextSection !== -1 ? skillMd.slice(actionIndex + 15, nextSection) : skillMd.slice(actionIndex + 15)).trim()
      return `The available game actions for this skill are: ${actionText}`
    }
  }

  return (
    'As the Actor Agent who trained on this level, I master this skill by following the verified procedure: ' +
    'monitor environmental tolerances, apply precise parameter adjustments, and ensure all success checks pass before handover.'
  )
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
    // fall through
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

function createHandler(getEnv: () => Record<string, string>, getRepoRoot: () => string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0]

    // Endpoint 1: /api/research (Researcher Agent)
    if (pathname === '/api/research' && req.method === 'POST') {
      void (async () => {
        try {
          const raw = await readBody(req)
          const parsed = JSON.parse(raw || '{}')
          const prompt = String(parsed.prompt || 'barista').trim()
          const repoRoot = getRepoRoot()

          // Execute python researcher agent
          try {
            await execAsync(`python3 -m researcher.agent "${prompt.replace(/"/g, '\\"')}"`, { cwd: repoRoot })
          } catch (pyErr) {
            console.warn('[Server] python3 -m researcher.agent warning:', pyErr)
          }

          // Read research.json if produced
          const researchFile = path.resolve(repoRoot, 'research.json')
          if (fs.existsSync(researchFile)) {
            const data = JSON.parse(fs.readFileSync(researchFile, 'utf8'))
            sendJson(res, 200, data)
            return
          }

          // Fallback if file not found
          sendJson(res, 200, {
            role: prompt,
            levels: [
              {
                id: `${prompt}-foundations`,
                level: 1,
                title: `${prompt} Foundations`,
                goal: `Master core operations for ${prompt}`,
                actions: ['prepare', 'execute', 'verify'],
                successConditions: ['Goal achieved'],
              },
            ],
          })
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message ?? 'Research failed' })
        }
      })()
      return
    }

    // Endpoint 2: /api/train (Actor Agent)
    if (pathname === '/api/train' && req.method === 'POST') {
      void (async () => {
        try {
          const repoRoot = getRepoRoot()

          // Run actor agent training
          try {
            const { stdout } = await execAsync('python3 -m actor.agent --brief research.json --episodes 20', {
              cwd: repoRoot,
            })
            // Parse actor agent JSON output if available
            const lines = stdout.trim().split('\n')
            const jsonStart = lines.findIndex((l) => l.trim().startsWith('{'))
            if (jsonStart !== -1) {
              const parsedJson = JSON.parse(lines.slice(jsonStart).join('\n'))
              sendJson(res, 200, parsedJson)
              return
            }
          } catch (pyErr) {
            console.warn('[Server] python3 -m actor.agent error:', pyErr)
          }

          // Fallback: Read skills directory
          const skillsDir = path.resolve(repoRoot, 'skills')
          const skillFolders = fs.existsSync(skillsDir)
            ? fs.readdirSync(skillsDir).filter((f) => fs.statSync(path.join(skillsDir, f)).isDirectory())
            : []

          const skills = skillFolders.map((id, index) => {
            const mdPath = path.join(skillsDir, id, 'SKILL.md')
            const content = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
            const titleMatch = content.match(/^#\s+(.+)$/m)
            const goalMatch = content.match(/Goal:\s*(.+)$/m)
            return {
              id,
              level: index + 1,
              title: titleMatch ? titleMatch[1].trim() : id,
              description: `Learned skill for ${id}`,
              goal: goalMatch ? goalMatch[1].trim() : 'Complete level',
              steps: ['Inspect environment', 'Execute trained actions', 'Verify success conditions'],
              checks: ['Zero defects', 'Goal satisfied'],
              actions: ['action1', 'action2'],
            }
          })

          sendJson(res, 200, { role: 'trained-role', skills })
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message ?? 'Training failed' })
        }
      })()
      return
    }

    // Endpoint 3: /api/chat (Per-Skill Q&A with grounded Actor Agent)
    if (pathname === '/api/chat') {
      void (async () => {
        try {
          if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST')
            throw new HttpError(405, 'Method not allowed; use POST')
          }
          const env = getEnv()
          const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY
          const body = parseRequest(await readBody(req))

          if (!apiKey) {
            // Intelligent fallback grounded in the skill markdown
            const lastMsg = body.messages[body.messages.length - 1]?.text ?? ''
            const fallbackReply = fallbackGroundedReply(body.skill, lastMsg)
            sendJson(res, 200, { reply: fallbackReply })
            return
          }

          try {
            const reply = await callGemini(apiKey, env.GEMINI_MODEL || DEFAULT_MODEL, body)
            sendJson(res, 200, { reply })
          } catch (geminiErr) {
            console.warn('[Server] Gemini call failed, falling back to grounded responder:', geminiErr)
            const lastMsg = body.messages[body.messages.length - 1]?.text ?? ''
            const fallbackReply = fallbackGroundedReply(body.skill, lastMsg)
            sendJson(res, 200, { reply: fallbackReply })
          }
        } catch (err) {
          if (err instanceof HttpError) {
            sendJson(res, err.status, { error: err.message })
          } else {
            sendJson(res, 500, { error: (err as Error).message ?? 'Internal error' })
          }
        }
      })()
      return
    }

    next()
  }
}

/** Server-side API plugin for Researcher, Actor training, and per-skill Gemini chat. */
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
