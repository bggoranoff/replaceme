import fs from 'node:fs'
import path from 'node:path'
import type { LearnedSkill } from '../../src/contract.ts'

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export function skillsDir(repoRoot: string): string {
  return path.join(repoRoot, 'skills')
}

export function isSkillId(id: string): boolean {
  return ID_RE.test(id)
}

function skillJsonPath(repoRoot: string, id: string): string {
  return path.join(skillsDir(repoRoot), id, 'skill.json')
}

function isLearnedSkill(data: unknown): data is LearnedSkill {
  if (typeof data !== 'object' || data === null) return false
  const s = data as Record<string, unknown>
  return s.version === 2 && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.learned_parameters)
}

/** Fills optional arrays so the UI and the merge never see undefined. */
function normalize(skill: LearnedSkill): LearnedSkill {
  return {
    ...skill,
    learned_parameters: skill.learned_parameters ?? [],
    control_effects: skill.control_effects ?? [],
    steps: skill.steps ?? [],
    caveats: skill.caveats ?? [],
    problems: skill.problems ?? [],
    score_history: skill.score_history ?? [],
    attempts: skill.attempts ?? [],
    sources: skill.sources ?? [],
    user_context: skill.user_context ?? [],
  }
}

export function readSkill(repoRoot: string, id: string): LearnedSkill | null {
  if (!isSkillId(id)) return null
  const file = skillJsonPath(repoRoot, id)
  if (!fs.existsSync(file)) return null
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    return isLearnedSkill(data) ? normalize(data) : null
  } catch {
    return null
  }
}

/** Every v2 skill under skills/. Folders with only a legacy SKILL.md are skipped. */
function allSkills(repoRoot: string): LearnedSkill[] {
  const dir = skillsDir(repoRoot)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isSkillId(e.name))
    .map((e) => readSkill(repoRoot, e.name))
    .filter((s): s is LearnedSkill => s !== null)
}

function readLatest(repoRoot: string): { training_id?: string; slug?: string } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', 'latest.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Newest skill per level, ordered by level_index. */
function byLevel(skills: LearnedSkill[]): LearnedSkill[] {
  const best = new Map<number, LearnedSkill>()
  for (const s of skills) {
    const cur = best.get(s.level_index)
    if (!cur || cur.updated_at < s.updated_at) best.set(s.level_index, s)
  }
  return [...best.values()].sort((a, b) => a.level_index - b.level_index)
}

/**
 * Skills of the latest training (runs/latest.json): those whose attempts carry its training id
 * (run id = <training_id>-l<i>-a<NN>), else those whose id starts with its slug (level id = <slug>-<task>),
 * else the most recently updated job's skills.
 */
export function latestSkills(repoRoot: string): LearnedSkill[] {
  const skills = allSkills(repoRoot)
  const latest = readLatest(repoRoot)
  const trainingId = latest?.training_id
  if (trainingId) {
    const found = skills.filter((s) => s.attempts.some((a) => a.run_id?.startsWith(`${trainingId}-`)))
    if (found.length) return byLevel(found)
  }
  const slug = latest?.slug
  if (slug) {
    const found = skills.filter((s) => s.id.startsWith(`${slug}-`))
    if (found.length) return byLevel(found)
  }
  const newest = skills.reduce<LearnedSkill | null>((a, s) => (!a || a.updated_at < s.updated_at ? s : a), null)
  return newest ? byLevel(skills.filter((s) => s.job === newest.job)) : []
}

function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, file)
}

/** Writes skill.json and regenerates SKILL.md next to it. */
export function writeSkill(repoRoot: string, skill: LearnedSkill): void {
  if (!isSkillId(skill.id)) throw new Error(`Invalid skill id: ${skill.id}`)
  const dir = path.join(skillsDir(repoRoot), skill.id)
  fs.mkdirSync(dir, { recursive: true })
  writeAtomic(path.join(dir, 'skill.json'), `${JSON.stringify(skill, null, 2)}\n`)
  writeAtomic(path.join(dir, 'SKILL.md'), renderSkillMd(skill))
}

const locks = new Map<string, Promise<unknown>>()

/** Serializes read-modify-write cycles per skill so concurrent chats never drop an update. */
export function withSkillLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve()
  const next = prev.then(fn)
  const tail = next.catch(() => undefined)
  locks.set(id, tail)
  void tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id)
  })
  return next
}

export function formatValue(value: unknown, unit = ''): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return unit ? `${text} ${unit}` : text
}

function evidenceLine(evidence: { attempt: number; value: unknown; score: number }[], unit: string): string {
  return evidence.map((e) => `#${e.attempt} ${formatValue(e.value, unit)} → ${e.score}`).join(', ')
}

const yaml = (v: string | number | boolean) => (typeof v === 'string' ? JSON.stringify(v) : String(v))

export function renderSkillMd(skill: LearnedSkill): string {
  const units = new Map(skill.learned_parameters.map((p) => [p.variable, p.unit]))
  const out: string[] = [
    '---',
    `name: ${yaml(skill.id)}`,
    `description: ${yaml(skill.description)}`,
    `status: ${skill.status}`,
    `level_id: ${yaml(skill.level_id)}`,
    `mechanic: ${skill.mechanic}`,
    `trained_attempts: ${skill.trained_attempts}`,
    `best_score: ${skill.best_score}`,
    `updated_at: ${yaml(skill.updated_at)}`,
    '---',
    '',
    `# ${skill.name}`,
    '',
    skill.description,
    '',
    `Learned by playing level ${skill.level_index} of the ${skill.job} game ${skill.trained_attempts} times (${skill.mechanic} mechanic). Best score ${skill.best_score}, final ${skill.final_score}, pass threshold ${skill.pass_threshold}, ${skill.passed ? 'passed' : 'not passed'}.`,
    '',
  ]

  if (skill.learned_parameters.length) {
    out.push('## Learned parameters', '')
    for (const p of skill.learned_parameters) {
      out.push(`- **${p.label}** (\`${p.variable}\`): ${formatValue(p.value, p.unit)}. ${p.rationale}`)
      if (p.evidence.length) out.push(`  - Tried: ${evidenceLine(p.evidence, p.unit)}`)
    }
    out.push('')
  }

  if (skill.control_effects.length) {
    out.push('## Control effects', '')
    for (const c of skill.control_effects) {
      out.push(`- **${c.variable}**: ${c.effect}`)
      if (c.evidence.length) out.push(`  - Tried: ${evidenceLine(c.evidence, units.get(c.variable) ?? '')}`)
    }
    out.push('')
  }

  if (skill.steps.length) out.push('## Steps', '', ...skill.steps.map((s, i) => `${i + 1}. ${s}`), '')
  if (skill.caveats.length) out.push('## Caveats', '', ...skill.caveats.map((c) => `- ${c}`), '')
  if (skill.problems.length) {
    out.push('## Problems discovered', '', ...skill.problems.map((p) => `- Attempt ${p.attempt}: ${p.problem} Fix: ${p.fix}`), '')
  }
  if (skill.user_context.length) {
    out.push('## User context', '', ...skill.user_context.map((u) => `- ${u.text} (${u.added_at.slice(0, 10)})`), '')
  }
  if (skill.score_history.length) {
    out.push(
      '## Score history',
      '',
      ...skill.score_history.map((p) => `- Attempt ${p.attempt}: ${p.score}${p.passed ? ' (pass)' : ''}`),
      '',
    )
  }
  if (skill.sources.length) out.push('## Sources', '', ...skill.sources.map((s) => `- [${s.title || s.url}](${s.url})`), '')
  return `${out.join('\n').trimEnd()}\n`
}

export interface SkillUpdate {
  user_context?: string[]
  steps?: string[]
  caveats?: string[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Structured merge of a chat-proposed update. Returns the new skill and which sections changed. */
export function mergeSkillUpdate(skill: LearnedSkill, update: SkillUpdate, now: string): { skill: LearnedSkill; changed: string[] } {
  const changed: string[] = []
  const next: LearnedSkill = { ...skill }

  const known = new Set(skill.user_context.map((u) => norm(u.text)))
  const contexts = (update.user_context ?? []).map((t) => t.trim()).filter((t) => t && !known.has(norm(t)))
  if (contexts.length) {
    next.user_context = [...skill.user_context, ...contexts.map((text) => ({ text, added_at: now }))]
    changed.push('user_context')
  }

  const steps = (update.steps ?? []).map((t) => t.trim()).filter(Boolean)
  if (steps.length && steps.map(norm).join('\n') !== skill.steps.map(norm).join('\n')) {
    next.steps = steps
    changed.push('steps')
  }

  const knownCaveats = new Set(skill.caveats.map(norm))
  const caveats = (update.caveats ?? []).map((t) => t.trim()).filter((t) => t && !knownCaveats.has(norm(t)))
  if (caveats.length) {
    next.caveats = [...skill.caveats, ...caveats]
    changed.push('caveats')
  }

  if (changed.length) next.updated_at = now
  return { skill: next, changed }
}
