// Craft station: every variable is a physical tool whose verb is picked from its unit, label and range
// (never from the job). The value <-> control mapping stays step based and deterministic:
// one key press step, one click, or 100 ms of mouse hold on a tool = one variable step; clicking or
// dragging a station's gauge (slider:<var_id>) sets the value at that position, snapped to the step.
import type { Target } from '../../contract'
import { craftLayout, hit, STEP_MS } from '../layout'
import { scoreMix } from '../scoring'
import type { MixParams, Variable } from '../types'
import type { Dir, Mechanic, MechanicCtx } from './base'

export type Verb = 'pour' | 'scoop' | 'steep' | 'heat' | 'stack' | 'pump'

export function snapTo(v: Variable, value: number): number {
  const n = Math.round((value - v.min) / v.step)
  const snapped = Math.min(v.max, Math.max(v.min, v.min + n * v.step))
  return Math.round(snapped * 1e6) / 1e6
}

const TIME = new Set(['s', 'sec', 'secs', 'second', 'seconds', 'min', 'mins', 'minute', 'minutes', 'h', 'hr', 'hrs', 'hour', 'hours', 'ms', 'day', 'days'])
const TEMP = new Set(['°c', '°f', 'ºc', 'ºf', 'c', 'f', 'degc', 'degf', 'deg', 'degrees', '℃', '℉'])
const LIQUID_ML: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000, oz: 30, 'fl oz': 30, floz: 30, pt: 473, qt: 946, gal: 3785 }
const MASS_G: Record<string, number> = { mg: 0.001, g: 1, gram: 1, grams: 1, kg: 1000, lb: 454, lbs: 454, tsp: 5, tbsp: 15, pinch: 0.5 }
const COUNT = /^(x|×|pcs?|pieces?|items?|units?|count|cups?|boxes|box|bags?|frames?|crates?|bottles?|cartons?|stems?|bunches|bunch|packs?|rolls?|sheets?|loaves|loaf|eggs?|portions?|servings?|scoops?|drops?|shots?|)$/
const LIQUID_LABEL = /\b(water|milk|oil|juice|syrup|cream|broth|stock|wine|vinegar|liquid|solution|rinse)\b/i
const POUR_MAX_ML = 5000
const SCOOP_MAX_G = 5000
const SCOOP_MAX_COUNT = 30

/** The physical verb for a variable, from its unit, label and range only. */
export function verbFor(v: Variable): Verb {
  const u = v.unit.trim().toLowerCase().replace(/\.$/, '')
  if (TIME.has(u)) return 'steep'
  if (TEMP.has(u)) return 'heat'
  if (u in LIQUID_ML) return v.max * LIQUID_ML[u] <= POUR_MAX_ML ? 'pour' : 'stack'
  if (u in MASS_G) {
    const small = v.max * MASS_G[u] <= SCOOP_MAX_G
    if (!small) return 'stack'
    return LIQUID_LABEL.test(v.label) ? 'pour' : 'scoop'
  }
  if (COUNT.test(u)) return v.max <= SCOOP_MAX_COUNT ? 'scoop' : 'stack'
  return 'pump'
}

/** Human words for each verb: [hold label, take-back label]. */
export const VERB_WORDS: Record<Verb, { act: string; back: string }> = {
  pour: { act: 'Pour', back: 'Pour off' },
  scoop: { act: 'Add', back: 'Take out' },
  steep: { act: 'Brew', back: 'Less' },
  heat: { act: 'Heat', back: 'Cool' },
  stack: { act: 'Load', back: 'Unload' },
  pump: { act: 'Pump', back: 'Ease' },
}

/** Cosmetic per-tool motion (used only for animation, never for values). */
export interface ToolFx {
  at: number
  dir: 1 | -1
  streak: number
}

export class MixMechanic implements Mechanic {
  readonly kind = 'mix' as const
  readonly params: MixParams
  readonly verbs: Verb[]
  values: number[]
  selected = 0
  added: string[] = []
  fx: ToolFx[]
  /** Mouse hold on the tool (+1) or the take-back button (-1): one step per 100 ms held. */
  hold: { index: number; sign: 1 | -1; at: number; done: number } | null = null
  /** Variable whose gauge is being dragged. */
  dragging: number | null = null
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as MixParams
    this.verbs = this.params.variables.map(verbFor)
    this.values = this.params.variables.map((v) => snapTo(v, v.default))
    this.fx = this.params.variables.map(() => ({ at: -1e9, dir: 1, streak: 0 }))
  }

  layout() {
    return craftLayout(this.ctx.W, this.ctx.H, this.params.variables.length, this.params.ingredients?.length ?? 0)
  }

  submitRect() {
    return this.layout().submit
  }

  targets(): Target[] {
    const l = this.layout()
    const out: Target[] = this.params.variables.flatMap((v, i): Target[] => [
      { id: `slider:${v.id}`, kind: 'slider', label: v.label, ...l.gauges[i], enabled: true },
      { id: `item:${v.id}`, kind: 'item', label: v.label, ...l.items[i], enabled: true },
    ])
    const v = this.params.variables[this.selected]
    const words = VERB_WORDS[this.verbs[this.selected]]
    out.push({ id: `tool:${v.id}`, kind: 'button', label: `${words.act} ${v.label}`, ...l.tool, enabled: true })
    out.push({ id: `back:${v.id}`, kind: 'button', label: `${words.back} ${v.label}`, ...l.back, enabled: true })
    ;(this.params.ingredients ?? []).forEach((g, i) => out.push({ id: `ingredient:${g.id}`, kind: 'item', label: g.label, ...l.ingredients[i], enabled: true }))
    out.push({ id: 'submit', kind: 'submit', label: this.params.submit_label, ...l.submit, enabled: true })
    return out
  }

  focus() {
    return `item:${this.params.variables[this.selected].id}`
  }

  start() {}

  /** One step of the selected tool's verb (+1) or taking one step back (-1). */
  private nudge(i: number, sign: 1 | -1) {
    const v = this.params.variables[i]
    const before = this.values[i]
    this.values[i] = snapTo(v, before + sign * v.step)
    const now = this.ctx.now()
    const f = this.fx[i]
    const chained = f.dir === sign && now - f.at <= STEP_MS * 1.6
    this.fx[i] = { at: now, dir: sign, streak: chained ? f.streak + 1 : 1 }
    const juice = this.ctx.juice
    if (this.values[i] === before) {
      // already empty / full: a dull knock instead of a tick
      if (!chained) {
        juice.squash(`craft:tool:${v.id}`, 0.12, 240)
        juice.sfx('tap', { pitch: 0.55, volume: 0.6 })
      }
      return
    }
    // a ratchet tick that climbs as the amount grows
    const frac = (this.values[i] - v.min) / (v.max - v.min || 1)
    juice.sfx('tick', { pitch: 0.75 + frac * 0.9, volume: sign > 0 ? 0.5 : 0.35 })
  }

  private setFromX(i: number, x: number) {
    const v = this.params.variables[i]
    const g = this.layout().gauges[i]
    const frac = Math.min(1, Math.max(0, (x - g.x) / g.w))
    const before = this.values[i]
    this.values[i] = snapTo(v, v.min + frac * (v.max - v.min))
    if (this.values[i] !== before) {
      this.fx[i] = { at: this.ctx.now(), dir: this.values[i] > before ? 1 : -1, streak: 1 }
      this.ctx.juice.sfx('tick', { pitch: 0.75 + frac * 0.9, volume: 0.35 })
    }
    this.select(i)
  }

  /** The gauge under (x, y), with a few pixels of slack so it is easy to grab. */
  private gaugeAt(x: number, y: number) {
    return this.layout().gauges.findIndex((g) => hit({ x: g.x - 3, y: g.y - 3, w: g.w + 6, h: g.h + 6 }, x, y))
  }

  private select(i: number) {
    if (i === this.selected) return
    this.selected = i
    this.hold = null
    this.ctx.juice.select(`craft:item:${this.params.variables[i].id}`)
  }

  dir(d: Dir) {
    const n = this.params.variables.length
    if (d === 'up') this.select(Math.max(0, this.selected - 1))
    else if (d === 'down') this.select(Math.min(n - 1, this.selected + 1))
    else this.nudge(this.selected, d === 'left' ? -1 : 1)
  }

  holdStart() {
    return false
  }

  holdEnd() {}

  interact() {
    this.submit()
  }

  click(x: number, y: number) {
    const l = this.layout()
    const gauge = this.gaugeAt(x, y)
    if (gauge >= 0) return this.setFromX(gauge, x)
    const item = l.items.findIndex((r) => hit(r, x, y))
    if (item >= 0) return this.select(item)
    if (hit(l.back, x, y)) return this.nudge(this.selected, -1)
    if (hit(l.tool, x, y)) return this.nudge(this.selected, 1)
    const ing = l.ingredients.findIndex((r) => hit(r, x, y))
    if (ing >= 0 && this.params.ingredients) {
      this.added.push(this.params.ingredients[ing].id)
      return
    }
    if (hit(l.submit, x, y)) this.submit()
  }

  down(x: number, y: number) {
    const gauge = this.gaugeAt(x, y)
    if (gauge >= 0) {
      this.dragging = gauge
      this.hold = null
      return this.setFromX(gauge, x)
    }
    const l = this.layout()
    const sign = hit(l.back, x, y) ? -1 : hit(l.tool, x, y) ? 1 : 0
    this.hold = sign ? { index: this.selected, sign, at: this.ctx.now(), done: 0 } : null
  }

  move(x: number) {
    if (this.dragging !== null) this.setFromX(this.dragging, x)
  }

  up(x: number) {
    if (this.dragging !== null) {
      this.setFromX(this.dragging, x)
      this.dragging = null
      return
    }
    this.advance()
    this.hold = null
  }

  advance() {
    const h = this.hold
    if (!h) return
    const due = Math.floor((this.ctx.now() - h.at) / STEP_MS)
    while (h.done < due) {
      h.done++
      this.nudge(h.index, h.sign)
    }
  }

  valueMap(): Record<string, number> {
    return Object.fromEntries(this.params.variables.map((v, i) => [v.id, this.values[i]]))
  }

  observe() {
    return {
      variables: this.params.variables.map((v, i) => ({ id: v.id, label: v.label, unit: v.unit, min: v.min, max: v.max, step: v.step, value: this.values[i], verb: this.verbs[i] })),
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
