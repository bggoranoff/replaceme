// Run: cd frontend && node --test server/api/prebuilt.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { TrainStatus } from '../../src/contract.ts'
import { dispatch } from './index.ts'
import { cachedTrainingId, prebuiltGame, restoreTraining } from './prebuilt.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prebuilt-test-'))
const write = (rel: string, data: unknown) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), typeof data === 'string' ? data : JSON.stringify(data))
}
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

function game(slug: string, marker: Record<string, unknown> | null, ok = true) {
  const levels = [1, 2, 3, 4].map((i) => ({ id: `${slug}-t${i}`, index: i, title: `Task ${i}` }))
  if (marker) write(`games/${slug}/prebuilt.json`, marker)
  write(`games/${slug}/research.json`, { version: 2, job: slug, slug, tasks: [{ id: 't1' }] })
  write(`games/${slug}/world.json`, { version: 2, slug, branch: `game/${slug}`, levels })
  write(`games/${slug}/graph_report.json`, { ok, violations: [] })
}

game('demo-job', { slug: 'demo-job', aliases: ['Demo worker'] })
game('generated-job', null) // a complete but ordinary generated game: never served from the cache
game('failed-job', { slug: 'failed-job' }, false)

// Cached training: 2 levels x 2 attempts, recorded under an old training id.
const oldId = 'demo-job-1700000000000'
const T = `games/demo-job/training/runs/${oldId}`
const levelsStatus = [1, 2].map((i) => ({ level_id: `demo-job-t${i}`, level_title: `Task ${i}`, attempts_done: 2, attempts_total: 2, best_score: 90 + i, status: 'done' }))
write(`${T}/status.json`, { training_id: oldId, status: 'done', slug: 'demo-job', levels: levelsStatus, skills_ready: true })
write(`${T}/learning/demo-job-t1.json`, { level_id: 'demo-job-t1', attempts: [{ attempt: 1, run_id: `${oldId}-l1-a01` }] })
for (const l of [1, 2])
  for (const a of [1, 2]) {
    const run = `${oldId}-l${l}-a0${a}`
    const events = [
      { seq: 1, type: 'run_started', at: 'x', run: { id: run, training_id: oldId, level_id: `demo-job-t${l}`, level_index: l, level_title: `Task ${l}`, attempt: a } },
      { seq: 2, type: 'run_finished', at: 'x', status: 'passed', score: 40 * a + l, result: null, inputs: {} },
    ]
    write(`${T}/${run}.jsonl`, events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  }
write('games/demo-job/training/skills/demo-job-t1/skill.json', { version: 2, id: 'demo-job-t1', name: 'Task 1', level_index: 1, learned_parameters: [], updated_at: 'x', attempts: [{ run_id: `${oldId}-l1-a01` }], tool_mappings: { pos: 'POST /v2/orders' } })
write('games/demo-job/training/skills/demo-job-t1/SKILL.md', `# Skill\n\nrun ${oldId}-l1-a01\n`)

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

const post = (p: string, body: unknown) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('only a marked, complete games/<slug>/ that passed the rules check is a prebuilt game', () => {
  assert.equal(prebuiltGame(root, 'demo-job')?.branch, 'game/demo-job')
  assert.equal(prebuiltGame(root, 'demo-worker')?.slug, 'demo-job') // alias from prebuilt.json
  assert.equal(prebuiltGame(root, 'generated-job'), null)
  assert.equal(prebuiltGame(root, 'failed-job'), null)
  assert.equal(prebuiltGame(root, 'missing'), null)
  assert.equal(prebuiltGame(root, '../etc'), null)
  assert.equal(cachedTrainingId(root, 'demo-job'), oldId)
  assert.equal(cachedTrainingId(root, 'demo-worker'), null) // training is keyed by the game's own slug
  assert.equal(cachedTrainingId(root, 'generated-job'), null)
})

test('POST /api/research serves the prebuilt game without running the researcher', async () => {
  const res = await post('/api/research', { prompt: '  Demo Job ' })
  assert.equal(res.status, 200)
  const body = (await res.json()) as { slug: string; branch: string; world: { levels: unknown[] }; graph: { ok: boolean }; brief: { slug: string }; prebuilt: boolean }
  assert.equal(body.slug, 'demo-job')
  assert.equal(body.branch, 'game/demo-job')
  assert.equal(body.world.levels.length, 4)
  assert.equal(body.brief.slug, 'demo-job')
  assert.equal(body.graph.ok, true)
  assert.equal(body.prebuilt, true)
})

test('POST /api/train restores the cached training under a fresh training id', async () => {
  const res = await post('/api/train', { slug: 'demo-job' })
  assert.equal(res.status, 202)
  const status = (await res.json()) as TrainStatus
  const id = status.training_id as string
  assert.match(id, /^demo-job-\d+$/)
  assert.notEqual(id, oldId)
  assert.equal(status.status, 'done')
  assert.equal(status.skills_ready, true)
  assert.deepEqual(read('runs/latest.json'), { training_id: id, slug: 'demo-job' })
  assert.equal(read(`runs/${id}/status.json`).training_id, id)
  assert.equal(read(`runs/${id}/learning/demo-job-t1.json`).attempts[0].run_id, `${id}-l1-a01`)
  const skill = read('skills/demo-job-t1/skill.json')
  assert.equal(skill.attempts[0].run_id, `${id}-l1-a01`)
  assert.deepEqual(skill.tool_mappings, { pos: 'POST /v2/orders' })
  assert.ok(fs.readFileSync(path.join(root, 'skills/demo-job-t1/SKILL.md'), 'utf8').includes(`${id}-l1-a01`))
  const runs = (await (await fetch(`${base}/api/runs?training_id=${id}`)).json()) as { runs: { id: string; score: number }[] }
  assert.deepEqual(runs.runs.map((r) => r.id).sort(), [`${id}-l1-a01`, `${id}-l1-a02`, `${id}-l2-a01`, `${id}-l2-a02`])
  const train = (await (await fetch(`${base}/api/train/status`)).json()) as TrainStatus
  assert.equal(train.training_id, id)
  const skills = (await (await fetch(`${base}/api/skills`)).json()) as { skills: { id: string }[] }
  assert.deepEqual(skills.skills.map((s) => s.id), ['demo-job-t1'])
})

test('a timed replay reveals the recorded attempts round by round, then the skills', async () => {
  fs.rmSync(path.join(root, 'skills'), { recursive: true, force: true })
  const first = restoreTraining(root, 'demo-job', 150) as TrainStatus
  const id = first.training_id as string
  assert.equal(first.status, 'running')
  assert.equal(first.skills_ready, false)
  assert.deepEqual(first.levels.map((l) => [l.attempts_done, l.best_score]), [[1, 41], [1, 42]])
  assert.ok(fs.existsSync(path.join(root, 'runs', id, `${id}-l1-a01.jsonl`)))
  assert.ok(!fs.existsSync(path.join(root, 'runs', id, `${id}-l1-a02.jsonl`)))
  assert.ok(!fs.existsSync(path.join(root, 'skills/demo-job-t1/skill.json')))
  assert.equal((restoreTraining(root, 'demo-job', 150) as TrainStatus).training_id, id) // a second click joins the replay
  await new Promise((r) => setTimeout(r, 300))
  const done = read(`runs/${id}/status.json`) as TrainStatus
  assert.equal(done.status, 'done')
  assert.equal(done.skills_ready, true)
  assert.ok(fs.existsSync(path.join(root, 'runs', id, `${id}-l2-a02.jsonl`)))
  assert.equal(read('skills/demo-job-t1/skill.json').attempts[0].run_id, `${id}-l1-a01`)
})

test('other games, {fresh: true} and bad slugs fall through to the regular train handler', async () => {
  for (const body of [{ slug: 'Not A Slug' }, { slug: 'Demo Job', fresh: true }]) {
    const res = await post('/api/train', body)
    assert.equal(res.status, 400) // train.ts validated the slug: the body reached it intact
  }
})
