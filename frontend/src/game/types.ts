// World v2 types (shared/schemas/world.schema.json). Runtime-free.
import type { MechanicId } from '../contract'

export type Tile = [number, number]

export interface Palette {
  grass: string
  path: string
  water: string
  wood: string
  roof: string
  accent: string
  [key: string]: string
}

export interface MapLocation {
  id: string
  name: string
  kind: 'building' | 'stall' | 'station' | 'field' | 'table' | 'spot' | 'decor'
  icon?: string
  tile: Tile
  w: number
  h: number
  color?: string
  accent?: string
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface WorldMap {
  cols: number
  rows: number
  tile: 16
  spawn: Tile
  ground?: string[]
  locations: MapLocation[]
  solids: Rect[]
}

export interface Npc {
  id: string
  name: string
  role: string
  tile: Tile
  voice?: string
  palette?: Record<string, string>
}

export interface Feedback {
  too_low: string
  too_high: string
}

export interface NumericTerm {
  target?: number
  range?: [number, number]
  tolerance: number
  weight: number
  curve: 'gaussian' | 'linear' | 'step'
  feedback: Feedback
}

export interface DerivedTerm extends NumericTerm {
  id: string
  label: string
  expr: string
}

export interface Variable {
  id: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  default: number
}

export interface TimingPhase {
  id: string
  label: string
  unit: string
  min: number
  max: number
  mode: 'stop' | 'hold'
  period_ms?: number
  fill_per_s?: number
}

export interface SortItem {
  id: string
  label: string
  icon?: string
  attributes?: Record<string, string>
}

export interface DeliveryOrder {
  id: string
  item: string
  label: string
  from: string
  to: string
}

export interface ConverseTurn {
  id: string
  npc_line: string
  options: { id: string; text: string; reply: string }[]
}

export interface Scoring {
  pass_threshold: number
  variables?: Record<string, NumericTerm>
  derived?: DerivedTerm[]
  order?: { expected: string[]; weight: number; feedback: string }
  correct?: Record<string, string>
  weights?: Record<string, number>
  feedback?: Record<string, string>
  turns?: Record<string, Record<string, { points: number; feedback: string; critical?: boolean }>>
}

export interface DialogueLine {
  at: 'quest' | 'start' | 'pass' | 'fail'
  npc_id: string
  text: string
}

export interface MixParams {
  station_id: string
  variables: Variable[]
  ingredients?: { id: string; label: string }[]
  submit_label: string
}

export interface TimingParams {
  station_id: string
  phases: TimingPhase[]
}

export interface SortParams {
  station_id: string
  items: SortItem[]
  bins: { id: string; label: string }[]
}

export interface DeliverParams {
  start_tile: Tile
  orders: DeliveryOrder[]
  capacity: number
  par_ms: number
}

export interface ConverseParams {
  npc_id: string
  turns: ConverseTurn[]
}

export interface Level {
  id: string
  index: number
  title: string
  task_id: string
  skill_name: string
  mechanic: MechanicId
  quest: { npc_id: string; location_id: string; title: string }
  aim: string
  controls_hint: string
  metric: { name: string; description: string }
  time_limit_ms?: number | null
  success_line?: string
  dialogue?: DialogueLine[]
  params: Record<string, unknown>
  scoring: Scoring
  sources?: { title?: string; url: string }[]
}

export interface World {
  version: 2
  rulesVersion: number
  researchVersion?: number
  job: string
  slug: string
  title: string
  branch: string
  theme: { name: string; palette: Palette }
  map: WorldMap
  npcs: Npc[]
  levels: Level[]
  sources?: { title?: string; url: string }[]
}
