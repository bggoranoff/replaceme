import type { LearnedSkill, SkillChatResponse } from './contract'

export type { LearnedSkill, SkillChatResponse }

export type Evidence = LearnedSkill['learned_parameters'][number]['evidence'][number]
export type Citation = SkillChatResponse['citations'][number]

/** Skill sections the chat can change; used to highlight what an update touched. */
export const SECTIONS = {
  description: 'Description',
  learned_parameters: 'Learned values',
  control_effects: 'Control effects',
  steps: 'Steps',
  caveats: 'Caveats',
  problems: 'Problems',
  user_context: 'Your context',
} as const

export type SectionKey = keyof typeof SECTIONS

export function changedSections(prev: LearnedSkill, next: LearnedSkill): SectionKey[] {
  return (Object.keys(SECTIONS) as SectionKey[]).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]))
}

export function formatValue(value: unknown, unit = ''): string {
  const text = typeof value === 'number' ? String(+value.toFixed(3)) : typeof value === 'string' ? value : JSON.stringify(value)
  return unit ? `${text} ${unit}` : text
}

const humanize = (id: string) => id.replace(/[_-]+/g, ' ')

/** Label and unit of each variable id, from the learned parameters. */
export function variableInfo(skill: LearnedSkill): (id: string) => { label: string; unit: string } {
  const known = new Map(skill.learned_parameters.map((p) => [p.variable, { label: p.label, unit: p.unit }]))
  return (id) => known.get(id) ?? { label: humanize(id), unit: '' }
}
