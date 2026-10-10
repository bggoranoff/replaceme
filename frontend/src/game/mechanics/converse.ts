import type { Target } from '../../contract'
import { conversePortrait, converseOptions, hit } from '../layout'
import { tierOfPoints } from '../render/juice'
import { scoreConverse } from '../scoring'
import type { ConverseParams } from '../types'
import type { Dir, Mechanic, MechanicCtx } from './base'

export class ConverseMechanic implements Mechanic {
  readonly kind = 'converse' as const
  readonly params: ConverseParams
  index = 0
  selected = 0
  history: { turn_id: string; option_id: string }[] = []
  lastReply: string | null = null
  ended = false
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as ConverseParams
  }

  get turn() {
    return this.params.turns[this.index] ?? null
  }

  get npc() {
    return this.ctx.world.npcs.find((n) => n.id === this.params.npc_id) ?? null
  }

  optionRects() {
    return converseOptions(this.ctx.W, this.ctx.H, this.turn?.options.length ?? 0)
  }

  targets(): Target[] {
    const t = this.turn
    if (!t || this.ended) return []
    const rects = this.optionRects()
    return t.options.map((o, i) => ({ id: `choice:${o.id}`, kind: 'choice', label: o.text, ...rects[i], enabled: true }))
  }

  focus() {
    const t = this.turn
    return t && !this.ended ? `choice:${t.options[this.selected].id}` : null
  }

  start() {
    if (this.turn) this.ctx.say(this.params.npc_id, this.turn.npc_line)
  }

  private choose(i: number) {
    const t = this.turn
    if (!t || this.ended || i < 0 || i >= t.options.length) return
    const opt = t.options[i]
    this.history.push({ turn_id: t.id, option_id: opt.id })
    this.lastReply = opt.reply
    this.ctx.say(this.params.npc_id, opt.reply)
    const spec = this.ctx.level.scoring.turns?.[t.id]?.[opt.id]
    this.react(spec?.critical ? 0 : tierOfPoints(spec?.points ?? 0.5))
    if (spec?.critical) {
      this.ended = true
      this.ctx.finish(scoreConverse(this.ctx.level, this.chosen(), 'critical'))
      return
    }
    this.index += 1
    this.selected = 0
    if (!this.turn) {
      this.ended = true
      this.ctx.finish(scoreConverse(this.ctx.level, this.chosen(), 'complete'))
      return
    }
    this.ctx.say(this.params.npc_id, this.turn.npc_line)
    this.ctx.juice.pop('converse:options', 300)
  }

  /** Cosmetic: the customer's face reacts to the answer (display only, never observed). */
  private react(tier: 0 | 1 | 2 | 3) {
    const fx = this.ctx.juice
    const pr = conversePortrait(this.ctx.W, this.ctx.H)
    fx.react('converse', tier, 2400)
    fx.reactSound(tier)
    if (tier === 3) fx.burst(pr.x + pr.w / 2, pr.y + 10, { colors: ['#f2c14e', '#fff0a8', '#ffffff'], count: 16, speed: 70, gravity: 60, shape: 'star', up: true })
    if (tier === 0) fx.shake(1.5, 200)
  }

  dir(d: Dir) {
    const n = this.turn?.options.length ?? 0
    const before = this.selected
    if (d === 'up') this.selected = Math.max(0, this.selected - 1)
    else if (d === 'down') this.selected = Math.min(Math.max(0, n - 1), this.selected + 1)
    if (this.selected !== before) this.ctx.juice.select(`converse:option:${this.selected}`)
  }

  holdStart() {
    return false
  }

  holdEnd() {}

  interact(targetId?: string) {
    const t = this.turn
    if (targetId?.startsWith('choice:') && t) return this.choose(t.options.findIndex((o) => `choice:${o.id}` === targetId))
    this.choose(this.selected)
  }

  click(x: number, y: number) {
    const i = this.optionRects().findIndex((r) => hit(r, x, y))
    if (i >= 0) {
      this.selected = i
      this.choose(i)
    }
  }

  down() {}
  move() {}
  up() {}
  advance() {}

  chosen(): Record<string, string> {
    return Object.fromEntries(this.history.map((h) => [h.turn_id, h.option_id]))
  }

  observe() {
    const t = this.turn
    const npc = this.npc
    return {
      npc: { id: this.params.npc_id, name: npc?.name ?? this.params.npc_id },
      turn_index: this.index,
      turns_total: this.params.turns.length,
      line: t?.npc_line ?? null,
      last_reply: this.lastReply,
      options: t ? t.options.map((o) => ({ id: o.id, text: o.text })) : [],
      selected_index: this.selected,
      history: [...this.history],
    }
  }

  timeout() {
    return scoreConverse(this.ctx.level, this.chosen(), 'timeout')
  }
}
