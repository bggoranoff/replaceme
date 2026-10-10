import type { Target } from '../../contract'
import { hit, timingMeter } from '../layout'
import { curveScore, deviation, scoreTiming } from '../scoring'
import type { NumericTerm, TimingParams, TimingPhase } from '../types'
import type { Dir, Mechanic, MechanicCtx } from './base'

/** Needle position for a 'stop' phase: triangle wave min -> max -> min, starting at min. */
export function needleValue(p: TimingPhase, elapsedMs: number): number {
  const period = p.period_ms && p.period_ms > 0 ? p.period_ms : 3000
  const f = (Math.max(0, elapsedMs) % period) / period
  const tri = f < 0.5 ? f * 2 : 2 - f * 2
  return p.min + (p.max - p.min) * tri
}

export function fillValue(p: TimingPhase, heldMs: number): number {
  return Math.min(p.max, p.min + (fillRate(p) * heldMs) / 1000)
}

export function fillRate(p: TimingPhase): number {
  return p.fill_per_s && p.fill_per_s > 0 ? p.fill_per_s : (p.max - p.min) / 4
}

/** Pause after each phase so the reaction can be seen; the next phase starts (and the needle moves) after it. */
export const PHASE_BEAT_MS = 900

export type Tier = 'perfect' | 'great' | 'good' | 'miss'

export interface Reaction {
  phase: TimingPhase
  value: number
  tier: Tier | null
  /** -1 under the good range, 1 over it, 0 inside. */
  dir: -1 | 0 | 1
  at: number
}

export function tierOf(s: number): Tier {
  return s >= 0.92 ? 'perfect' : s >= 0.7 ? 'great' : s >= 0.4 ? 'good' : 'miss'
}

/** Small deterministic hash in [0, 1) from a string. */
function unit(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * The gold "sweet zone" drawn on the meter. It is honest but never the answer: it spans the good range
 * plus two tolerances, and the good range sits off-centre inside it (offset seeded per level and phase),
 * so landing in the zone passes and finding the perfect spot still takes practice. Rendering only:
 * never part of observations.
 */
export function sweetZone(levelId: string, p: TimingPhase, term: NumericTerm | undefined): [number, number] | null {
  if (!term || !(term.tolerance > 0)) return null
  const [lo, hi] = term.range ?? [term.target ?? 0, term.target ?? 0]
  const a = 0.35 + 1.3 * unit(`${levelId}:${p.id}`)
  const z0 = Math.max(p.min, lo - a * term.tolerance)
  const z1 = Math.min(p.max, hi + (2 - a) * term.tolerance)
  return z1 > z0 ? [z0, z1] : null
}

const round = (x: number) => Math.round(x * 1000) / 1000

export class TimingMechanic implements Mechanic {
  readonly kind = 'timing' as const
  readonly params: TimingParams
  index = 0
  phaseT0 = 0
  holding = false
  holdT0 = 0
  results: Record<string, number> = {}
  reactions: Record<string, Reaction> = {}
  last: Reaction | null = null
  /** All phases played (inputs closed); the score card follows after the last reaction beat. */
  done = false
  private finished = false
  private pauseUntil = 0
  private downStopped = false
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as TimingParams
  }

  get phase(): TimingPhase | undefined {
    return this.params.phases[this.index]
  }

  term(p: TimingPhase): NumericTerm | undefined {
    return this.ctx.level.scoring.variables?.[p.id]
  }

  zone(p: TimingPhase): [number, number] | null {
    return sweetZone(this.ctx.level.id, p, this.term(p))
  }

  now(): number {
    return this.ctx.now()
  }

  /** ms left in the reaction beat between phases (0 when the current phase is live). */
  pauseLeft(): number {
    return Math.max(0, this.pauseUntil - this.ctx.now())
  }

  private live(): boolean {
    return !this.done && !!this.phase && this.pauseLeft() <= 0
  }

  value(): number {
    const p = this.phase
    if (!p) return 0
    const now = this.ctx.now()
    if (p.mode === 'hold') return this.holding ? fillValue(p, now - this.holdT0) : p.min
    return needleValue(p, now - this.phaseT0)
  }

  meterRect() {
    return timingMeter(this.ctx.W, this.ctx.H)
  }

  targets(): Target[] {
    const p = this.phase
    if (!p || this.done) return []
    return [{ id: 'meter', kind: 'meter', label: p.label, ...this.meterRect(), enabled: this.live() }]
  }

  focus() {
    return this.done ? null : 'meter'
  }

  start() {
    this.phaseT0 = this.ctx.now()
  }

  private react(p: TimingPhase, value: number): Reaction {
    const term = this.term(p)
    let tier: Tier | null = null
    let dir: -1 | 0 | 1 = 0
    if (term) {
      tier = tierOf(curveScore(term, deviation(term, value)))
      const [lo, hi] = term.range ?? [term.target ?? 0, term.target ?? 0]
      dir = value < lo ? -1 : value > hi ? 1 : 0
    }
    return { phase: p, value, tier, dir, at: this.ctx.now() }
  }

  private endPhase(value: number) {
    const p = this.phase
    if (!p || !this.live()) return
    const v = round(value)
    this.results[p.id] = v
    this.holding = false
    const r = this.react(p, v)
    this.reactions[p.id] = r
    this.last = r
    this.ctx.emit('phase_end', { phase_id: p.id, value: v, reaction: r.tier })
    this.index += 1
    this.pauseUntil = this.ctx.now() + PHASE_BEAT_MS
    this.phaseT0 = this.pauseUntil
    if (this.index >= this.params.phases.length) this.done = true
  }

  stop() {
    if (this.phase?.mode === 'stop') this.endPhase(this.value())
  }

  dir(d: Dir) {
    if (d === 'up') this.stop()
  }

  holdStart() {
    const p = this.phase
    if (!p || p.mode !== 'hold') return false
    if (!this.live()) return true // swallow the key during the beat so it never walks or stops anything
    if (!this.holding) {
      this.holding = true
      this.holdT0 = this.ctx.now()
    }
    return true
  }

  holdEnd() {
    if (this.holding) this.endPhase(this.value())
  }

  interact() {
    this.stop()
  }

  click(x: number, y: number) {
    if (this.downStopped) {
      this.downStopped = false
      return
    }
    if (hit(this.meterRect(), x, y)) this.stop()
  }

  down(x: number, y: number) {
    this.downStopped = false
    if (!hit(this.meterRect(), x, y)) return
    if (this.phase?.mode === 'stop') {
      // a press stops the needle at once (no click lag); the click that follows the press is swallowed
      const before = this.index
      this.stop()
      this.downStopped = this.index !== before
      return
    }
    this.holdStart()
  }

  move() {}

  up() {
    this.holdEnd()
  }

  advance() {
    const p = this.phase
    // spilling over: a hold that reaches the top of the meter ends there
    if (p && this.holding && p.mode === 'hold' && this.ctx.now() - this.holdT0 >= ((p.max - p.min) / fillRate(p)) * 1000) {
      this.endPhase(p.max)
    }
    if (this.done && !this.finished && this.pauseLeft() <= 0) {
      this.finished = true
      this.ctx.finish(scoreTiming(this.ctx.level, this.results))
    }
  }

  observe() {
    const p = this.live() ? this.phase : undefined
    return {
      phase_index: this.index,
      phases_total: this.params.phases.length,
      meter: p
        ? { id: p.id, label: p.label, unit: p.unit, min: p.min, max: p.max, mode: p.mode, value: round(this.value()), moving: p.mode === 'stop', holding: this.holding }
        : null,
      pause_ms: Math.round(this.pauseLeft()),
      results: Object.entries(this.results).map(([id, value]) => ({ id, value, reaction: this.reactions[id]?.tier ?? null })),
    }
  }

  timeout() {
    return scoreTiming(this.ctx.level, this.results)
  }
}
