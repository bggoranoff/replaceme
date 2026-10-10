// Types only (no runtime code) for shared/game_contract.md and shared/actions.json v2.
// Imported by the game, the spectator/skills UI and frontend/server/api/*. Change the docs first.

export type MechanicId = 'mix' | 'timing' | 'sort' | 'deliver' | 'converse'
export type ControlId =
  | 'key_up'
  | 'key_down'
  | 'key_left'
  | 'key_right'
  | 'mouse_click'
  | 'mouse_down'
  | 'mouse_up'
  | 'mouse_drag'
  | 'interact'
  | 'wait'

export type PointOrTarget = { target_id: string } | { x: number; y: number }

export interface Action {
  action: ControlId
  params?: {
    hold_ms?: number
    target_id?: string
    x?: number
    y?: number
    from?: PointOrTarget
    to?: PointOrTarget
    duration_ms?: number
    ms?: number
  }
}

export interface Target {
  id: string
  kind: 'slider' | 'button' | 'npc' | 'location' | 'item' | 'bin' | 'choice' | 'meter' | 'spot' | 'submit'
  label: string
  x: number
  y: number
  w: number
  h: number
  enabled: boolean
}

export interface LevelResult {
  score: number
  passed: boolean
  feedback: string[]
  breakdown: Record<string, { label: string; score: number }>
}

export interface DialogueMessage {
  speaker: string
  npc_id: string | null
  text: string
  t_ms: number
}

/** Never contains scoring targets, tolerances, correct answers or points. */
export interface Observation {
  level_id: string | null
  mechanic: MechanicId | null
  phase: 'world' | 'intro' | 'playing' | 'result'
  t_ms: number
  time_limit_ms: number | null
  time_left_ms: number | null
  aim: string
  controls_hint: string
  viewport: { w: number; h: number }
  avatar: { x: number; y: number; tile: [number, number]; facing: 'up' | 'down' | 'left' | 'right'; carrying: string | null }
  grid: { cols: number; rows: number; blocked: [number, number][] }
  targets: Target[]
  focus: string | null
  mechanic_state: Record<string, unknown>
  messages: DialogueMessage[]
  last_result: LevelResult | null
  done: boolean
}

export interface GameEvent {
  type: 'dialogue' | 'level_start' | 'level_result' | 'pickup' | 'handover' | 'placed' | 'phase_end' | 'error'
  t_ms: number
  [key: string]: unknown
}

export interface ActResult {
  ok: boolean
  error?: string
  observation: Observation
  done: boolean
  score: number | null
  events: GameEvent[]
}

export interface ActionInfo {
  action: ControlId
  params: Record<string, unknown>
  description: string
}

/** window.__replaceme, exposed by the game page (always; agent mode adds ?run=&level=&agent=1). */
export interface ReplacemeBridge {
  listActions(): ActionInfo[]
  observe(): Observation
  act(action: Action): Promise<ActResult>
  onEvent(cb: (event: GameEvent) => void): () => void
  resetLevel(levelId: string): Promise<Observation>
}

/** window CustomEvent 'replaceme:dialogue' detail. */
export interface DialogueEventDetail {
  text: string
  speaker: string
  npcId: string | null
  voice?: string
  manual: boolean
}

export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error'

export interface RunSummary {
  id: string
  training_id: string
  level_id: string
  level_index: number
  level_title: string
  attempt: number
  status: RunStatus
  score: number | null
  started_at: string | null
  finished_at: string | null
}

export type RunEvent =
  | { seq: number; type: 'run_started'; at: string; run: Omit<RunSummary, 'status' | 'score' | 'started_at' | 'finished_at'>; inputs_plan?: Record<string, unknown>; hypothesis?: string }
  | { seq: number; type: 'action'; at: string; action: Action; result: ActResult }
  | { seq: number; type: 'note'; at: string; text: string }
  | { seq: number; type: 'run_finished'; at: string; status: RunStatus; score: number | null; result: LevelResult | null; inputs: Record<string, unknown> }

export interface TrainStatus {
  training_id: string | null
  status: 'idle' | 'running' | 'done' | 'error'
  slug: string | null
  error?: string
  levels: { level_id: string; level_title: string; attempts_done: number; attempts_total: number; best_score: number | null; status: 'queued' | 'running' | 'done' | 'error' }[]
  skills_ready: boolean
}

export interface Evidence {
  attempt: number
  value: unknown
  score: number
}

export interface LearnedSkill {
  version: 2
  id: string
  name: string
  description: string
  job: string
  level_id: string
  level_index: number
  mechanic: MechanicId
  status: 'learned' | 'stub'
  trained_attempts: number
  best_score: number
  final_score: number
  pass_threshold: number
  passed: boolean
  learned_parameters: { variable: string; label: string; value: unknown; unit: string; rationale: string; evidence: Evidence[] }[]
  control_effects: { variable: string; effect: string; evidence: Evidence[] }[]
  steps: string[]
  caveats: string[]
  problems: { problem: string; attempt: number; fix: string }[]
  score_history: { attempt: number; score: number; passed: boolean }[]
  attempts: {
    attempt: number
    run_id: string
    inputs: Record<string, unknown>
    actions_taken: Action[]
    score: number
    passed: boolean
    feedback: string[]
    breakdown: Record<string, unknown>
    problems_found: string[]
    caveats: string[]
    hypothesis: string
    what_changed: string
  }[]
  sources: { title: string; url: string }[]
  user_context: { text: string; added_at: string }[]
  updated_at: string
}

export interface SkillChatRequest {
  message: string
  history: { role: 'user' | 'model'; text: string }[]
}

export interface SkillChatResponse {
  reply: string
  citations: { title: string; url: string }[]
  skill_updated: boolean
  skill: LearnedSkill
}
