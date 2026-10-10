import type { Target } from '../../contract'
import { hit, timingMeter } from '../layout'
import { tierOfPoints, type Tier } from '../render/juice'
import { sceneOf } from '../render/timingScene'
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
  const rate = p.fill_per_s && p.fill_per_s > 0 ? p.fill_per_s : (p.max - p.min) / 4
  return Math.min(p.max, p.min + (rate * heldMs) / 1000)
}

/**
 * Human play only: after each phase the meter rests this long so its reaction can be seen, and the
 * next needle starts after it. Agent runs and replays have no beat, so their timing is unchanged.
 */
export const PHASE_BEAT_MS = 900

/** How a finished phase went, for display only (never observed). */
export interface Reaction {
  phase: TimingPhase
  value: number
  /** 0 way off .. 3 perfect (juice tiers); null when the phase is not scored. */
  tier: Tier | null
  /** -1 under the good range, 1 over it, 0 inside. */
  dir: -1 | 0 | 1
  /** Level time of the stop / release. */
  at: number
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
  /** All phases played; the level finishes now (agents) or after the last beat (human play). */
  done = false
  private finished = false
  private pauseUntil = 0
  private downStopped = false
  private readonly beatMs: number
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as TimingParams
    this.beatMs = ctx.interactive ? PHASE_BEAT_MS : 0
  }

  get phase(): TimingPhase | undefined {
    return this.params.phases[this.index]
  }

  now(): number {
    return this.ctx.now()
  }

  /** ms left in the beat after a phase (always 0 outside human play). */
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
    const term: NumericTerm | undefined = this.ctx.level.scoring.variables?.[p.id]
    let tier: Tier | null = null
    let dir: -1 | 0 | 1 = 0
    if (term) {
      tier = tierOfPoints(curveScore(term, deviation(term, value)))
      const [lo, hi] = term.range ?? [term.target ?? 0, term.target ?? 0]
      dir = value < lo ? -1 : value > hi ? 1 : 0
    }
    return { phase: p, value, tier, dir, at: this.ctx.now() }
  }

  /** Cosmetic: sound and sparkles for a finished phase (silent and unseen in agent runs). */
  private celebrate(r: Reaction) {
    const fx = this.ctx.juice
    fx.loop('timing', null)
    if (r.tier === null) return
    fx.reactSound(r.tier)
    const m = this.meterRect()
    const x = m.x + (m.w - 132) / 2
    const y = m.y + 34
    if (r.tier === 3) fx.burst(x, y, { colors: ['#f2c14e', '#fff0a8', '#ffffff'], count: 18, speed: 85, gravity: 90, shape: 'star', up: true })
    else if (r.tier === 2) fx.burst(x, y, { colors: ['#9fd36f', '#fff0a8', '#ffffff'], count: 10, speed: 65, gravity: 90, shape: 'star', up: true })
    else if (r.tier === 0) fx.shake(1.5, 200)
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
    this.celebrate(r)
    this.ctx.emit('phase_end', { phase_id: p.id, value: v })
    this.index += 1
    this.pauseUntil = this.ctx.now() + this.beatMs
    this.phaseT0 = this.pauseUntil
    if (this.index >= this.params.phases.length) {
      this.done = true
      if (this.beatMs === 0) this.finish()
    }
  }

  private finish() {
    if (this.finished) return
    this.finished = true
    this.ctx.finish(scoreTiming(this.ctx.level, this.results))
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
      const scene = sceneOf(p)
      this.ctx.juice.loop('timing', scene === 'pour' || scene === 'dip' ? 'pour' : 'hum', { volume: 0.5 })
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
    if (this.ctx.interactive && this.phase?.mode === 'stop') {
      // a human press stops the needle at once (no click lag); the click that follows it is swallowed
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
    if (this.done && this.pauseLeft() <= 0) this.finish()
  }

  observe() {
    const p = this.live() ? this.phase : undefined
    return {
      phase_index: this.index,
      phases_total: this.params.phases.length,
      meter: p
        ? { id: p.id, label: p.label, unit: p.unit, min: p.min, max: p.max, mode: p.mode, value: round(this.value()), moving: p.mode === 'stop', holding: this.holding }
        : null,
      results: Object.entries(this.results).map(([id, value]) => ({ id, value })),
    }
  }

  timeout() {
    this.ctx.juice.loop('timing', null)
    return scoreTiming(this.ctx.level, this.results)
  }
}
