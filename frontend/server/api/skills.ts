import type { Route } from './http.ts'

// Owner: skills agent. shared/game_contract.md section f. Types in src/contract.ts.
//   GET  /api/skills               -> {skills: LearnedSkill[]} (latest training, ordered by level_index)
//   GET  /api/skills/:id           -> LearnedSkill
//   POST /api/skills/:id/chat      SkillChatRequest -> SkillChatResponse
export const routes: Route[] = []
