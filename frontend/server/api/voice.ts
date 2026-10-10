import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { HttpError, readBody, readJson, sendJson, type ApiContext, type ApiHandler, type Route } from './http.ts'

// Owner: voice agent. shared/game_contract.md section h. GRADIUM_API_KEY stays server-side.
//   POST /api/stt   body: audio (Content-Type audio/webm|audio/wav|...) -> {text}
//   POST /api/tts   {text, voice?} -> audio bytes (Content-Type audio/wav)
// Gradium REST docs: https://docs.gradium.ai/api-reference/endpoint/stt-post, .../tts-post

const execFileAsync = promisify(execFile)

const DEFAULT_BASE_URL = 'https://api.gradium.ai/api'
/** Voice used when the request names none, or when Gradium rejects the requested one. */
export const DEFAULT_VOICE = 'YTpq7expH9539ERJ'
const VOICE_ID = /^[A-Za-z0-9_-]{1,64}$/
const STT_LANGUAGE = 'en'
const MAX_STT_BYTES = 10_000_000
const MAX_TTS_CHARS = 1000
const MAX_CACHE_BYTES = 64 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 30_000

/** Content types Gradium STT accepts directly; anything else is converted to WAV with ffmpeg. */
const STT_NATIVE_TYPES: Record<string, string> = {
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/pcm': 'audio/pcm',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/opus',
}

function gradiumKey(ctx: ApiContext): string {
  const key = ctx.env.GRADIUM_API_KEY?.trim()
  if (!key) throw new HttpError(503, 'Voice is not configured: GRADIUM_API_KEY is missing')
  return key
}

/** GRADIUM_BASE_URL overrides the API host (the tests point it at a mock). */
function baseUrl(ctx: ApiContext): string {
  return (ctx.env.GRADIUM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/** Gradium answered with an error status (bad key, unknown voice, undecodable audio, ...). */
class GradiumRejected extends HttpError {}

async function callGradium(kind: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch (err) {
    throw new HttpError(502, `Gradium ${kind} request failed: ${(err as Error).message}`)
  }
  if (res.status === 401 || res.status === 403) {
    // A wrong or expired key is the same as no key for the browser: voice is unavailable, typing still works.
    throw new HttpError(503, 'Voice is not configured: Gradium rejected GRADIUM_API_KEY')
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).trim().slice(0, 200) || res.statusText
    throw new GradiumRejected(502, `Gradium ${kind} error (${res.status}): ${detail}`)
  }
  return res
}

// ---------- STT ----------

/** Browser recordings (webm, mp4, ...) become 24 kHz mono 16-bit WAV. */
async function convertToWav(audio: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'replaceme-stt-'))
  const input = path.join(dir, 'input')
  const output = path.join(dir, 'output.wav')
  try {
    await fs.writeFile(input, audio)
    await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', input, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', output])
    return await fs.readFile(output)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new HttpError(415, 'Unsupported audio type; send audio/wav, audio/ogg or audio/pcm')
    }
    throw new HttpError(400, 'Could not decode the recorded audio')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

/** Joins the `text` messages of Gradium's NDJSON transcript stream. */
function parseTranscript(ndjson: string): string {
  const parts: string[] = []
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue
    let msg: { type?: string; text?: string; message?: string }
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    if (msg.type === 'error') throw new HttpError(502, `Gradium STT error: ${msg.message ?? 'transcription failed'}`)
    if (msg.type === 'text' && typeof msg.text === 'string') parts.push(msg.text)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const stt: ApiHandler = async (req, res, ctx) => {
  const key = gradiumKey(ctx)
  let audio = await readBody(req, MAX_STT_BYTES)
  if (audio.length === 0) throw new HttpError(400, 'Request body must be the recorded audio')

  const type = (req.headers['content-type'] ?? 'audio/wav').split(';')[0].trim().toLowerCase()
  let contentType = STT_NATIVE_TYPES[type]
  if (!contentType) {
    audio = await convertToWav(audio)
    contentType = 'audio/wav'
  }

  const query = new URLSearchParams({ json_config: JSON.stringify({ language: STT_LANGUAGE }) })
  const upstream = await callGradium('STT', `${baseUrl(ctx)}/post/speech/asr?${query}`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': contentType },
    body: new Uint8Array(audio),
  })
  sendJson(res, 200, { text: parseTranscript(await upstream.text()) })
}

// ---------- TTS ----------

async function synthesize(ctx: ApiContext, key: string, text: string, voice: string): Promise<Buffer> {
  const upstream = await callGradium('TTS', `${baseUrl(ctx)}/post/speech/tts`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voice, output_format: 'wav', only_audio: true }),
  })
  const audio = Buffer.from(await upstream.arrayBuffer())
  if (audio.subarray(0, 4).toString('latin1') !== 'RIFF') {
    throw new GradiumRejected(502, 'Gradium TTS returned no audio')
  }
  return audio
}

// Identical {text, voice} requests are served from memory (LRU by insertion order) and share one upstream call.
const cache = new Map<string, Buffer>()
const inflight = new Map<string, Promise<Buffer>>()
let cacheBytes = 0

function remember(id: string, audio: Buffer): void {
  cache.set(id, audio)
  cacheBytes += audio.length
  for (const [oldId, old] of cache) {
    if (cacheBytes <= MAX_CACHE_BYTES) break
    cache.delete(oldId)
    cacheBytes -= old.length
  }
}

function speech(ctx: ApiContext, key: string, text: string, voice: string): Promise<Buffer> {
  const id = createHash('sha256').update(`${voice}\n${text}`).digest('hex')
  const hit = cache.get(id)
  if (hit) {
    cache.delete(id)
    cache.set(id, hit)
    return Promise.resolve(hit)
  }
  let pending = inflight.get(id)
  if (!pending) {
    pending = synthesize(ctx, key, text, voice)
      .catch((err: unknown) => {
        // A world may name a voice Gradium does not know; fall back so the line is still voiced.
        if (voice === DEFAULT_VOICE || !(err instanceof GradiumRejected)) throw err
        return synthesize(ctx, key, text, DEFAULT_VOICE)
      })
      .then((audio) => {
        remember(id, audio)
        return audio
      })
      .finally(() => inflight.delete(id))
    inflight.set(id, pending)
  }
  return pending
}

const tts: ApiHandler = async (req, res, ctx) => {
  const key = gradiumKey(ctx)
  const body = await readJson<{ text?: unknown; voice?: unknown }>(req)
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : ''
  if (!text) throw new HttpError(400, '"text" must be a non-empty string')
  if (text.length > MAX_TTS_CHARS) throw new HttpError(400, `"text" must be at most ${MAX_TTS_CHARS} characters`)

  let voice = DEFAULT_VOICE
  if (body.voice !== undefined && body.voice !== null && body.voice !== '') {
    if (typeof body.voice !== 'string' || !VOICE_ID.test(body.voice)) {
      throw new HttpError(400, '"voice" must be a Gradium voice id')
    }
    voice = body.voice
  }

  const audio = await speech(ctx, key, text, voice)
  res.statusCode = 200
  res.setHeader('Content-Type', 'audio/wav')
  res.setHeader('Content-Length', audio.length)
  res.end(audio)
}

export const routes: Route[] = [
  { method: 'POST', path: '/api/stt', handler: stt },
  { method: 'POST', path: '/api/tts', handler: tts },
]
