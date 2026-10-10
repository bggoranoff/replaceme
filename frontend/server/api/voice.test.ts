// Tests for POST /api/stt and POST /api/tts against a mock Gradium server.
// Run from frontend/: node --test server/api/voice.test.ts
// The live TTS -> STT round trip also runs when the repo .env has GRADIUM_API_KEY.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { parseEnv } from 'node:util'
import { dispatch } from './index.ts'

const KEY = 'test-key-not-real-123'
const repoRoot = path.resolve(import.meta.dirname, '../../..')

function wav(seconds = 0.2, sampleRate = 24_000): Buffer {
  const samples = Math.round(seconds * sampleRate)
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0, 'latin1')
  buf.writeUInt32LE(36 + samples * 2, 4)
  buf.write('WAVEfmt ', 8, 'latin1')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'latin1')
  buf.writeUInt32LE(samples * 2, 40)
  return buf
}

interface Call {
  path: string
  key: string | undefined
  contentType: string | undefined
  query: URLSearchParams
  body: Buffer
}

const calls: Call[] = []
let mock: http.Server
let api: http.Server
let keyless: http.Server
let apiUrl = ''
let keylessUrl = ''

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  })
}

function apiServer(env: Record<string, string>): http.Server {
  return http.createServer((req, res) => {
    if (!dispatch(req, res, { repoRoot, env })) {
      res.statusCode = 404
      res.end()
    }
  })
}

before(async () => {
  mock = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://mock')
      const call: Call = {
        path: url.pathname,
        key: req.headers['x-api-key'] as string | undefined,
        contentType: req.headers['content-type'],
        query: url.searchParams,
        body: Buffer.concat(chunks),
      }
      calls.push(call)
      if (call.key !== KEY) {
        res.statusCode = 500
        return res.end('error from server 1008: invalid api key')
      }
      if (url.pathname === '/api/post/speech/tts') {
        const { voice_id, output_format, only_audio } = JSON.parse(call.body.toString('utf8'))
        if (voice_id === 'NoSuchVoice') {
          res.statusCode = 500
          return res.end('error from server 1003: voice not found')
        }
        assert.equal(output_format, 'wav')
        assert.equal(only_audio, true)
        res.setHeader('Content-Type', 'audio/wav')
        // Slow enough that concurrent identical requests overlap.
        setTimeout(() => res.end(wav()), 50)
        return
      }
      if (url.pathname === '/api/post/speech/asr') {
        if (call.body.subarray(0, 4).toString('latin1') !== 'RIFF') {
          res.statusCode = 500
          return res.end('unsupported audio')
        }
        res.setHeader('Content-Type', 'application/x-ndjson')
        return res.end(
          [
            { type: 'text', text: 'pastry', start_s: 0.1, stream_id: 0 },
            { type: 'end_text', stop_s: 0.4, stream_id: 0 },
            { type: 'text', text: ' chef ', start_s: 0.5, stream_id: 0 },
            { type: 'end_text', stop_s: 0.9, stream_id: 0 },
          ]
            .map((m) => JSON.stringify(m))
            .join('\n') + '\n',
        )
      }
      res.statusCode = 404
      res.end('not found')
    })
  })
  const mockUrl = await listen(mock)
  api = apiServer({ GRADIUM_API_KEY: KEY, GRADIUM_BASE_URL: `${mockUrl}/api` })
  keyless = apiServer({})
  apiUrl = await listen(api)
  keylessUrl = await listen(keyless)
})

after(() => {
  mock.close()
  api.close()
  keyless.close()
})

const tts = (base: string, body: unknown) =>
  fetch(`${base}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const ttsCalls = (text: string) =>
  calls.filter((c) => c.path === '/api/post/speech/tts' && JSON.parse(c.body.toString('utf8')).text === text)

test('tts returns wav audio and caches identical requests', async () => {
  const text = 'Could you fetch the crates from the barn?'
  const first = await tts(apiUrl, { text, voice: 'r2sIQdqqoqgRJuXw' })
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('content-type'), 'audio/wav')
  const audio = Buffer.from(await first.arrayBuffer())
  assert.equal(audio.subarray(0, 4).toString('latin1'), 'RIFF')
  assert.equal(ttsCalls(text)[0].key, KEY)
  assert.equal(JSON.parse(ttsCalls(text)[0].body.toString('utf8')).voice_id, 'r2sIQdqqoqgRJuXw')

  const again = await tts(apiUrl, { text, voice: 'r2sIQdqqoqgRJuXw' })
  assert.deepEqual(Buffer.from(await again.arrayBuffer()), audio)
  assert.equal(ttsCalls(text).length, 1, 'identical request is served from cache')

  await (await tts(apiUrl, { text, voice: 'NbpkqMVS3CJeq2j8' })).arrayBuffer()
  assert.equal(ttsCalls(text).length, 2, 'another voice is a different request')
})

test('concurrent identical tts requests share one upstream call', async () => {
  const text = 'The market opens at dawn.'
  const results = await Promise.all([1, 2, 3].map(() => tts(apiUrl, { text })))
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200, 200],
  )
  assert.equal(ttsCalls(text).length, 1)
  assert.equal(JSON.parse(ttsCalls(text)[0].body.toString('utf8')).voice_id, 'YTpq7expH9539ERJ', 'default voice')
})

test('tts falls back to the default voice when Gradium rejects the voice', async () => {
  const text = 'Welcome back, neighbour.'
  const res = await tts(apiUrl, { text, voice: 'NoSuchVoice' })
  assert.equal(res.status, 200)
  assert.deepEqual(
    ttsCalls(text).map((c) => JSON.parse(c.body.toString('utf8')).voice_id),
    ['NoSuchVoice', 'YTpq7expH9539ERJ'],
  )
})

test('tts validates its input', async () => {
  assert.equal((await tts(apiUrl, { text: '   ' })).status, 400)
  assert.equal((await tts(apiUrl, { text: 'x'.repeat(1001) })).status, 400)
  assert.equal((await tts(apiUrl, { text: 'hi', voice: 'bad voice!' })).status, 400)
  const notJson = await fetch(`${apiUrl}/api/tts`, { method: 'POST', body: '{nope' })
  assert.equal(notJson.status, 400)
})

test('stt forwards wav with an English config and joins the transcript', async () => {
  const res = await fetch(`${apiUrl}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav() })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { text: 'pastry chef' })
  const call = calls.filter((c) => c.path === '/api/post/speech/asr').at(-1)!
  assert.equal(call.contentType, 'audio/wav')
  assert.equal(call.key, KEY)
  assert.deepEqual(JSON.parse(call.query.get('json_config') ?? '{}'), { language: 'en' })
})

test('stt converts browser webm recordings to wav', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-test-'))
  const file = path.join(dir, 'clip.webm')
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:a', 'libopus', file])
  } catch {
    fs.rmSync(dir, { recursive: true, force: true })
    return t.skip('ffmpeg with libopus is not installed')
  }
  const res = await fetch(`${apiUrl}/api/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/webm;codecs=opus' },
    body: fs.readFileSync(file),
  })
  fs.rmSync(dir, { recursive: true, force: true })
  assert.equal(res.status, 200)
  const call = calls.filter((c) => c.path === '/api/post/speech/asr').at(-1)!
  assert.equal(call.contentType, 'audio/wav')
  assert.equal(call.body.readUInt32LE(24), 24_000, '24 kHz')
  assert.equal(call.body.readUInt16LE(22), 1, 'mono')
})

test('stt rejects an empty body', async () => {
  const res = await fetch(`${apiUrl}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' } })
  assert.equal(res.status, 400)
})

test('without GRADIUM_API_KEY both routes answer 503', async () => {
  assert.equal((await tts(keylessUrl, { text: 'hello' })).status, 503)
  const stt = await fetch(`${keylessUrl}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav() })
  assert.equal(stt.status, 503)
  assert.match(((await stt.json()) as { error: string }).error, /GRADIUM_API_KEY/)
})

test('upstream errors become 502 and never echo the key', async () => {
  const bad = apiServer({ GRADIUM_API_KEY: 'wrong-key-xyz', GRADIUM_BASE_URL: `http://127.0.0.1:${(mock.address() as AddressInfo).port}/api` })
  const url = await listen(bad)
  try {
    const res = await tts(url, { text: 'A line nobody has asked for yet.' })
    assert.equal(res.status, 502)
    const body = await res.text()
    assert.match(body, /Gradium TTS error \(500\)/)
    assert.ok(!body.includes('wrong-key-xyz'))
  } finally {
    bad.close()
  }
})

test('live Gradium TTS -> STT round trip', async (t) => {
  const envFile = path.join(repoRoot, '.env')
  const key = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')).GRADIUM_API_KEY?.trim() : ''
  if (!key) return t.skip('GRADIUM_API_KEY is empty in the repo .env')
  const live = apiServer({ GRADIUM_API_KEY: key })
  const url = await listen(live)
  try {
    const spoken = await tts(url, { text: 'I would like to replace a gardener.' })
    assert.equal(spoken.status, 200, await spoken.clone().text())
    const audio = Buffer.from(await spoken.arrayBuffer())
    const heard = await fetch(`${url}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio })
    assert.equal(heard.status, 200)
    const { text } = (await heard.json()) as { text: string }
    assert.match(text.toLowerCase(), /gardener/)
  } finally {
    live.close()
  }
})
