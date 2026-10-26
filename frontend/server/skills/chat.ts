import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { formatValue, type SkillUpdate } from './store.ts'
import type { LearnedSkill, SkillChatRequest } from '../../src/contract.ts'

export const DEFAULT_MODEL = 'gemini-3.8-flash'
const MAX_HISTORY = 20

type ChatTurn = SkillChatRequest['history'][number]
type SourceRef = LearnedSkill['sources'][number]

export interface ChatResult {
  reply: string
  update: SkillUpdate | null
  citations: SourceRef[]
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] }
  }[]
  error?: { message?: string }
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Answer shown to the human, plain text.' },
    skill_update: {
      type: 'object',
      properties: {
        should_update: { type: 'boolean' },
        user_context: { type: 'array', items: { type: 'string' }, description: 'New personal or local facts to remember.' },
        caveats: { type: 'array', items: { type: 'string' }, description: 'New caveats to add.' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Full revised step list, or [] to keep the steps.' },
      },
      required: ['should_update', 'user_context', 'caveats', 'steps'],
    },
  },
  required: ['reply', 'skill_update'],
}

function evidenceText(skill: LearnedSkill): string {
  const units = new Map(skill.learned_parameters.map((p) => [p.variable, p.unit]))
  const lines: string[] = []
  lines.push(`Skill: ${skill.name} (level ${skill.level_index} "${skill.level_id}", mechanic ${skill.mechanic}) for the job "${skill.job}".`)
  lines.push(`Description: ${skill.description}`)
  lines.push(`Trained over ${skill.trained_attempts} attempts. Best score ${skill.best_score}, final ${skill.final_score}, pass threshold ${skill.pass_threshold}.`)
  if (skill.learned_parameters.length) {
    lines.push('', 'Learned parameters:')
    for (const p of skill.learned_parameters) {
      const tried = p.evidence.map((e) => `attempt ${e.attempt}: ${formatValue(e.value, p.unit)} -> ${e.score}`).join('; ')
      lines.push(`- ${p.label} [${p.variable}] = ${formatValue(p.value, p.unit)}. ${p.rationale}${tried ? ` Tried: ${tried}.` : ''}`)
    }
  }
  if (skill.control_effects.length) {
    lines.push('', 'Observed control effects:')
    for (const c of skill.control_effects) lines.push(`- ${c.variable}: ${c.effect}`)
  }
  if (skill.attempts.length) {
    lines.push('', 'Attempt log (inputs -> score, feedback):')
    for (const a of skill.attempts) {
      const inputs = Object.entries(a.inputs)
        .map(([k, v]) => `${k}=${formatValue(v, units.get(k) ?? '')}`)
        .join(', ')
      const notes = [a.what_changed && `changed: ${a.what_changed}`, a.feedback.length && `feedback: ${a.feedback.join(' / ')}`]
        .filter(Boolean)
        .join('; ')
      lines.push(`- #${a.attempt} ${inputs} -> ${a.score}${a.passed ? ' pass' : ' fail'}${notes ? `; ${notes}` : ''}`)
    }
  } else if (skill.score_history.length) {
    lines.push('', `Score history: ${skill.score_history.map((p) => `#${p.attempt} ${p.score}`).join(', ')}`)
  }
  if (skill.steps.length) lines.push('', 'Steps:', ...skill.steps.map((s, i) => `${i + 1}. ${s}`))
  if (skill.caveats.length) lines.push('', 'Caveats:', ...skill.caveats.map((c) => `- ${c}`))
  if (skill.problems.length) lines.push('', 'Problems discovered:', ...skill.problems.map((p) => `- attempt ${p.attempt}: ${p.problem} Fix: ${p.fix}`))
  if (skill.user_context.length) lines.push('', "The human's context:", ...skill.user_context.map((u) => `- ${u.text}`))
  if (skill.sources.length) lines.push('', 'Research sources:', ...skill.sources.map((s) => `- ${s.title || s.url} ${s.url}`))
  return lines.join('\n')
}

export function systemInstruction(skill: LearnedSkill): string {
  return [
    `You are the replaceme actor agent. You learned the skill below by playing a "${skill.job}" practice level ${skill.trained_attempts} times. The human is asking you about it.`,
    '',
    'How to answer (reply):',
    '- Ground every answer in BOTH (1) your training evidence below: the learned values, what other values scored (name attempt numbers and scores), the feedback you got and the problems you hit; and (2) live Google Search results that explain the real-world reasons. Always search the web.',
    '- Be concise: at most about 120 words of plain text, no markdown headings. Give exact values with units.',
    '- If the evidence and the web disagree, say so. Never invent attempts or values that are not in the evidence.',
    '',
    'Updating the skill (skill_update):',
    '- should_update=true only when the human shares personal or local context worth remembering for this task (their equipment, place, climate, customers, rules, preferences, constraints) or asks to expand, add to or change the skill.',
    '- user_context: short, self-contained facts from what the human said, only ones not already listed.',
    '- caveats: new caveats that follow from that context or expansion.',
    '- steps: the full revised step list only when the steps themselves should change (keep existing steps, insert or edit where needed); otherwise [].',
    '- A plain question never updates the skill: should_update=false with empty lists. When you do update, say briefly in the reply what you added.',
    '',
    '--- Training evidence ---',
    evidenceText(skill),
  ].join('\n')
}

export function citationsFrom(data: GeminiResponse): SourceRef[] {
  const seen = new Set<string>()
  const out: SourceRef[] = []
  for (const chunk of data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ title: chunk.web?.title ?? '', url })
  }
  return out
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}

export function parseModelOutput(text: string): { reply: string; update: SkillUpdate | null } {
  let data: unknown
  try {
    data = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return { reply: text.trim(), update: null }
  }
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const reply = typeof obj.reply === 'string' ? obj.reply.trim() : ''
  const u = (typeof obj.skill_update === 'object' && obj.skill_update !== null ? obj.skill_update : {}) as Record<string, unknown>
  const update: SkillUpdate = { user_context: stringList(u.user_context), caveats: stringList(u.caveats), steps: stringList(u.steps) }
  return { reply, update: u.should_update === true ? update : null }
}

export async function geminiChat(
  apiKey: string,
  model: string,
  skill: LearnedSkill,
  message: string,
  history: ChatTurn[],
): Promise<ChatResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const contents = [...history.slice(-MAX_HISTORY), { role: 'user', text: message }].map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction(skill) }] },
      contents,
      tools: [{ google_search: {} }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: RESPONSE_SCHEMA },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  const data = (await res.json().catch(() => ({}))) as GeminiResponse
  if (!res.ok) throw new Error(`Gemini error (${res.status}): ${data.error?.message ?? res.statusText}`)
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  const { reply, update } = parseModelOutput(text)
  if (!reply) throw new Error('Gemini returned an empty reply')
  return { reply, update, citations: citationsFrom(data) }
}

export type Provider = 'google' | 'anthropic' | 'openai' | 'bedrock'

const PROVIDER_KEYS: Record<Provider, string[]> = {
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  bedrock: ['AWS_BEARER_TOKEN_BEDROCK'],
}
const PROVIDER_MODELS: Record<Provider, string> = {
  google: DEFAULT_MODEL,
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-6-luna',
  bedrock: 'openai.gpt-6-luna',
}

/** Same rules as builder/gemini_client.py: LLM_PROVIDER, else the first provider with a key. */
export function chatProvider(env: Record<string, string | undefined>): { provider: Provider; apiKey: string; model: string } | null {
  const wanted = env.LLM_PROVIDER?.trim().toLowerCase() as Provider | undefined
  const order = wanted ? [wanted] : (Object.keys(PROVIDER_KEYS) as Provider[])
  for (const provider of order) {
    const apiKey = PROVIDER_KEYS[provider]?.map((k) => env[k]?.trim()).find(Boolean)
    if (!apiKey) continue
    const model = env.LLM_MODEL || (provider === 'google' ? env.GEMINI_MODEL : undefined) || PROVIDER_MODELS[provider]
    return { provider, apiKey, model }
  }
  return null
}

const JSON_INSTRUCTION = `\n\nRespond with only a JSON object matching this JSON schema, no prose around it:\n${JSON.stringify(RESPONSE_SCHEMA)}`

function chatResult(text: string, citations: SourceRef[]): ChatResult {
  const { reply, update } = parseModelOutput(text)
  if (!reply) throw new Error('The model returned an empty reply')
  const seen = new Set<string>()
  return { reply, update, citations: citations.filter((c) => !seen.has(c.url) && seen.add(c.url)) }
}

export async function anthropicChat(apiKey: string, model: string, skill: LearnedSkill, message: string, history: ChatTurn[]): Promise<ChatResult> {
  const client = new Anthropic({ apiKey, timeout: 120_000 })
  const messages: Anthropic.MessageParam[] = [...history.slice(-MAX_HISTORY), { role: 'user' as const, text: message }].map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: systemInstruction(skill) + JSON_INSTRUCTION,
    messages,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    output_config: { effort: 'low' },
  })
  let text = ''
  const citations: SourceRef[] = []
  for (const block of response.content) {
    if (block.type !== 'text') continue
    text += block.text
    for (const c of block.citations ?? []) if (c.type === 'web_search_result_location') citations.push({ title: c.title ?? '', url: c.url })
  }
  return chatResult(text, citations)
}

export async function openaiChat(apiKey: string, model: string, skill: LearnedSkill, message: string, history: ChatTurn[], baseURL?: string): Promise<ChatResult> {
  const client = new OpenAI({ apiKey, baseURL, timeout: 120_000 })
  const input = [...history.slice(-MAX_HISTORY), { role: 'user' as const, text: message }].map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }))
  const response = await client.responses.create({
    model,
    instructions: systemInstruction(skill) + JSON_INSTRUCTION,
    input,
    tools: [{ type: 'web_search' }],
  })
  const citations: SourceRef[] = []
  for (const item of response.output) {
    if (item.type !== 'message') continue
    for (const part of item.content) {
      if (part.type !== 'output_text') continue
      for (const a of part.annotations) if (a.type === 'url_citation') citations.push({ title: a.title, url: a.url })
    }
  }
  return chatResult(response.output_text, citations)
}

/** Chat through whichever provider chatProvider() picked. */
export function modelChat(env: Record<string, string | undefined>, cfg: NonNullable<ReturnType<typeof chatProvider>>, skill: LearnedSkill, message: string, history: ChatTurn[]): Promise<ChatResult> {
  if (cfg.provider === 'anthropic') return anthropicChat(cfg.apiKey, cfg.model, skill, message, history)
  if (cfg.provider === 'openai') return openaiChat(cfg.apiKey, cfg.model, skill, message, history)
  if (cfg.provider === 'bedrock') {
    const baseURL = env.BEDROCK_BASE_URL || `https://bedrock-mantle.${env.AWS_REGION || 'us-east-1'}.api.aws/openai/v1`
    return openaiChat(cfg.apiKey, cfg.model, skill, message, history, baseURL)
  }
  return geminiChat(cfg.apiKey, cfg.model, skill, message, history)
}

const QUESTION_START = /^(why|what|how|when|where|which|who|whom|whose|should|could|would|can|is|are|do|does|did|will|tell|explain)\b/i
const FIRST_PERSON = /\b(i|i'm|im|i've|we|we're|my|our|us|me)\b/i

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3))

/** Grounded answer from the skill alone, used when there is no Gemini key or the call fails. */
export function fallbackChat(skill: LearnedSkill, message: string): ChatResult {
  const text = message.trim()
  const citations = skill.sources.filter((s) => s.url)
  const isQuestion = text.endsWith('?') || QUESTION_START.test(text)

  if (!isQuestion && FIRST_PERSON.test(text)) {
    return {
      reply: `Noted. I added this to the skill as your context: "${text}". Web search is offline, so I could not check it against sources.`,
      update: { user_context: [text] },
      citations,
    }
  }

  const asked = words(text)
  const matched = skill.learned_parameters.filter((p) => [...words(`${p.label} ${p.variable.replace(/_/g, ' ')}`)].some((w) => asked.has(w)))
  const params = matched.length ? matched : skill.learned_parameters
  const effects = new Map(skill.control_effects.map((c) => [c.variable, c.effect]))
  const parts = params.map((p) => {
    const tried = [...p.evidence].sort((a, b) => b.score - a.score).slice(0, 4)
    const triedText = tried.length ? ` In training: ${tried.map((e) => `attempt ${e.attempt} ${formatValue(e.value, p.unit)} scored ${e.score}`).join('; ')}.` : ''
    const effect = matched.length && effects.get(p.variable) ? ` ${effects.get(p.variable)}` : ''
    return `${p.label}: ${formatValue(p.value, p.unit)}. ${p.rationale}${triedText}${effect}`
  })
  const body = parts.length ? parts.join('\n\n') : `${skill.description}\n\n${skill.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
  return { reply: `${body}\n\n(Web search is offline, so this answer comes from my training evidence only.)`, update: null, citations }
}
