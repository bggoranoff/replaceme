import type { Target } from '../../contract'
import { hit, timingMeter } from '../layout'
import { scoreTiming } from '../scoring'
import type { TimingParams, TimingPhase } from '../types'
import type { Dir, Mechanic, MechanicCtx } from './base'

/** Needle position for a 'stop' phase: triangle wave min -> max -> min, starting at min. */
export function needleValue(p: TimingPhase, elapsedMs: number): number {
  const period = p.period_ms && p.period_ms > 0 ? p.period_ms : 3000
  const f = (elapsedMs % period) / period
  const tri = f < 0.5 ? f * 2 : 2 - f * 2
  return p.min + (p.max - p.min) * tri
}

export function fillValue(p: TimingPhase, heldMs: number): number {
  const rate = p.fill_per_s && p.fill_per_s > 0 ? p.fill_per_s : (p.max - p.min) / 4
  return Math.min(p.max, p.min + (rate * heldMs) / 1000)
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
  done = false
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as TimingParams
  }

  get phase(): TimingPhase | undefined {
    return this.params.phases[this.index]
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
    return [{ id: 'meter', kind: 'meter', label: p.label, ...this.meterRect(), enabled: true }]
  }

  focus() {
    return this.done ? null : 'meter'
  }

  start() {
    this.phaseT0 = this.ctx.now()
  }

  private endPhase(value: number) {
    const p = this.phase
    if (!p || this.done) return
    this.results[p.id] = round(value)
    this.holding = false
    this.ctx.emit('phase_end', { phase_id: p.id, value: this.results[p.id] })
    this.index += 1
    this.phaseT0 = this.ctx.now()
    if (this.index >= this.params.phases.length) {
      this.done = true
      this.ctx.finish(scoreTiming(this.ctx.level, this.results))
    }
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
    if (hit(this.meterRect(), x, y)) this.stop()
  }

  down(x: number, y: number) {
    if (hit(this.meterRect(), x, y)) this.holdStart()
  }

  move() {}

  up() {
    this.holdEnd()
  }

  advance() {}

  observe() {
    const p = this.phase
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
    return scoreTiming(this.ctx.level, this.results)
  }
}
