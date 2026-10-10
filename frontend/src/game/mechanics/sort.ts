import type { Target } from '../../contract'
import { hit, sortBins, sortItem } from '../layout'
import { drawSortObject } from '../render/sortPanel'
import { scoreSort } from '../scoring'
import type { SortParams } from '../types'
import type { Dir, Mechanic, MechanicCtx } from './base'

export class SortMechanic implements Mechanic {
  readonly kind = 'sort' as const
  readonly params: SortParams
  index = 0
  selectedBin = 0
  placed: { item_id: string; bin_id: string }[] = []
  drag: { x: number; y: number; dx: number; dy: number } | null = null
  private ctx: MechanicCtx

  constructor(ctx: MechanicCtx) {
    this.ctx = ctx
    this.params = ctx.level.params as unknown as SortParams
  }

  get current() {
    return this.params.items[this.index] ?? null
  }

  binRects() {
    return sortBins(this.ctx.W, this.ctx.H, this.params.bins.length)
  }

  itemRect() {
    return sortItem(this.ctx.W, this.ctx.H)
  }

  targets(): Target[] {
    const out: Target[] = []
    const cur = this.current
    if (cur) out.push({ id: `item:${cur.id}`, kind: 'item', label: cur.label, ...this.itemRect(), enabled: true })
    const rects = this.binRects()
    this.params.bins.forEach((b, i) => out.push({ id: `bin:${b.id}`, kind: 'bin', label: b.label, ...rects[i], enabled: !!cur }))
    return out
  }

  focus() {
    return `bin:${this.params.bins[this.selectedBin].id}`
  }

  start() {}

  private drop(binIndex: number, from?: { x: number; y: number }) {
    const cur = this.current
    if (!cur || binIndex < 0) return
    const bin = this.params.bins[binIndex]
    this.selectedBin = binIndex
    const ir = this.itemRect()
    const start = from ? { ...ir, ...from } : ir
    // the object itself flies from where it stood (left of its tag) into the crate
    const objFrom = { x: start.x, y: start.y, w: 44, h: start.h }
    this.ctx.juice.snapInto(objFrom, this.binRects()[binIndex], `bin:${bin.id}`, cur.label, undefined, (g, x, y, s) =>
      drawSortObject(g, cur, x, y + 20 * s, 2.5 * s + 0.6),
    )
    this.ctx.juice.pop('sort:item', 280)
    this.placed.push({ item_id: cur.id, bin_id: bin.id })
    this.ctx.emit('placed', { item_id: cur.id, bin_id: bin.id })
    this.index += 1
    if (this.index >= this.params.items.length) this.ctx.finish(scoreSort(this.ctx.level, this.placedMap()))
  }

  dir(d: Dir) {
    const n = this.params.bins.length
    const before = this.selectedBin
    if (d === 'left') this.selectedBin = Math.max(0, this.selectedBin - 1)
    else if (d === 'right') this.selectedBin = Math.min(n - 1, this.selectedBin + 1)
    else if (d === 'down') this.drop(this.selectedBin)
    if (d !== 'down' && this.selectedBin !== before) this.ctx.juice.select(`bin:${this.params.bins[this.selectedBin].id}`)
  }

  holdStart() {
    return false
  }

  holdEnd() {}

  interact(targetId?: string) {
    if (targetId?.startsWith('bin:')) return this.drop(this.params.bins.findIndex((b) => `bin:${b.id}` === targetId))
    this.drop(this.selectedBin)
  }

  private binAt(x: number, y: number) {
    return this.binRects().findIndex((r) => hit(r, x, y))
  }

  click(x: number, y: number) {
    const i = this.binAt(x, y)
    if (i >= 0) this.drop(i)
  }

  down(x: number, y: number) {
    const r = this.itemRect()
    if (this.current && hit(r, x, y)) {
      this.drag = { x, y, dx: x - r.x, dy: y - r.y }
      this.ctx.juice.sfx('tap')
    }
  }

  move(x: number, y: number) {
    if (this.drag) {
      this.drag.x = x
      this.drag.y = y
      const i = this.binAt(x, y)
      if (i >= 0 && i !== this.selectedBin) this.ctx.juice.select(`bin:${this.params.bins[i].id}`)
      if (i >= 0) this.selectedBin = i
    }
  }

  up(x: number, y: number) {
    if (!this.drag) return
    const at = { x: x - this.drag.dx, y: y - this.drag.dy }
    this.drag = null
    const i = this.binAt(x, y)
    if (i >= 0) this.drop(i, at)
  }

  advance() {}

  placedMap(): Record<string, string> {
    return Object.fromEntries(this.placed.map((p) => [p.item_id, p.bin_id]))
  }

  observe() {
    const cur = this.current
    return {
      current_item: cur ? { id: cur.id, label: cur.label, attributes: cur.attributes ?? {} } : null,
      queue_remaining: Math.max(0, this.params.items.length - this.index - (cur ? 1 : 0)),
      bins: this.params.bins.map((b) => ({ id: b.id, label: b.label })),
      selected_bin: this.params.bins[this.selectedBin].id,
      placed: [...this.placed],
    }
  }

  timeout() {
    return scoreSort(this.ctx.level, this.placedMap())
  }
}
