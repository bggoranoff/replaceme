// Deterministic game engine shared by human play, the actor bridge and spectator replays.
// All state changes go through primitive inputs plus advance(ms); in agent and spectate
// modes time only moves through actions (actions.json control_semantics.virtual_time).
import type { Action, ActionInfo, ActResult, ControlId, DialogueMessage, GameEvent, LevelResult, Observation, Target } from '../contract'
import { cardRect, STEP_MS, TILE } from './layout'
import { MECHANIC_CONTROLS, type Dir, type Mechanic, type MechanicCtx } from './mechanics/base'
import { ConverseMechanic } from './mechanics/converse'
import { DeliverMechanic } from './mechanics/deliver'
import { MixMechanic } from './mechanics/mix'
import { SortMechanic } from './mechanics/sort'
import { TimingMechanic } from './mechanics/timing'
import type { DialogueLine, Level, MapLocation, Npc, World } from './types'
import { Grid, inFootprint, locationTargetId, resolveTarget, tileDistance, toTarget, type WorldTarget } from './worldTargets'

export type Phase = 'world' | 'intro' | 'playing' | 'result'
export type EngineMode = 'play' | 'agent' | 'spectate'
export type QuestState = 'available' | 'active' | 'done'
/** A plan yields the ms of game time each of its steps takes. */
export type Plan = Generator<number, void, void>

export interface Bubble {
  npcId: string | null
  speaker: string
  text: string
  at: number
  until: number
}

const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const KEY_DIR: Partial<Record<ControlId, Dir>> = { key_up: 'up', key_down: 'down', key_left: 'left', key_right: 'right' }

const PARAMS: Record<ControlId, Record<string, unknown>> = {
  key_up: { hold_ms: { type: 'integer', min: 0, max: 5000, default: 0 } },
  key_down: { hold_ms: { type: 'integer', min: 0, max: 5000, default: 0 } },
  key_left: { hold_ms: { type: 'integer', min: 0, max: 5000, default: 0 } },
  key_right: { hold_ms: { type: 'integer', min: 0, max: 5000, default: 0 } },
  mouse_click: { target_id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, require_one_of: [['target_id'], ['x', 'y']] },
  mouse_down: { target_id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, require_one_of: [['target_id'], ['x', 'y']] },
  mouse_up: { x: { type: 'number' }, y: { type: 'number' } },
  mouse_drag: { from: { type: 'point_or_target' }, to: { type: 'point_or_target' }, duration_ms: { type: 'integer', min: 0, max: 5000, default: 200 } },
  interact: { target_id: { type: 'string', optional: true } },
  wait: { ms: { type: 'integer', min: 0, max: 10000 } },
}

const WORLD_CONTROLS: { action: ControlId; description: string }[] = [
  { action: 'key_up', description: 'walk one tile up per press step' },
  { action: 'key_down', description: 'walk one tile down per press step' },
  { action: 'key_left', description: 'walk one tile left per press step' },
  { action: 'key_right', description: 'walk one tile right per press step' },
  { action: 'interact', description: 'talk to an adjacent NPC or use an adjacent location (opens its level when its quest is active)' },
  { action: 'mouse_click', description: 'click a tile to walk there, or an NPC/location to walk next to it and interact' },
  { action: 'wait', description: 'let time pass' },
]
const CARD_CONTROLS: { action: ControlId; description: string }[] = [
  { action: 'interact', description: 'continue' },
  { action: 'mouse_click', description: 'click to continue' },
]

export class ActionError extends Error {}

/** A plan with a single instant step. */
function* instant(fn: () => void): Plan {
  fn()
  yield 0
}

export class GameEngine {
  readonly world: World
  readonly mode: EngineMode
  readonly W: number
  readonly H: number
  readonly grid: Grid
  t = 0
  phase: Phase = 'world'
  avatar: { col: number; row: number; facing: Dir }
  quests: Record<string, QuestState> = {}
  best: Record<string, number | null> = {}
  level: Level | null = null
  levelT0 = 0
  mech: Mechanic | null = null
  result: LevelResult | null = null
  messages: DialogueMessage[] = []
  bubble: Bubble | null = null
  /** Level bubbles waiting for their time (in-level chatter between NPCs). */
  private chatter: { at: number; line: DialogueLine }[] = []
  private listeners = new Set<(e: GameEvent) => void>()
  private pointer = { x: 0, y: 0 }
  private blockedCache: [number, number][]

  constructor(world: World, mode: EngineMode) {
    this.world = world
    this.mode = mode
    this.W = world.map.cols * TILE
    this.H = world.map.rows * TILE
    this.grid = new Grid(world)
    this.blockedCache = this.grid.blockedList()
    this.avatar = { col: world.map.spawn[0], row: world.map.spawn[1], facing: 'down' }
    for (const l of world.levels) {
      this.quests[l.id] = 'available'
      this.best[l.id] = null
    }
  }

  // --- events ----------------------------------------------------------------

  onEvent(cb: (e: GameEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(type: GameEvent['type'], data: Record<string, unknown> = {}) {
    const e: GameEvent = { type, t_ms: this.obsTime(), ...data }
    for (const cb of this.listeners) cb(e)
  }

  npc(id: string | null | undefined): Npc | undefined {
    return this.world.npcs.find((n) => n.id === id)
  }

  location(id: string | null | undefined): MapLocation | undefined {
    return this.world.map.locations.find((l) => l.id === id)
  }

  say(npcId: string | null, text: string) {
    const npc = this.npc(npcId)
    const speaker = npc?.name ?? 'Hint'
    this.messages = [...this.messages, { speaker, npc_id: npc ? npc.id : null, text, t_ms: this.obsTime() }].slice(-6)
    this.bubble = { npcId: npc ? npc.id : null, speaker, text, at: this.t, until: this.t + Math.max(2800, 60 * text.length) }
    this.emit('dialogue', { npc_id: npc ? npc.id : null, speaker, text, voice: npc?.voice })
  }

  private hint(text: string) {
    this.say(null, text)
  }

  // --- time ------------------------------------------------------------------

  levelTime(): number {
    return this.t - this.levelT0
  }

  obsTime(): number {
    if (this.phase === 'playing' || this.phase === 'result') return this.levelTime()
    if (this.phase === 'intro') return 0
    return this.t
  }

  advance(ms: number) {
    if (!(ms > 0)) return
    this.t += ms
    if (this.phase !== 'playing' || !this.level || !this.mech) return
    const lt = this.levelTime()
    while (this.chatter.length && this.chatter[0].at <= lt) {
      const { line } = this.chatter.shift()!
      this.say(line.npc_id, line.text)
    }
    this.mech.advance()
    const limit = this.level.time_limit_ms
    if (limit && lt >= limit && this.phase === 'playing') this.finishLevel(this.mech.timeout())
  }

  // --- world -----------------------------------------------------------------

  avatarTile(): [number, number] {
    return [this.avatar.col, this.avatar.row]
  }

  walk(dir: Dir) {
    this.avatar.facing = dir
    const [dx, dy] = DIRS[dir]
    const nx = this.avatar.col + dx
    const ny = this.avatar.row + dy
    if (this.grid.walkable(nx, ny)) {
      this.avatar.col = nx
      this.avatar.row = ny
    }
  }

  private face(target: WorldTarget) {
    const [c, r] = this.avatarTile()
    const t = target.tiles
    const cx = Math.max(t.x, Math.min(c, t.x + t.w - 1))
    const cy = Math.max(t.y, Math.min(r, t.y + t.h - 1))
    const dx = cx - c
    const dy = cy - r
    if (dx === 0 && dy === 0) return
    this.avatar.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
  }

  /** NPCs and non-decor locations; spots only matter while delivering. */
  worldTargets(): WorldTarget[] {
    const out: WorldTarget[] = this.world.npcs.map((n) => resolveTarget(this.world, `npc:${n.id}`)!)
    for (const l of this.world.map.locations) {
      if (l.kind === 'decor' || l.kind === 'spot') continue
      out.push(resolveTarget(this.world, locationTargetId(l))!)
    }
    return out
  }

  private interactables(): WorldTarget[] {
    if (this.phase === 'playing' && this.mech instanceof DeliverMechanic) return this.mech.places
    if (this.phase === 'world') return this.worldTargets()
    return []
  }

  private adjacent(): WorldTarget[] {
    const tile = this.avatarTile()
    return this.interactables().filter((t) => tileDistance(tile, t.tiles) <= 1)
  }

  private pickAdjacent(targetId?: string): WorldTarget | null {
    const adj = this.adjacent()
    if (targetId) {
      const t = adj.find((x) => x.id === targetId)
      if (!t) throw new ActionError(`${targetId} is not next to the avatar`)
      return t
    }
    const [dx, dy] = DIRS[this.avatar.facing]
    const front: [number, number] = [this.avatar.col + dx, this.avatar.row + dy]
    return adj.find((t) => inFootprint(front, t.tiles)) ?? adj[0] ?? null
  }

  questsOf(npcId: string): Level[] {
    return this.world.levels.filter((l) => l.quest.npc_id === npcId)
  }

  line(level: Level, at: DialogueLine['at']): DialogueLine | undefined {
    return level.dialogue?.find((d) => d.at === at)
  }

  private talkTo(npc: Npc) {
    const levels = this.questsOf(npc.id)
    const available = levels.find((l) => this.quests[l.id] === 'available')
    if (available) {
      this.quests[available.id] = 'active'
      this.say(npc.id, this.line(available, 'quest')?.text ?? available.quest.title)
      return
    }
    const active = levels.find((l) => this.quests[l.id] === 'active')
    if (active) {
      const loc = this.location(active.quest.location_id)
      this.say(npc.id, `Whenever you're ready, the ${loc?.name ?? 'job'} is waiting for you.`)
      return
    }
    const done = levels.find((l) => this.quests[l.id] === 'done')
    if (done) {
      this.say(npc.id, this.line(done, 'pass')?.text ?? 'Thanks again for your help!')
      return
    }
    this.say(npc.id, `Hello! I'm ${npc.name}, ${npc.role}.`)
  }

  private useLocation(loc: MapLocation) {
    const level = this.world.levels.find((l) => l.quest.location_id === loc.id)
    if (!level) return this.hint(`${loc.name}. Nothing to do here right now.`)
    if (this.quests[level.id] === 'available') {
      const npc = this.npc(level.quest.npc_id)
      return this.hint(`${npc?.name ?? 'Someone'} might need help here. Talk to them first.`)
    }
    this.level = level
    this.mech = null
    this.bubble = null
    this.phase = 'intro'
  }

  private interactWorld(target: WorldTarget) {
    this.face(target)
    if (target.kind === 'npc') this.talkTo(target.ref as Npc)
    else this.useLocation(target.ref as MapLocation)
  }

  // --- levels ----------------------------------------------------------------

  private makeMechanic(level: Level): Mechanic {
    const ctx: MechanicCtx = {
      world: this.world,
      level,
      W: this.W,
      H: this.H,
      now: () => this.levelTime(),
      emit: (type, data) => this.emit(type, data),
      say: (npcId, text) => this.say(npcId, text),
      finish: (r) => this.finishLevel(r),
      walk: (d) => this.walk(d),
      avatarTile: () => this.avatarTile(),
    }
    switch (level.mechanic) {
      case 'mix':
        return new MixMechanic(ctx)
      case 'timing':
        return new TimingMechanic(ctx)
      case 'sort':
        return new SortMechanic(ctx)
      case 'deliver':
        return new DeliverMechanic(ctx)
      case 'converse':
        return new ConverseMechanic(ctx)
    }
  }

  /** The walkable tile in front of a level's location (where the avatar stands to use it). */
  standTile(level: Level): [number, number] {
    if (level.mechanic === 'deliver') {
      const st = (level.params as { start_tile?: [number, number] }).start_tile
      if (st && this.grid.walkable(st[0], st[1])) return [st[0], st[1]]
    }
    const loc = this.location(level.quest.location_id)
    if (!loc) return [this.world.map.spawn[0], this.world.map.spawn[1]]
    const cands: [number, number][] = [[loc.tile[0] + Math.floor(loc.w / 2), loc.tile[1] + loc.h]]
    for (let y = loc.tile[1] - 1; y <= loc.tile[1] + loc.h; y++)
      for (let x = loc.tile[0] - 1; x <= loc.tile[0] + loc.w; x++) cands.push([x, y])
    return cands.find(([x, y]) => this.grid.walkable(x, y)) ?? [this.world.map.spawn[0], this.world.map.spawn[1]]
  }

  private startLevel() {
    const level = this.level
    if (!level) return
    this.mech = this.makeMechanic(level)
    this.result = null
    this.levelT0 = this.t
    this.phase = 'playing'
    this.bubble = null
    if (level.mechanic === 'deliver') {
      const [c, r] = this.standTile(level)
      this.avatar.col = c
      this.avatar.row = r
      this.avatar.facing = 'up'
    }
    const lines = level.mechanic === 'converse' ? [] : (level.dialogue ?? []).filter((d) => d.at === 'start')
    this.chatter = lines.map((line, i) => ({ at: 600 + i * 4500, line }))
    this.emit('level_start', { level_id: level.id, mechanic: level.mechanic })
    this.mech.start()
  }

  private finishLevel(result: LevelResult) {
    const level = this.level
    if (!level || this.phase !== 'playing') return
    this.phase = 'result'
    this.result = result
    this.chatter = []
    const prev = this.best[level.id]
    this.best[level.id] = prev === null ? result.score : Math.max(prev, result.score)
    if (result.passed) this.quests[level.id] = 'done'
    this.emit('level_result', { level_id: level.id, ...result })
    const line = this.line(level, result.passed ? 'pass' : 'fail')
    if (line) this.say(line.npc_id, line.text)
  }

  private dismiss() {
    this.phase = 'world'
    this.level = null
    this.mech = null
    this.bubble = null
  }

  /** Opens a level fresh in the playing phase (bridge resetLevel). */
  resetLevel(levelId: string) {
    const level = this.world.levels.find((l) => l.id === levelId)
    if (!level) throw new ActionError(`unknown level ${levelId}`)
    if (this.quests[level.id] === 'available') this.quests[level.id] = 'active'
    const [c, r] = this.standTile(level)
    this.avatar = { col: c, row: r, facing: 'up' }
    this.level = level
    this.messages = []
    this.startLevel()
  }

  // --- inputs (shared by humans, the bridge and replays) ---------------------

  pressDir(dir: Dir) {
    if (this.phase === 'world') this.walk(dir)
    else if (this.phase === 'playing' && this.mech) this.mech.dir(dir)
  }

  /** Human key_up hold for timing hold phases. Returns true when it started a hold. */
  holdStart(): boolean {
    return this.phase === 'playing' && !!this.mech && this.mech.holdStart()
  }

  holdEnd() {
    if (this.phase === 'playing' && this.mech) this.mech.holdEnd()
  }

  interact(targetId?: string) {
    if (this.phase === 'world') {
      const t = this.pickAdjacent(targetId)
      if (!t) return this.hint('Walk right up to someone or something, then press Enter.')
      return this.interactWorld(t)
    }
    if (this.phase === 'intro') return this.startLevel()
    if (this.phase === 'result') return this.dismiss()
    if (!this.mech) return
    if (this.mech instanceof DeliverMechanic) {
      const t = this.pickAdjacent(targetId)
      if (!t) return this.hint('Stand next to the pickup or a destination first.')
      this.face(t)
      return this.mech.interact(t.id)
    }
    this.mech.interact(targetId)
  }

  pointerDown(x: number, y: number) {
    this.pointer = { x, y }
    if (this.phase === 'playing' && this.mech) this.mech.down(x, y)
  }

  pointerMove(x: number, y: number) {
    this.pointer = { x, y }
    if (this.phase === 'playing' && this.mech) this.mech.move(x, y)
  }

  pointerUp(x?: number, y?: number) {
    const px = x ?? this.pointer.x
    const py = y ?? this.pointer.y
    this.pointer = { x: px, y: py }
    if (this.phase === 'playing' && this.mech) this.mech.up(px, py)
  }

  private onMap(): boolean {
    return this.phase === 'world' || (this.phase === 'playing' && this.mech instanceof DeliverMechanic)
  }

  /** Walks one tile per STEP_MS along a shortest path, then optionally interacts. */
  *walkTo(goal: (t: [number, number]) => boolean, then?: WorldTarget): Plan {
    const startPhase = this.phase
    const path = goal(this.avatarTile()) ? [] : this.grid.path(this.avatarTile(), goal)
    if (!path) {
      this.hint("Can't get there from here.")
      return
    }
    for (const [x, y] of path) {
      if (this.phase !== startPhase) return
      const dir: Dir = x > this.avatar.col ? 'right' : x < this.avatar.col ? 'left' : y > this.avatar.row ? 'down' : 'up'
      this.walk(dir)
      yield STEP_MS
    }
    if (then && this.phase === startPhase) this.interact(then.id)
  }

  *clickPlan(x: number, y: number): Plan {
    this.pointer = { x, y }
    if (this.phase === 'intro') {
      const c = cardRect(this.W, this.H)
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) this.startLevel()
      else this.dismiss()
    } else if (this.phase === 'result') {
      this.dismiss()
    } else if (this.onMap()) {
      const col = Math.floor(x / TILE)
      const row = Math.floor(y / TILE)
      const target = this.interactables().find((t) => inFootprint([col, row], t.tiles))
      if (target) yield* this.walkTo((tile) => tileDistance(tile, target.tiles) <= 1, target)
      else if (this.grid.walkable(col, row)) yield* this.walkTo((tile) => tile[0] === col && tile[1] === row)
    } else if (this.mech) {
      this.mech.click(x, y)
    }
    yield 50
  }

  // --- observation -----------------------------------------------------------

  targets(): Target[] {
    if (this.phase === 'intro') return [{ id: 'start', kind: 'button', label: 'Start', ...cardRect(this.W, this.H), enabled: true }]
    if (this.phase === 'result') return [{ id: 'continue', kind: 'button', label: 'Continue', ...cardRect(this.W, this.H), enabled: true }]
    if (this.phase === 'playing' && this.mech) return this.mech.targets()
    return this.worldTargets().map((t) => toTarget(t))
  }

  focus(): string | null {
    if (this.phase === 'intro') return 'start'
    if (this.phase === 'result') return 'continue'
    if (this.phase === 'playing' && this.mech && !(this.mech instanceof DeliverMechanic)) return this.mech.focus()
    try {
      return this.pickAdjacent()?.id ?? null
    } catch {
      return null
    }
  }

  questSummary() {
    return this.world.levels.map((l) => ({
      level_id: l.id,
      title: l.quest.title,
      npc_id: l.quest.npc_id,
      location_id: l.quest.location_id,
      status: this.quests[l.id],
      best_score: this.best[l.id],
    }))
  }

  observe(): Observation {
    const level = this.phase === 'world' ? null : this.level
    const t = this.obsTime()
    const limit = level?.time_limit_ms ?? null
    const carrying = this.mech instanceof DeliverMechanic ? this.mech.carryingLabel() : null
    const mechState = this.phase === 'world' ? { quests: this.questSummary() } : this.mech ? this.mech.observe() : {}
    return {
      level_id: level?.id ?? null,
      mechanic: level?.mechanic ?? null,
      phase: this.phase,
      t_ms: t,
      time_limit_ms: limit,
      time_left_ms: limit && this.phase === 'playing' ? Math.max(0, limit - t) : null,
      aim: level?.aim ?? 'Find villagers with a quest marker, talk to them, then help out where they ask.',
      controls_hint: level?.controls_hint ?? 'Arrows to walk, Enter to talk or use. Or click where to go.',
      viewport: { w: this.W, h: this.H },
      avatar: { x: this.avatar.col * TILE + TILE / 2, y: this.avatar.row * TILE + TILE / 2, tile: this.avatarTile(), facing: this.avatar.facing, carrying },
      grid: { cols: this.grid.cols, rows: this.grid.rows, blocked: this.blockedCache },
      targets: this.targets(),
      focus: this.focus(),
      mechanic_state: mechState,
      messages: [...this.messages],
      last_result: this.result,
      done: this.phase === 'result',
    }
  }

  listActions(): ActionInfo[] {
    const list = this.phase === 'world' ? WORLD_CONTROLS : this.phase === 'playing' && this.mech ? MECHANIC_CONTROLS[this.mech.kind] : CARD_CONTROLS
    return list.map((c) => ({ action: c.action, params: PARAMS[c.action], description: c.description }))
  }

  // --- actions (bridge and replays) ------------------------------------------

  private point(p: unknown, what: string): { x: number; y: number } {
    const o = (p ?? {}) as { target_id?: unknown; x?: unknown; y?: unknown }
    if (typeof o.target_id === 'string') {
      const t = this.targets().find((x) => x.id === o.target_id)
      if (!t) throw new ActionError(`${what}: unknown target ${o.target_id}`)
      return { x: t.x + t.w / 2, y: t.y + t.h / 2 }
    }
    if (typeof o.x === 'number' && typeof o.y === 'number' && Number.isFinite(o.x) && Number.isFinite(o.y)) return { x: o.x, y: o.y }
    throw new ActionError(`${what}: needs target_id or x,y`)
  }

  private intParam(v: unknown, name: string, min: number, max: number, fallback: number): number {
    if (v === undefined) return fallback
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new ActionError(`${name} must be an integer ${min}-${max}`)
    return v
  }

  /** Validates an action and returns the plan that performs it. Throws ActionError. */
  plan(action: Action): Plan {
    const allowed = this.listActions().map((a) => a.action)
    if (!action || !allowed.includes(action.action)) throw new ActionError(`${action?.action} is not allowed in phase ${this.phase}`)
    const p = action.params ?? {}
    const dir = KEY_DIR[action.action]
    if (dir) {
      const hold = this.intParam(p.hold_ms, 'hold_ms', 0, 5000, 0)
      return this.keyPlan(dir, hold)
    }
    switch (action.action) {
      case 'mouse_click': {
        const pt = this.point(p, 'mouse_click')
        return this.clickPlan(pt.x, pt.y)
      }
      case 'mouse_down': {
        const pt = this.point(p, 'mouse_down')
        return instant(() => this.pointerDown(pt.x, pt.y))
      }
      case 'mouse_up': {
        const x = typeof p.x === 'number' ? p.x : undefined
        const y = typeof p.y === 'number' ? p.y : undefined
        return instant(() => this.pointerUp(x, y))
      }
      case 'mouse_drag': {
        const from = this.point(p.from, 'mouse_drag.from')
        const to = this.point(p.to, 'mouse_drag.to')
        const ms = this.intParam(p.duration_ms, 'duration_ms', 0, 5000, 200)
        return (function* (e: GameEngine): Plan {
          e.pointerDown(from.x, from.y)
          const steps = 4
          for (let i = 1; i <= steps; i++) {
            e.pointerMove(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
            yield ms / steps
          }
          e.pointerUp(to.x, to.y)
        })(this)
      }
      case 'interact': {
        const target = typeof p.target_id === 'string' ? p.target_id : undefined
        if (target && this.onMap()) this.pickAdjacent(target)
        return instant(() => this.interact(target))
      }
      case 'wait': {
        const ms = this.intParam(p.ms, 'ms', 0, 10000, 0)
        return (function* (): Plan {
          yield ms
        })()
      }
      default:
        throw new ActionError(`${action.action} is not supported`)
    }
  }

  private *keyPlan(dir: Dir, hold: number): Plan {
    if (dir === 'up' && this.holdStart()) {
      if (hold > 0) {
        yield hold
        this.holdEnd()
      } else {
        this.holdEnd()
        yield STEP_MS
      }
      return
    }
    const steps = 1 + Math.floor(hold / STEP_MS)
    const startPhase = this.phase
    for (let i = 0; i < steps; i++) {
      if (this.phase !== startPhase) return
      this.pressDir(dir)
      yield i < steps - 1 ? STEP_MS : hold > 0 ? hold - STEP_MS * (steps - 1) : STEP_MS
    }
  }

  /** Runs an action immediately in virtual time. */
  act(action: Action): ActResult {
    const events: GameEvent[] = []
    const off = this.onEvent((e) => events.push(e))
    try {
      const plan = this.plan(action)
      for (const ms of plan) this.advance(ms)
      return this.actResult(true, events)
    } catch (err) {
      if (!(err instanceof ActionError)) throw err
      this.emit('error', { message: err.message })
      return this.actResult(false, events, err.message)
    } finally {
      off()
    }
  }

  actResult(ok: boolean, events: GameEvent[], error?: string): ActResult {
    const done = this.phase === 'result'
    return { ok, ...(error ? { error } : {}), observation: this.observe(), done, score: done && this.result ? this.result.score : null, events }
  }
}
