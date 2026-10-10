// Sort panel: the current item stands on a work counter with a paper tag, the next ones wait beside it,
// and each spot is a wooden crate with a nailed-on sign that fills up with what was dropped in.
// Visuals come only from the level params (labels, attributes); nothing here hints at the right bin.
import type { GameEngine } from '../engine'
import { contentRect } from '../layout'
import type { SortMechanic } from '../mechanics/sort'
import type { Rect, SortItem } from '../types'
import { GOLD, INK, INK_SOFT, PARCHMENT, WOOD_DARK, px, roundRect, shade, text, textBlock, wrap, type Ctx } from './pixel'
import { drawObject, objectKind, objectTint } from './objects'

const WOODS = ['#c58a4a', '#b97a43', '#cf9655', '#a96f3e', '#c98e4f', '#b4804a']
const SIGN_STRIPES = ['#d9734e', '#5e8fc9', '#8cbf5a', '#b56fc2', '#e2b84a', '#4fa59a']

/** Draws an item's object, bottom centre at (cx, by). */
export function drawSortObject(ctx: Ctx, item: SortItem, cx: number, by: number, s: number) {
  const attrs = item.attributes ?? {}
  drawObject(ctx, objectKind(item.label, attrs), cx, by, s, objectTint(item.label, attrs))
}

/** The current item: its object on the left, a paper tag with its name and attributes tied to it. */
function drawItem(ctx: Ctx, r: Rect, item: SortItem, lifted: boolean, tilt: number) {
  ctx.save()
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2)
  ctx.rotate(tilt)
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2))
  const ox = r.x + 22
  const oy = r.y + r.h - 3
  if (lifted) {
    ctx.fillStyle = 'rgba(40,24,10,0.2)'
    ctx.beginPath()
    ctx.ellipse(ox + 2, oy + 5, 15, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  drawSortObject(ctx, item, ox, oy, 2.5)
  // tag on a string
  const tag = { x: r.x + 46, y: r.y + 4, w: r.w - 46, h: r.h - 8 }
  ctx.strokeStyle = '#8a6a50'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ox + 4, oy - 32)
  ctx.quadraticCurveTo(tag.x - 4, tag.y + 2, tag.x + 6, tag.y + 9)
  ctx.stroke()
  px(ctx, 'rgba(40,24,10,0.25)', tag.x + 2, tag.y + (lifted ? 4 : 2), tag.w, tag.h)
  roundRect(ctx, tag, 3, '#fff8e8', WOOD_DARK, 1.2)
  px(ctx, PARCHMENT, tag.x + 1, tag.y + tag.h - 4, tag.w - 2, 3)
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(tag.x + 6, tag.y + 9, 2, 0, Math.PI * 2)
  ctx.fill()
  const attrs = Object.entries(item.attributes ?? {})
  const tx = tag.x + 12
  const tw = tag.w - 16
  const nameLines = Math.min(2, wrap(ctx, item.label, tw, 8.5, 800).length)
  const nameY = attrs.length ? tag.y + 12 : tag.y + Math.round((tag.h - nameLines * 10) / 2) + 8
  textBlock(ctx, item.label, tx, nameY, tw, { size: 8.5, weight: 800, maxLines: attrs.length ? 1 : 2, lineH: 10 })
  // attribute chips
  let cx = tx
  const cy = tag.y + tag.h - 15
  for (const [k, v] of attrs) {
    const s = `${k}: ${v}`
    ctx.font = '800 6px Nunito, system-ui, sans-serif'
    const w = Math.min(tag.x + tag.w - 4 - cx, ctx.measureText(s).width + 8)
    if (w < 24) break
    roundRect(ctx, { x: cx, y: cy, w, h: 10 }, 3, '#f3e2bd', shade('#f3e2bd', -0.25), 1)
    text(ctx, s, cx + 4, cy + 7.5, { size: 6, weight: 800, color: INK_SOFT, maxW: w - 6 })
    cx += w + 3
  }
  ctx.restore()
}

/** A wooden crate; what was dropped in pokes out over the rim. */
function drawCrate(ctx: Ctx, box: Rect, i: number, label: string, contents: SortItem[], sel: boolean, hot: boolean, t: number) {
  // a little shorter than the drop target so the footer bubble never covers its base
  const r = { x: box.x, y: box.y - 1, w: box.w, h: box.h - 3 }
  const wood = WOODS[i % WOODS.length]
  const top = r.y + 10
  const front = r.y + 20
  // shadow and glow
  ctx.fillStyle = hot ? 'rgba(242,193,78,0.35)' : 'rgba(40,24,10,0.2)'
  ctx.beginPath()
  ctx.ellipse(r.x + r.w / 2, r.y + r.h + 1, r.w / 2 + (hot ? 4 : 1), hot ? 5 : 3, 0, 0, Math.PI * 2)
  ctx.fill()
  // back rim and the inside of the crate
  px(ctx, WOOD_DARK, r.x + 1, top, r.w - 2, front - top + 1)
  px(ctx, shade(wood, 0.1), r.x + 2, top + 1, r.w - 4, 2)
  px(ctx, hot ? shade(wood, -0.25) : shade(wood, -0.45), r.x + 3, top + 3, r.w - 6, front - top - 3)
  px(ctx, hot ? shade(wood, -0.4) : shade(wood, -0.6), r.x + 3, front - 3, r.w - 6, 3)
  // contents
  const per = Math.max(1, Math.floor((r.w - 10) / 11))
  contents.slice(-per * 2).forEach((it, k) => {
    const row = Math.floor(k / per)
    const col = k % per
    const x = r.x + 10 + col * 11 + (row % 2) * 5
    drawSortObject(ctx, it, x, front + 6 - row * 4, 0.85)
  })
  // front planks between corner posts
  px(ctx, WOOD_DARK, r.x, front, r.w, r.y + r.h - front)
  const planks = 3
  const ph = (r.y + r.h - front - 2) / planks
  for (let k = 0; k < planks; k++) {
    const y = front + 1 + k * ph
    px(ctx, shade(wood, k % 2 ? -0.06 : 0.04), r.x + 1, y, r.w - 2, ph - 1)
    px(ctx, shade(wood, 0.22), r.x + 1, y, r.w - 2, 1)
  }
  px(ctx, shade(wood, -0.28), r.x + 1, front + 1, 4, r.y + r.h - front - 2)
  px(ctx, shade(wood, -0.28), r.x + r.w - 5, front + 1, 4, r.y + r.h - front - 2)
  px(ctx, shade(wood, 0.3), r.x + 1, front - 1, r.w - 2, 1)
  // sign nailed across the middle planks
  const bodyH = r.y + r.h - front
  const sh = 22
  const sg = { x: r.x + 5, y: front + Math.round((bodyH - sh) / 2), w: r.w - 10, h: sh }
  px(ctx, 'rgba(40,24,10,0.25)', sg.x + 1, sg.y + 2, sg.w, sg.h)
  px(ctx, WOOD_DARK, sg.x, sg.y, sg.w, sg.h)
  px(ctx, sel ? '#ffe7a3' : PARCHMENT, sg.x + 1, sg.y + 1, sg.w - 2, sg.h - 2)
  px(ctx, SIGN_STRIPES[i % SIGN_STRIPES.length], sg.x + 1, sg.y + 1, sg.w - 2, 2)
  px(ctx, '#8e96a3', sg.x + 2, sg.y + 4, 1, 1)
  px(ctx, '#8e96a3', sg.x + sg.w - 3, sg.y + 4, 1, 1)
  const lines = wrap(ctx, label, sg.w - 8, 6.5, 800)
  const n = Math.min(2, lines.length)
  const ly = sg.y + 3 + Math.round((sg.h - 3 - n * 8) / 2) + 6
  lines.slice(0, 2).forEach((l, k) =>
    text(ctx, k === 1 && lines.length > 2 ? `${l}…` : l, r.x + r.w / 2, ly + k * 8, { size: 6.5, weight: 800, align: 'center', color: INK, maxW: sg.w - 6 }),
  )
  if (sel) {
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.5
    ctx.strokeRect(r.x - 1.5, top - 1.5, r.w + 3, r.y + r.h - top + 3)
    const o = Math.round(Math.sin(t / 180) * 1.5)
    px(ctx, WOOD_DARK, r.x + r.w / 2 - 5, r.y - 3 + o, 10, 3)
    px(ctx, WOOD_DARK, r.x + r.w / 2 - 3, r.y + o, 6, 2)
    px(ctx, WOOD_DARK, r.x + r.w / 2 - 1, r.y + 2 + o, 2, 2)
    px(ctx, GOLD, r.x + r.w / 2 - 4, r.y - 2 + o, 8, 2)
    px(ctx, GOLD, r.x + r.w / 2 - 2, r.y + o, 4, 2)
  }
}

// drag tilt follows the pointer's sideways speed (cosmetic, per mechanic)
const tilts = new WeakMap<SortMechanic, { x: number; tilt: number }>()

export function drawSort(ctx: Ctx, e: GameEngine, m: SortMechanic, t: number) {
  const c = contentRect(e.W, e.H)
  const cur = m.current
  const ir = m.itemRect()
  // low work counter the item stands on: worktop and cupboard doors
  const ct = ir.y + ir.h - 3
  const cx0 = c.x + 4
  const cw = c.w - 8
  px(ctx, 'rgba(40,24,10,0.15)', cx0 + 2, ct + 18, cw - 4, 2)
  px(ctx, WOOD_DARK, cx0, ct, cw, 18)
  px(ctx, '#dca46a', cx0 + 1, ct + 1, cw - 2, 3)
  px(ctx, '#e8bb84', cx0 + 1, ct + 1, cw - 2, 1)
  px(ctx, '#a96f3e', cx0 + 1, ct + 4, cw - 2, 1)
  const doors = Math.max(2, Math.round(cw / 56))
  const dw = (cw - 2) / doors
  for (let k = 0; k < doors; k++) {
    const dx = cx0 + 1 + k * dw
    px(ctx, '#b97a43', dx + 1, ct + 6, dw - 2, 11)
    px(ctx, '#c98e4f', dx + 3, ct + 8, dw - 6, 7)
    px(ctx, '#a06a36', dx + 3, ct + 14, dw - 6, 1)
    px(ctx, WOOD_DARK, dx + dw / 2 - 1, ct + 10, 2, 2)
  }
  // the queue waiting beside the item
  const queue = m.params.items.slice(m.index + 1, m.index + 4)
  queue.forEach((it, k) => {
    ctx.globalAlpha = 1 - k * 0.22
    drawSortObject(ctx, it, ir.x + ir.w + 20 + k * 20, ct + 1, 1.25)
  })
  ctx.globalAlpha = 1
  text(ctx, `${Math.max(0, m.params.items.length - m.index)} left`, c.x + c.w - 4, c.y + 10, { size: 7.5, weight: 800, color: INK_SOFT, align: 'right' })
  // crates
  const bins = m.binRects()
  m.params.bins.forEach((b, i) => {
    const r = bins[i]
    const sel = i === m.selectedBin
    const contents = m.placed.filter((p) => p.bin_id === b.id).map((p) => m.params.items.find((it) => it.id === p.item_id)).filter((x): x is SortItem => !!x)
    const sq = e.juice.scaleOf(`bin:${b.id}`)
    ctx.save()
    ctx.translate(r.x + r.w / 2, r.y + r.h)
    ctx.scale(sq.sx, sq.sy)
    ctx.translate(-(r.x + r.w / 2), -(r.y + r.h))
    drawCrate(ctx, r, i, b.label, contents, sel, sel && !!m.drag, t)
    ctx.restore()
  })
  if (!cur) return
  if (m.drag) {
    const r = { ...ir, x: m.drag.x - m.drag.dx, y: m.drag.y - m.drag.dy }
    const st = tilts.get(m) ?? { x: m.drag.x, tilt: 0 }
    const want = Math.max(-0.22, Math.min(0.22, (m.drag.x - st.x) * 0.03))
    st.tilt += (want - st.tilt) * 0.35
    st.x = m.drag.x
    tilts.set(m, st)
    // the empty spot it was lifted from
    ctx.save()
    ctx.setLineDash([3, 2])
    ctx.strokeStyle = 'rgba(91,58,30,0.45)'
    ctx.lineWidth = 1
    ctx.strokeRect(ir.x + 0.5, ir.y + 0.5, ir.w - 1, ir.h - 1)
    ctx.restore()
    drawItem(ctx, { ...r, y: r.y - 3 }, cur, true, st.tilt)
  } else {
    tilts.delete(m)
    const bob = Math.round(Math.sin(t / 400))
    e.juice.withScale(ctx, 'sort:item', ir.x + ir.w / 2, ir.y + ir.h, () => drawItem(ctx, { ...ir, y: ir.y + bob }, cur, false, 0))
  }
}
