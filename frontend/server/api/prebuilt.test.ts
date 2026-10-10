// Run: cd frontend && node --test server/api/prebuilt.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { dispatch } from './index.ts'
import { cachedTrainingId, prebuiltGame } from './prebuilt.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prebuilt-test-'))
const write = (rel: string, data: unknown) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), typeof data === 'string' ? data : JSON.stringify(data))
}
const level = (i: number) => ({ id: `demo-job-t${i}`, index: i, title: `Task ${i}` })
write('games/demo-job/research.json', { version: 2, job: 'Demo job', slug: 'demo-job', tasks: [{ id: 't1' }] })
write('games/demo-job/world.json', { version: 2, slug: 'demo-job', branch: 'game/demo-job', levels: [1, 2, 3, 4].map(level) })
write('games/demo-job/graph_report.json', { ok: true, violations: [] })
const tid = 'demo-job-1700000000000'
write('games/demo-job/training/training.json', { training_id: tid, slug: 'demo-job' })
write(`games/demo-job/training/runs/${tid}/status.json`, { training_id: tid, status: 'done', slug: 'demo-job', levels: [], skills_ready: true })
write(`games/demo-job/training/runs/${tid}/${tid}-l1-a01.jsonl`, '{"seq":1}\n')
write('games/demo-job/training/skills/demo-job-t1/skill.json', { version: 2, id: 'demo-job-t1' })
write('games/half-done/research.json', { version: 2, slug: 'half-done', tasks: [] }) // no world.json: not prebuilt

let server: http.Server
let base = ''
before(async () => {
  server = http.createServer((req, res) => {
    if (!dispatch(req, res, { repoRoot: root, env: { PREBUILT_DELAY_MS: '0', TRAIN_CACHE_REPLAY_MS: '0' } })) {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
after(() => {
  server.close()
  fs.rmSync(root, { recursive: true, force: true })
})

test('a complete games/<slug>/ is a prebuilt game; an incomplete one is not', () => {
  assert.equal(prebuiltGame(root, 'demo-job')?.branch, 'game/demo-job')
  assert.equal(prebuiltGame(root, 'half-done'), null)
  assert.equal(prebuiltGame(root, '../etc'), null)
  assert.equal(cachedTrainingId(root, 'demo-job'), tid)
  assert.equal(cachedTrainingId(root, 'half-done'), null)
})

test('POST /api/research serves the prebuilt game without running the researcher', async () => {
  const res = await fetch(`${base}/api/research`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Demo Job' }) })
  assert.equal(res.status, 200)
  const body = (await res.json()) as { slug: string; branch: string; world: { levels: unknown[] }; graph: { ok: boolean }; prebuilt: boolean }
  assert.equal(body.slug, 'demo-job')
  assert.equal(body.branch, 'game/demo-job')
  assert.equal(body.world.levels.length, 4)
  assert.equal(body.graph.ok, true)
  assert.equal(body.prebuilt, true)
})

test('POST /api/train restores the cached training into runs/ and skills/', async () => {
  const res = await fetch(`${base}/api/train`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'demo-job' }) })
  assert.equal(res.status, 202)
  const status = (await res.json()) as { training_id: string; skills_ready: boolean }
  assert.equal(status.training_id, tid)
  assert.equal(status.skills_ready, true)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'runs/latest.json'), 'utf8')), { training_id: tid, slug: 'demo-job' })
  assert.ok(fs.existsSync(path.join(root, 'runs', tid, `${tid}-l1-a01.jsonl`)))
  assert.ok(fs.existsSync(path.join(root, 'skills/demo-job-t1/skill.json')))
  const runs = (await (await fetch(`${base}/api/runs?training_id=${tid}`)).json()) as { runs: unknown[] }
  assert.ok(Array.isArray(runs.runs))
})

test('other slugs fall through to the regular train handler', async () => {
  const res = await fetch(`${base}/api/train`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'Not A Slug' }) })
  assert.equal(res.status, 400) // train.ts validates the slug: the body reached it intact
})
