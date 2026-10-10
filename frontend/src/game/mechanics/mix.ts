import type { Target } from '../../contract'
import { hit, mixIngredients, mixRows, mixSubmit } from '../layout'
import { scoreMix } from '../scoring'
import type { MixParams, Variable } from '../types'
import type { Dir, Mechanic, MechanicCtx } from './base'

export function snapTo(v: Variable, value: number): number {
  const n = Math.round((value - v.min) / v.step)
  const snapped = Math.min(v.max, Math.max(v.min, v.min + n * v.step))
  return Math.round(snapped * 1e6) / 1e6
}

export class MixMechanic implements Mechanic {
  readonly kind = 'mix' as const
  readonly params: MixParams
  values: number[]
  selected = 0
  added: string[] = []
  dragging: number | null = null
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as MixParams
    this.values = this.params.variables.map((v) => snapTo(v, v.default))
  }

  rows() {
    return mixRows(this.ctx.W, this.ctx.H, this.params.variables.length)
  }

  ingredientRects() {
    return mixIngredients(this.ctx.W, this.ctx.H, this.params.ingredients?.length ?? 0)
  }

  submitRect() {
    return mixSubmit(this.ctx.W, this.ctx.H)
  }

  targets(): Target[] {
    const rows = this.rows()
    const out: Target[] = this.params.variables.map((v, i) => ({
      id: `slider:${v.id}`,
      kind: 'slider',
      label: v.label,
      ...rows[i].track,
      enabled: true,
    }))
    const ing = this.ingredientRects()
    ;(this.params.ingredients ?? []).forEach((g, i) => out.push({ id: `ingredient:${g.id}`, kind: 'item', label: g.label, ...ing[i], enabled: true }))
    out.push({ id: 'submit', kind: 'submit', label: this.params.submit_label, ...this.submitRect(), enabled: true })
    return out
  }

  focus() {
    return `slider:${this.params.variables[this.selected].id}`
  }

  start() {}

  dir(d: Dir) {
    const n = this.params.variables.length
    if (d === 'up') this.selected = Math.max(0, this.selected - 1)
    else if (d === 'down') this.selected = Math.min(n - 1, this.selected + 1)
    else {
      const v = this.params.variables[this.selected]
      this.values[this.selected] = snapTo(v, this.values[this.selected] + (d === 'left' ? -v.step : v.step))
    }
  }

  holdStart() {
    return false
  }

  holdEnd() {}

  interact() {
    this.submit()
  }

  private setFromX(i: number, x: number) {
    const v = this.params.variables[i]
    const t = this.rows()[i].track
    const frac = Math.min(1, Math.max(0, (x - t.x) / t.w))
    this.values[i] = snapTo(v, v.min + frac * (v.max - v.min))
    this.selected = i
  }

  private sliderAt(x: number, y: number) {
    return this.rows().findIndex((r) => hit({ x: r.track.x - 4, y: r.track.y - 3, w: r.track.w + 8, h: r.track.h + 6 }, x, y))
  }

  click(x: number, y: number) {
    const i = this.sliderAt(x, y)
    if (i >= 0) return this.setFromX(i, x)
    const ing = this.ingredientRects().findIndex((r) => hit(r, x, y))
    if (ing >= 0 && this.params.ingredients) {
      this.added.push(this.params.ingredients[ing].id)
      return
    }
    if (hit(this.submitRect(), x, y)) this.submit()
  }

  down(x: number, y: number) {
    const i = this.sliderAt(x, y)
    if (i >= 0) {
      this.dragging = i
      this.setFromX(i, x)
    }
  }

  move(x: number) {
    if (this.dragging !== null) this.setFromX(this.dragging, x)
  }

  up(x: number) {
    if (this.dragging !== null) this.setFromX(this.dragging, x)
    this.dragging = null
  }

  advance() {}

  valueMap(): Record<string, number> {
    return Object.fromEntries(this.params.variables.map((v, i) => [v.id, this.values[i]]))
  }

  observe() {
    return {
      variables: this.params.variables.map((v, i) => ({ id: v.id, label: v.label, unit: v.unit, min: v.min, max: v.max, step: v.step, value: this.values[i] })),
      selected_index: this.selected,
      added_order: [...this.added],
    }
  }

  private submit() {
    this.ctx.finish(scoreMix(this.ctx.level, this.valueMap(), this.added))
  }

  timeout() {
    return scoreMix(this.ctx.level, this.valueMap(), this.added)
  }
}
