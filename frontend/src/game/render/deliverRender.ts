// Deliver level drawing: the order board, parcels waiting at the pickup, parcels stacked on the bot,
// and what has been handed over at each destination. Each order keeps one ribbon colour everywhere.
import type { GameEngine } from '../engine'
import { TILE } from '../layout'
import type { DeliverMechanic } from '../mechanics/deliver'
import type { Rect } from '../types'
import { fmtTime } from './panels'
import { drawParcel, ribbonColor } from './objects'
import { INK, INK_SOFT, PARCHMENT, WOOD_DARK, px, shade, text, type Ctx } from './pixel'

export function ribbonOf(m: DeliverMechanic, orderId: string): string {
  return ribbonColor(m.params.orders.findIndex((o) => o.id === orderId))
}

/** Parcels the bot is carrying, held in front of its chest and stacked up; (ax, ay) = bot feet. */
export function drawCarried(ctx: Ctx, m: DeliverMechanic, ax: number, ay: number, bob: number) {
  m.carrying.forEach((id, i) => drawParcel(ctx, Math.round(ax - 6 + (i % 2)), Math.round(ay - 17 - i * 8 + bob), ribbonOf(m, id), 1.2))
}

function check(ctx: Ctx, x: number, y: number, good: boolean) {
  px(ctx, WOOD_DARK, x - 1, y - 1, 9, 9)
  px(ctx, good ? '#8cc265' : '#e8735a', x, y, 7, 7)
  if (good) {
    px(ctx, '#ffffff', x + 1, y + 3, 1, 2)
    px(ctx, '#ffffff', x + 2, y + 4, 1, 2)
    px(ctx, '#ffffff', x + 3, y + 3, 1, 2)
    px(ctx, '#ffffff', x + 4, y + 2, 1, 2)
    px(ctx, '#ffffff', x + 5, y + 1, 1, 2)
  } else {
    for (let k = 0; k < 5; k++) {
      px(ctx, '#ffffff', x + 1 + k, y + 1 + k, 1, 1)
      px(ctx, '#ffffff', x + 5 - k, y + 1 + k, 1, 1)
    }
  }
}

/** Map layer: parcels still waiting at each pickup, and handed-over parcels at each destination. */
export function drawDeliverWorld(ctx: Ctx, m: DeliverMechanic) {
  for (const place of m.places) {
    const t = place.tiles
    const waiting = m.params.orders.filter((o) => o.from === place.id && m.status[o.id] === 'waiting')
    if (waiting.length) {
      const cx = (t.x + t.w / 2) * TILE
      const base = (t.y + t.h) * TILE + 1
      waiting.forEach((o, k) => {
        const row = Math.floor(k / 3)
        const col = k % 3
        const inRow = Math.min(3, waiting.length - row * 3)
        drawParcel(ctx, Math.round(cx - (inRow * 11) / 2 + col * 11 + row * 5), base - 9 - row * 8, ribbonOf(m, o.id))
      })
    }
    const handed = m.params.orders.filter((o) => o.to === place.id && (m.status[o.id] === 'delivered' || m.status[o.id] === 'wrong'))
    handed.forEach((o, k) => {
      const x = (t.x + t.w) * TILE + 1 + k * 4
      const y = (t.y + t.h) * TILE - 9
      drawParcel(ctx, x, y, ribbonOf(m, o.id))
      check(ctx, x + 6, y - 7, m.status[o.id] === 'delivered')
    })
  }
}

/** Order board in the corner: one ticket per order with its parcel, and the carry slots. */
export function drawDeliverHud(ctx: Ctx, e: GameEngine) {
  const m = e.mech as DeliverMechanic
  if (!e.level) return
  const orders = m.params.orders
  const cap = Math.max(1, m.params.capacity || 1)
  const w = 200
  const rowH = 11
  const h = 22 + orders.length * rowH
  const r: Rect = { x: 6, y: 6, w, h }
  px(ctx, 'rgba(40,24,10,0.25)', r.x + 2, r.y + 3, r.w, r.h)
  px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
  px(ctx, PARCHMENT, r.x + 2, r.y + 2, r.w - 4, r.h - 4)
  text(ctx, e.level.title, r.x + 7, r.y + 12, { size: 8, weight: 800, maxW: w - 20 - cap * 13 })
  // carry slots: a filled slot shows the parcel in hand
  for (let i = 0; i < cap; i++) {
    const sx = r.x + w - 8 - (cap - i) * 13
    px(ctx, shade(PARCHMENT, -0.18), sx, r.y + 4, 12, 11)
    px(ctx, shade(PARCHMENT, -0.06), sx + 1, r.y + 5, 10, 9)
    const id = m.carrying[i]
    if (id) drawParcel(ctx, sx + 1, r.y + 6, ribbonOf(m, id))
  }
  px(ctx, shade(PARCHMENT, -0.12), r.x + 6, r.y + 17, w - 12, 1)
  orders.forEach((o, i) => {
    const st = m.status[o.id]
    const y = r.y + 20 + i * rowH
    if (st === 'carrying') px(ctx, '#ffe7a3', r.x + 3, y, w - 6, rowH - 1)
    const done = st === 'delivered' || st === 'wrong'
    ctx.globalAlpha = st === 'waiting' || st === 'carrying' ? 1 : 0.55
    drawParcel(ctx, r.x + 6, y + 1, ribbonOf(m, o.id))
    ctx.globalAlpha = 1
    const color = st === 'delivered' ? '#3f7f3a' : st === 'wrong' ? '#b4432f' : st === 'carrying' ? INK : INK_SOFT
    text(ctx, o.label, r.x + 20, y + 8, { size: 6.5, weight: st === 'carrying' ? 800 : 700, color, maxW: w - (done ? 38 : 26) })
    if (done) check(ctx, r.x + w - 15, y + 1, st === 'delivered')
  })
  const limit = e.level.time_limit_ms
  if (limit && e.phase === 'playing') {
    const left = Math.max(0, limit - e.levelTime())
    const tr = { x: e.W - 58, y: 6, w: 52, h: 18 }
    px(ctx, WOOD_DARK, tr.x, tr.y, tr.w, tr.h)
    px(ctx, left < 10000 ? '#f3b49b' : PARCHMENT, tr.x + 2, tr.y + 2, tr.w - 4, tr.h - 4)
    text(ctx, `⏱ ${fmtTime(left)}`, tr.x + tr.w / 2, tr.y + 12.5, { size: 8, weight: 800, align: 'center' })
  }
  text(ctx, e.level.controls_hint, e.W / 2, e.H - 5, { size: 6.5, weight: 800, color: '#fff6e0', align: 'center', maxW: e.W - 20 })
}
