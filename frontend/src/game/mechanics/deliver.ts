import type { Target } from '../../contract'
import { scoreDeliver, type OrderStatus } from '../scoring'
import type { DeliverParams } from '../types'
import { TILE } from '../layout'
import { drawParcel, ribbonColor } from '../render/objects'
import { resolveTarget, toTarget, type WorldTarget } from '../worldTargets'
import type { Dir, Mechanic, MechanicCtx } from './base'

export class DeliverMechanic implements Mechanic {
  readonly kind = 'deliver' as const
  readonly params: DeliverParams
  status: Record<string, OrderStatus> = {}
  carrying: string[] = []
  finishedAt: number | null = null
  readonly places: WorldTarget[]
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as DeliverParams
    for (const o of this.params.orders) this.status[o.id] = 'waiting'
    const ids = [...new Set(this.params.orders.flatMap((o) => [o.from, o.to]))]
    this.places = ids.map((id) => resolveTarget(ctx.world, id)).filter((t): t is WorldTarget => !!t)
  }

  targets(): Target[] {
    return this.places.map((p) => toTarget(p))
  }

  focus() {
    return null
  }

  start() {}

  dir(d: Dir) {
    this.ctx.walk(d)
  }

  holdStart() {
    return false
  }

  holdEnd() {}

  isPickup(id: string) {
    return this.params.orders.some((o) => o.from === id)
  }

  /** targetId is the adjacent place the engine resolved. */
  interact(targetId?: string) {
    if (!targetId) return
    const capacity = Math.max(1, this.params.capacity || 1)
    const waiting = this.params.orders.find((o) => o.from === targetId && this.status[o.id] === 'waiting')
    if (waiting && this.carrying.length < capacity) {
      this.status[waiting.id] = 'carrying'
      this.carrying.push(waiting.id)
      this.ctx.emit('pickup', { order_id: waiting.id, item: waiting.item })
      const [c, r] = this.ctx.avatarTile()
      this.parcelFlight(waiting.id, this.placeRect(targetId), { x: c * TILE, y: r * TILE - 34, w: TILE, h: 12 })
      this.ctx.juice.collect(c * TILE + TILE / 2, r * TILE - 10, waiting.item)
      return
    }
    if (!this.params.orders.some((o) => o.to === targetId) || this.carrying.length === 0) return
    const right = this.carrying.find((id) => this.params.orders.find((o) => o.id === id)?.to === targetId)
    const handed = right ?? this.carrying[0]
    this.carrying = this.carrying.filter((id) => id !== handed)
    this.status[handed] = right ? 'delivered' : 'wrong'
    this.ctx.emit('handover', { order_id: handed, to: targetId, status: this.status[handed] })
    const [c, r] = this.ctx.avatarTile()
    this.parcelFlight(handed, { x: c * TILE, y: r * TILE - 34, w: TILE, h: 12 }, this.placeRect(targetId))
    this.ctx.juice.verdict(c * TILE + TILE / 2, r * TILE - 10, !!right, right ? '✓ Delivered!' : '✗ Wrong place')
    if (this.params.orders.every((o) => this.status[o.id] === 'delivered' || this.status[o.id] === 'wrong')) {
      this.finishedAt = this.ctx.now()
      this.ctx.finish(scoreDeliver(this.ctx.level, this.status, this.finishedAt))
    }
  }

  private placeRect(id: string) {
    const p = this.places.find((x) => x.id === id)
    return p ? toTarget(p) : { x: 0, y: 0, w: 0, h: 0 }
  }

  /** Cosmetic: the order's parcel arcs from one spot to the other. */
  private parcelFlight(orderId: string, from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }) {
    const ribbon = ribbonColor(this.params.orders.findIndex((o) => o.id === orderId))
    this.ctx.juice.fly(from, to, { ms: 320, art: (g, x, y, s) => drawParcel(g, x - 7 * (0.6 + s), y - 5 * (0.6 + s), ribbon, 1.4 * (0.6 + s)) })
  }

  click() {}
  down() {}
  move() {}
  up() {}
  advance() {}

  carryingLabel(): string | null {
    const first = this.params.orders.find((o) => o.id === this.carrying[0])
    return first ? first.item : null
  }

  observe() {
    return {
      orders: this.params.orders.map((o) => ({
        id: o.id,
        label: o.label,
        item: o.item,
        from: o.from,
        to: o.to,
        to_label: resolveTarget(this.ctx.world, o.to)?.label ?? o.to,
        status: this.status[o.id],
      })),
      carrying: [...this.carrying],
      capacity: this.params.capacity,
      par_ms: this.params.par_ms,
    }
  }

  timeout() {
    return scoreDeliver(this.ctx.level, this.status, this.ctx.level.time_limit_ms ?? this.ctx.now())
  }
}
