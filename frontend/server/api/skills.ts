import type { SkillChatRequest, SkillChatResponse } from '../../src/contract.ts'
import { DEFAULT_MODEL, fallbackChat, geminiChat, type ChatResult } from '../skills/chat.ts'
import { latestSkills, mergeSkillUpdate, readSkill, withSkillLock, writeSkill } from '../skills/store.ts'
import { HttpError, readJson, sendJson, type Route } from './http.ts'

// Owner: skills agent. shared/game_contract.md section f. Types in src/contract.ts.
//   GET  /api/skills               -> {skills: LearnedSkill[]} (latest training, ordered by level_index)
//   GET  /api/skills/:id           -> LearnedSkill
//   POST /api/skills/:id/chat      SkillChatRequest -> SkillChatResponse

function parseChat(body: Record<string, unknown>): SkillChatRequest {
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) throw new HttpError(400, '"message" must be a non-empty string')
  if (message.length > 4000) throw new HttpError(400, '"message" is too long')
  const raw = body.history ?? []
  if (!Array.isArray(raw)) throw new HttpError(400, '"history" must be an array')
  const history = raw.map((m) => {
    if (typeof m !== 'object' || m === null || (m.role !== 'user' && m.role !== 'model') || typeof m.text !== 'string') {
      throw new HttpError(400, 'Each history item must be { role: "user" | "model", text: string }')
    }
    return { role: m.role as 'user' | 'model', text: m.text }
  })
  return { message, history }
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/skills',
    handler: (_req, res, ctx) => sendJson(res, 200, { skills: latestSkills(ctx.repoRoot) }),
  },
  {
    method: 'GET',
    path: '/api/skills/:id',
    handler: (_req, res, ctx, params) => {
      const skill = readSkill(ctx.repoRoot, params.id)
      if (!skill) throw new HttpError(404, `Skill not found: ${params.id}`)
      sendJson(res, 200, skill)
    },
  },
  {
    method: 'POST',
    path: '/api/skills/:id/chat',
    handler: async (req, res, ctx, params) => {
      const { message, history } = parseChat(await readJson(req))
      const current = readSkill(ctx.repoRoot, params.id)
      if (!current) throw new HttpError(404, `Skill not found: ${params.id}`)
      const apiKey = ctx.env.GEMINI_API_KEY || ctx.env.GOOGLE_API_KEY

      let result: ChatResult
      try {
        result = apiKey
          ? await geminiChat(apiKey, ctx.env.GEMINI_MODEL || DEFAULT_MODEL, current, message, history)
          : fallbackChat(current, message)
      } catch (err) {
        console.warn('[skills] Gemini chat failed, answering from the skill alone:', (err as Error).message)
        result = fallbackChat(current, message)
      }

      // Only the read-merge-write is serialized per skill, so a slow model call never blocks other chats.
      const body = await withSkillLock(params.id, async (): Promise<SkillChatResponse> => {
        const skill = readSkill(ctx.repoRoot, params.id)
        if (!skill) throw new HttpError(404, `Skill not found: ${params.id}`)
        if (!result.update) return { reply: result.reply, citations: result.citations, skill_updated: false, skill }
        const merged = mergeSkillUpdate(skill, result.update, new Date().toISOString())
        if (merged.changed.length) writeSkill(ctx.repoRoot, merged.skill)
        return { reply: result.reply, citations: result.citations, skill_updated: merged.changed.length > 0, skill: merged.skill }
      })
      sendJson(res, 200, body)
    },
  },
]
