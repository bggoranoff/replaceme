// Run: cd frontend && node --test server/skills/skills.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { LearnedSkill } from '../../src/contract.ts'
import { dispatch } from '../api/index.ts'
import { fallbackChat, parseModelOutput } from './chat.ts'
import { latestSkills, mergeSkillUpdate, readSkill, renderSkillMd, writeSkill } from './store.ts'

const FIXTURE = path.resolve(import.meta.dirname, '../../../fixtures/example-skills.v2.json')
const fixtures = (JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { skills: LearnedSkill[] }).skills
const trainingId = fixtures[0].attempts[0].run_id.replace(/-l\d+-a\d+$/, '')
const slug = fixtures[0].id.split('-')[0]

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'))
  for (const s of fixtures) writeSkill(root, s)
  // A legacy SKILL.md-only folder and a skill from an older training must not show up.
  fs.mkdirSync(path.join(root, 'skills', 'legacy-skill'), { recursive: true })
  fs.writeFileSync(path.join(root, 'skills', 'legacy-skill', 'SKILL.md'), '---\nname: legacy\n---\n')
  const old: LearnedSkill = {
    ...fixtures[0],
    id: 'other-job-task',
    level_id: 'other-job-task',
    job: 'other job',
    updated_at: '2020-01-01T00:00:00Z',
    attempts: fixtures[0].attempts.map((a) => ({ ...a, run_id: `other-1-l1-a${a.attempt}` })),
  }
  writeSkill(root, old)
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'runs', 'latest.json'), JSON.stringify({ training_id: trainingId, slug }))
  return root
}

describe('skill store', () => {
  test('latestSkills returns the latest training, ordered by level_index', () => {
    const root = makeRepo()
    const skills = latestSkills(root)
    assert.deepEqual(
      skills.map((s) => s.level_index),
      [1, 2, 3, 4],
    )
    assert.ok(skills.every((s) => s.job === fixtures[0].job))
  })

  test('latestSkills falls back to the newest job without runs/latest.json', () => {
    const root = makeRepo()
    fs.rmSync(path.join(root, 'runs'), { recursive: true })
    assert.equal(latestSkills(root).length, 4)
  })

  test('latestSkills never shows another job for a latest training without skills', () => {
    const root = makeRepo()
    fs.writeFileSync(path.join(root, 'runs', 'latest.json'), JSON.stringify({ training_id: 'newjob-1', slug: 'newjob' }))
    assert.deepEqual(latestSkills(root), [])
  })

  test('readSkill rejects ids that escape the skills folder', () => {
    const root = makeRepo()
    assert.equal(readSkill(root, '../runs'), null)
    assert.equal(readSkill(root, 'legacy-skill'), null)
    assert.equal(readSkill(root, fixtures[1].id)?.name, fixtures[1].name)
  })

  test('renderSkillMd has the contract frontmatter and body sections', () => {
    const md = renderSkillMd(fixtures[0])
    const front = md.split('---')[1]
    for (const key of ['name', 'description', 'status', 'level_id', 'mechanic', 'trained_attempts', 'best_score', 'updated_at']) {
      assert.match(front, new RegExp(`^${key}: `, 'm'), key)
    }
    for (const section of ['## Learned parameters', '## Control effects', '## Steps', '## Caveats', '## Problems discovered', '## Score history']) {
      assert.ok(md.includes(section), section)
    }
  })

  test('mergeSkillUpdate appends context and caveats, replaces steps, skips duplicates', () => {
    const base = fixtures[0]
    const { skill, changed } = mergeSkillUpdate(
      base,
      { user_context: ['Works on a small hand-cranked machine.'], caveats: [base.caveats[0], 'New caveat.'], steps: [...base.steps, 'Extra step.'] },
      '2026-10-10T16:00:00Z',
    )
    assert.deepEqual(changed, ['user_context', 'steps', 'caveats'])
    assert.equal(skill.user_context.at(-1)?.text, 'Works on a small hand-cranked machine.')
    assert.equal(skill.caveats.length, base.caveats.length + 1)
    assert.equal(skill.steps.at(-1), 'Extra step.')
    assert.equal(skill.updated_at, '2026-10-10T16:00:00Z')

    const again = mergeSkillUpdate(skill, { user_context: ['works on a small  hand-cranked machine.'], steps: skill.steps }, 'later')
    assert.deepEqual(again.changed, [])
    assert.equal(again.skill.updated_at, skill.updated_at)
  })

  test('mergeSkillUpdate appends a partial step list instead of dropping the learned steps', () => {
    const base = fixtures[0]
    const { skill, changed } = mergeSkillUpdate(base, { steps: [base.steps[0], 'Only the new step.'] }, 'now')
    assert.deepEqual(changed, ['steps'])
    assert.deepEqual(skill.steps, [...base.steps, 'Only the new step.'])
  })
})

describe('chat helpers', () => {
  test('parseModelOutput reads the structured reply and ignores updates unless should_update', () => {
    const yes = parseModelOutput(JSON.stringify({ reply: 'ok', skill_update: { should_update: true, user_context: ['x'], caveats: [], steps: [] } }))
    assert.equal(yes.reply, 'ok')
    assert.deepEqual(yes.update?.user_context, ['x'])
    const no = parseModelOutput(JSON.stringify({ reply: 'ok', skill_update: { should_update: false, user_context: ['x'], caveats: [], steps: [] } }))
    assert.equal(no.update, null)
    assert.equal(parseModelOutput('plain text').reply, 'plain text')
  })

  test('fallbackChat answers a parameter question from attempt evidence', () => {
    const p = fixtures[0].learned_parameters[0]
    const r = fallbackChat(fixtures[0], `Why this ${p.label.toLowerCase()}?`)
    assert.equal(r.update, null)
    assert.ok(r.reply.includes(String(p.value)), r.reply)
    assert.match(r.reply, /attempt \d+/)
  })

  test('fallbackChat stores personal context', () => {
    const r = fallbackChat(fixtures[0], 'In my shop we only have room for a small machine.')
    assert.deepEqual(r.update?.user_context, ['In my shop we only have room for a small machine.'])
  })
})

describe('skills routes', () => {
  let root = ''
  let server: http.Server
  let base = ''

  before(async () => {
    root = makeRepo()
    server = http.createServer((req, res) => {
      if (!dispatch(req, res, { repoRoot: root, env: {} })) {
        res.statusCode = 404
        res.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  after(() => server.close())

  test('GET /api/skills and /api/skills/:id', async () => {
    const list = (await (await fetch(`${base}/api/skills`)).json()) as { skills: LearnedSkill[] }
    assert.equal(list.skills.length, 4)
    const one = await fetch(`${base}/api/skills/${fixtures[2].id}`)
    assert.equal(one.status, 200)
    assert.equal(((await one.json()) as LearnedSkill).id, fixtures[2].id)
    assert.equal((await fetch(`${base}/api/skills/nope`)).status, 404)
  })

  test('POST /api/skills/:id/chat validates and updates the skill files without a key', async () => {
    const id = fixtures[0].id
    const bad = await fetch(`${base}/api/skills/${id}/chat`, { method: 'POST', body: JSON.stringify({ message: '' }) })
    assert.equal(bad.status, 400)

    const res = await fetch(`${base}/api/skills/${id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'We work at high altitude in my area.', history: [] }),
    })
    const body = (await res.json()) as { reply: string; skill_updated: boolean; skill: LearnedSkill; citations: unknown[] }
    assert.equal(res.status, 200)
    assert.equal(body.skill_updated, true)
    assert.ok(Array.isArray(body.citations))
    assert.equal(body.skill.user_context.at(-1)?.text, 'We work at high altitude in my area.')
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, 'skills', id, 'skill.json'), 'utf8')) as LearnedSkill
    assert.equal(onDisk.user_context.at(-1)?.text, 'We work at high altitude in my area.')
    assert.ok(fs.readFileSync(path.join(root, 'skills', id, 'SKILL.md'), 'utf8').includes('We work at high altitude in my area.'))
  })
})
