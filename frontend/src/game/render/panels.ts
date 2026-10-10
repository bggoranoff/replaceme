// Level panels, intro card, score card and the deliver HUD.
import type { GameEngine } from '../engine'
import { cardRect, contentRect, conversePortrait, converseBubble, panelRect } from '../layout'
import { ConverseMechanic } from '../mechanics/converse'
import { DeliverMechanic } from '../mechanics/deliver'
import { MixMechanic } from '../mechanics/mix'
import { SortMechanic } from '../mechanics/sort'
import { TimingMechanic } from '../mechanics/timing'
import type { Rect } from '../types'
import { GOLD, INK, INK_SOFT, PARCHMENT, PARCHMENT_DARK, WOOD_DARK, button, mix, px, roundRect, shade, text, textBlock, woodPanel, wrap, type Ctx } from './pixel'
import { drawPerson, npcColors } from './sprites'

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '-'
  const a = Math.abs(v)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2
  return String(Number(v.toFixed(d)))
}

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function header(ctx: Ctx, e: GameEngine, p: Rect) {
  const level = e.level!
  const loc = e.location(level.quest.location_id)
  text(ctx, level.title, p.x + 14, p.y + 21, { size: 12, weight: 800, maxW: p.w - 90 })
  text(ctx, (loc?.name ?? '').toUpperCase(), p.x + 14, p.y + 31, { size: 6.5, weight: 800, color: INK_SOFT, maxW: p.w - 90 })
  textBlock(ctx, level.aim, p.x + 14, p.y + 41, p.w - 28, { size: 7.5, weight: 700, color: INK, maxLines: 1 })
  const limit = level.time_limit_ms
  if (limit && e.phase === 'playing') {
    const left = Math.max(0, limit - e.levelTime())
    const r = { x: p.x + p.w - 62, y: p.y + 11, w: 48, h: 16 }
    px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
    px(ctx, left < 10000 ? '#f3b49b' : PARCHMENT_DARK, r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    text(ctx, `⏱ ${fmtTime(left)}`, r.x + r.w / 2, r.y + 11.5, { size: 8, weight: 800, align: 'center' })
  }
  px(ctx, shade(PARCHMENT, -0.12), p.x + 12, p.y + 46, p.w - 24, 1)
}

/** Footer: the controls hint, or a villager's line while their bubble is up (in-level chatter). */
function footer(ctx: Ctx, e: GameEngine, p: Rect) {
  const b = e.bubble
  const npc = b && e.t <= b.until && !(e.mech instanceof ConverseMechanic) ? e.npc(b.npcId) : undefined
  if (!b || !npc) {
    text(ctx, e.level!.controls_hint, p.x + p.w / 2, p.y + p.h - 11, { size: 6.5, weight: 700, color: INK_SOFT, align: 'center', maxW: p.w - 24 })
    return
  }
  const r = { x: p.x + 10, y: p.y + p.h - 25, w: p.w - 20, h: 19 }
  roundRect(ctx, r, 4, '#ffffff', WOOD_DARK, 1)
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x + 1, r.y + 1, 22, r.h - 2)
  ctx.clip()
  drawPerson(ctx, r.x + 12, r.y + 24, npcColors(npc), 'down', 0)
  ctx.restore()
  const lines = wrap(ctx, `${npc.name}: ${b.text}`, r.w - 32, 6.5, 700)
  lines.slice(0, 2).forEach((l, i) =>
    text(ctx, i === 1 && lines.length > 2 ? `${l}…` : l, r.x + 26, r.y + (lines.length > 1 ? 8 : 12) + i * 8, { size: 6.5, weight: 700 }),
  )
}

function selectArrow(ctx: Ctx, x: number, y: number, t: number) {
  const o = Math.round(Math.sin(t / 150))
  px(ctx, GOLD, x + o, y - 3, 2, 7)
  px(ctx, GOLD, x + 2 + o, y - 2, 2, 5)
  px(ctx, GOLD, x + 4 + o, y - 1, 2, 3)
}

// --- mix -----------------------------------------------------------------------

function drawMix(ctx: Ctx, e: GameEngine, m: MixMechanic, t: number) {
  const c = contentRect(e.W, e.H)
  // the pot: colour drifts with the settings (purely decorative, says nothing about the answer)
  const vars = m.params.variables
  const fr = vars.map((v, i) => (m.values[i] - v.min) / (v.max - v.min || 1))
  const hue = fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : 0.5
  const liquid = mix('#8fc6ee', '#e8774a', hue)
  const px0 = c.x + 8
  const py0 = c.y + c.h / 2 - 22
  px(ctx, 'rgba(40,24,10,0.2)', px0 + 4, py0 + 46, 48, 4)
  px(ctx, '#2f2a2a', px0 + 2, py0 + 14, 52, 32)
  px(ctx, '#2f2a2a', px0 + 6, py0 + 46, 44, 3)
  px(ctx, '#4a4444', px0 + 6, py0 + 18, 44, 4)
  px(ctx, liquid, px0 + 5, py0 + 12, 46, 6)
  px(ctx, shade(liquid, 0.3), px0 + 8, py0 + 12, 18, 2)
  for (let i = 0; i < 4; i++) {
    const ph = ((t / 700 + i * 0.27) % 1) * 18
    px(ctx, `rgba(255,255,255,${0.75 - ph / 26})`, px0 + 12 + i * 10, py0 + 10 - ph, 3, 3)
  }
  px(ctx, '#e8574a', px0 + 14, py0 + 50, 28, 3)
  px(ctx, '#f2c14e', px0 + 18, py0 + 49, 6, 2)
  px(ctx, '#f2c14e', px0 + 30, py0 + 49, 6, 2)

  const rows = m.rows()
  vars.forEach((v, i) => {
    const { row, track } = rows[i]
    const sel = i === m.selected
    if (sel) {
      px(ctx, 'rgba(242,193,78,0.28)', row.x - 4, row.y + 1, row.w + 8, row.h - 2)
      selectArrow(ctx, row.x - 10, row.y + row.h / 2, t)
    }
    text(ctx, v.label, row.x + 2, row.y + 10, { size: 8, weight: 800, maxW: row.w - 70 })
    text(ctx, `${fmtNum(m.values[i])} ${v.unit}`.trim(), row.x + row.w - 2, row.y + 10, { size: 8.5, weight: 800, align: 'right', color: sel ? '#7a3f12' : INK })
    const gy = track.y + track.h / 2
    px(ctx, WOOD_DARK, track.x - 1, gy - 3, track.w + 2, 6)
    px(ctx, '#e9d2a6', track.x, gy - 2, track.w, 4)
    const frac = (m.values[i] - v.min) / (v.max - v.min || 1)
    px(ctx, sel ? '#e8a23c' : '#c9a36a', track.x, gy - 2, Math.round(track.w * frac), 4)
    for (let k = 1; k < 10; k++) px(ctx, 'rgba(91,58,30,0.35)', track.x + Math.round((track.w * k) / 10), gy + 2, 1, 2)
    const kx = track.x + track.w * frac
    ctx.fillStyle = WOOD_DARK
    ctx.beginPath()
    ctx.arc(kx, gy, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = sel ? GOLD : '#f6e3bb'
    ctx.beginPath()
    ctx.arc(kx, gy, 4.2, 0, Math.PI * 2)
    ctx.fill()
    px(ctx, '#ffffff', kx - 2, gy - 3, 2, 1)
  })
  const ing = m.ingredientRects()
  ;(m.params.ingredients ?? []).forEach((g, i) => {
    button(ctx, ing[i], g.label, false, '#f6e3bb')
    const n = m.added.filter((a) => a === g.id).length
    if (n) text(ctx, `×${n}`, ing[i].x + ing[i].w - 3, ing[i].y + 7, { size: 6, weight: 800, align: 'right' })
  })
  button(ctx, m.submitRect(), `${m.params.submit_label} ⏎`, true, '#8cc265')
}

// --- timing --------------------------------------------------------------------

function drawTiming(ctx: Ctx, e: GameEngine, m: TimingMechanic) {
  const c = contentRect(e.W, e.H)
  const p = m.phase
  const r = m.meterRect()
  const n = m.params.phases.length
  // phase pips
  for (let i = 0; i < n; i++) {
    const done = i < m.index
    px(ctx, WOOD_DARK, c.x + 18 + i * 14, c.y + 6, 10, 10)
    px(ctx, done ? '#8cc265' : i === m.index ? GOLD : PARCHMENT_DARK, c.x + 19 + i * 14, c.y + 7, 8, 8)
  }
  if (p) {
    text(ctx, `Step ${m.index + 1} of ${n}: ${p.label}`, c.x + 22 + n * 14, c.y + 14, { size: 9, weight: 800, maxW: c.w - 40 - n * 14 })
    text(ctx, p.mode === 'hold' ? 'Hold, then let go at the right moment' : 'Stop the needle at the right moment', c.x + 18, c.y + 32, { size: 7.5, weight: 700, color: INK_SOFT })
  }
  // gauge
  px(ctx, 'rgba(40,24,10,0.25)', r.x + 2, r.y + 3, r.w, r.h)
  px(ctx, WOOD_DARK, r.x - 2, r.y - 2, r.w + 4, r.h + 4)
  const grad = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0)
  grad.addColorStop(0, '#9fd3f0')
  grad.addColorStop(0.5, '#f6e3a0')
  grad.addColorStop(1, '#f08a5d')
  ctx.fillStyle = grad
  ctx.fillRect(r.x, r.y, r.w, r.h)
  for (let k = 0; k <= 20; k++) {
    const tx = r.x + Math.round((r.w * k) / 20)
    px(ctx, 'rgba(74,52,36,0.55)', tx, r.y + r.h - (k % 5 === 0 ? 9 : 5), 1, k % 5 === 0 ? 9 : 5)
  }
  if (p) {
    const v = m.value()
    const frac = Math.max(0, Math.min(1, (v - p.min) / (p.max - p.min || 1)))
    const x = r.x + r.w * frac
    if (p.mode === 'hold') {
      px(ctx, 'rgba(232,87,74,0.35)', r.x, r.y, r.w * frac, r.h)
      if (m.holding) px(ctx, 'rgba(255,255,255,0.5)', r.x, r.y + 3, r.w * frac, 2)
    }
    px(ctx, INK, x - 1, r.y - 6, 3, r.h + 10)
    px(ctx, WOOD_DARK, x - 4, r.y - 9, 9, 4)
    px(ctx, WOOD_DARK, x - 2, r.y - 5, 5, 2)
    text(ctx, `${fmtNum(p.min)} ${p.unit}`.trim(), r.x, r.y + r.h + 13, { size: 7, weight: 800, color: INK_SOFT })
    text(ctx, `${fmtNum(p.max)} ${p.unit}`.trim(), r.x + r.w, r.y + r.h + 13, { size: 7, weight: 800, color: INK_SOFT, align: 'right' })
    text(ctx, `${fmtNum(v)} ${p.unit}`.trim(), r.x + r.w / 2, r.y + r.h + 14, { size: 10, weight: 800, align: 'center' })
  }
  // finished phases
  const res = Object.entries(m.results)
  res.forEach(([id, v], i) => {
    const ph = m.params.phases.find((x) => x.id === id)
    const label = `${ph?.label ?? id}: ${fmtNum(v)} ${ph?.unit ?? ''}`.trim()
    roundRect(ctx, { x: c.x + 18 + i * 110, y: c.y + c.h - 20, w: 104, h: 16 }, 3, '#e6f2d6', WOOD_DARK)
    text(ctx, `✓ ${label}`, c.x + 24 + i * 110, c.y + c.h - 9, { size: 7, weight: 800, maxW: 96 })
  })
}

// --- sort ----------------------------------------------------------------------

function drawItemCard(ctx: Ctx, r: Rect, label: string, attrs: Record<string, string>, lifted: boolean) {
  px(ctx, 'rgba(40,24,10,0.28)', r.x + (lifted ? 4 : 2), r.y + (lifted ? 6 : 3), r.w, r.h)
  px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
  px(ctx, '#fff8e8', r.x + 2, r.y + 2, r.w - 4, r.h - 4)
  px(ctx, '#c98e4f', r.x + 2, r.y + 2, r.w - 4, 4)
  textBlock(ctx, label, r.x + r.w / 2, r.y + 18, r.w - 14, { size: 9, weight: 800, align: 'center', maxLines: 2, lineH: 11 })
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')
  if (a) text(ctx, a, r.x + r.w / 2, r.y + r.h - 6, { size: 6.5, weight: 700, color: INK_SOFT, align: 'center', maxW: r.w - 10 })
}

function drawSort(ctx: Ctx, e: GameEngine, m: SortMechanic, t: number) {
  const c = contentRect(e.W, e.H)
  const cur = m.current
  const ir = m.itemRect()
  text(ctx, `${Math.max(0, m.params.items.length - m.index)} left`, c.x + c.w, c.y + 12, { size: 7.5, weight: 800, color: INK_SOFT, align: 'right' })
  const bins = m.binRects()
  m.params.bins.forEach((b, i) => {
    const r = bins[i]
    const sel = i === m.selectedBin
    px(ctx, 'rgba(40,24,10,0.22)', r.x + 2, r.y + 4, r.w, r.h)
    px(ctx, WOOD_DARK, r.x, r.y + 14, r.w, r.h - 14)
    px(ctx, '#c58a4a', r.x + 2, r.y + 16, r.w - 4, r.h - 18)
    for (let yy = r.y + 19; yy < r.y + r.h - 3; yy += 5) px(ctx, '#a06a36', r.x + 2, yy, r.w - 4, 1)
    for (let xx = r.x + 6; xx < r.x + r.w - 3; xx += 7) px(ctx, '#a06a36', xx, r.y + 16, 1, r.h - 18)
    px(ctx, '#7a4b2a', r.x + 4, r.y + 8, 2, 8)
    px(ctx, '#7a4b2a', r.x + r.w - 6, r.y + 8, 2, 8)
    px(ctx, '#7a4b2a', r.x + 4, r.y + 7, r.w - 8, 2)
    const placed = m.placed.filter((p) => p.bin_id === b.id).length
    for (let k = 0; k < Math.min(placed, 8); k++) px(ctx, '#fff8e8', r.x + 6 + (k % 4) * 6, r.y + 20 + Math.floor(k / 4) * 6, 4, 4)
    px(ctx, sel ? GOLD : PARCHMENT, r.x + 3, r.y + r.h - 21, r.w - 6, 18)
    const bl = wrap(ctx, b.label, r.w - 10, 6.5, 800)
    bl.slice(0, 2).forEach((l, k) =>
      text(ctx, k === 1 && bl.length > 2 ? `${l}…` : l, r.x + r.w / 2, r.y + r.h - (bl.length > 1 ? 13.5 : 9.5) + k * 8, { size: 6.5, weight: 800, align: 'center', maxW: r.w - 8 }),
    )
    if (sel) {
      const o = Math.round(Math.sin(t / 180) * 1.5)
      px(ctx, GOLD, r.x + r.w / 2 - 4, r.y - 2 + o, 8, 2)
      px(ctx, GOLD, r.x + r.w / 2 - 2, r.y + o, 4, 2)
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.5
      ctx.strokeRect(r.x - 1.5, r.y + 12.5, r.w + 3, r.h - 11)
    }
  })
  if (!cur) return
  if (m.drag) {
    const r = { ...ir, x: m.drag.x - m.drag.dx, y: m.drag.y - m.drag.dy }
    px(ctx, 'rgba(91,58,30,0.15)', ir.x, ir.y, ir.w, ir.h)
    drawItemCard(ctx, r, cur.label, cur.attributes ?? {}, true)
  } else {
    drawItemCard(ctx, ir, cur.label, cur.attributes ?? {}, false)
  }
}

// --- converse ------------------------------------------------------------------

function drawConverse(ctx: Ctx, e: GameEngine, m: ConverseMechanic, t: number) {
  const pr = conversePortrait(e.W, e.H)
  const br = converseBubble(e.W, e.H)
  const npc = m.npc
  px(ctx, WOOD_DARK, pr.x, pr.y, pr.w, pr.h)
  px(ctx, '#bfe3f5', pr.x + 2, pr.y + 2, pr.w - 4, pr.h - 4)
  px(ctx, '#8cc265', pr.x + 2, pr.y + pr.h - 12, pr.w - 4, 10)
  if (npc) {
    ctx.save()
    ctx.translate(pr.x + pr.w / 2, pr.y + pr.h - 2)
    ctx.scale(2, 2)
    drawPerson(ctx, 0, 0, npcColors(npc), 'down', Math.floor(t / 600) % 2 ? 0 : 0)
    ctx.restore()
    text(ctx, npc.name, pr.x + pr.w / 2, pr.y + pr.h + 9, { size: 7, weight: 800, align: 'center', maxW: pr.w + 8 })
  }
  roundRect(ctx, br, 6, '#ffffff', WOOD_DARK, 1.5)
  px(ctx, '#ffffff', br.x - 5, br.y + 18, 6, 6)
  px(ctx, WOOD_DARK, br.x - 6, br.y + 17, 1, 8)
  let y = br.y + 12
  if (m.lastReply) {
    y += textBlock(ctx, m.lastReply, br.x + 8, y, br.w - 16, { size: 7, weight: 700, italic: true, color: INK_SOFT, maxLines: 1 })
  }
  if (m.turn) textBlock(ctx, m.turn.npc_line, br.x + 8, y + 1, br.w - 16, { size: 8.5, weight: 800, maxLines: m.lastReply ? 2 : 3, lineH: 11 })
  text(ctx, `${Math.min(m.index + 1, m.params.turns.length)}/${m.params.turns.length}`, br.x + br.w - 6, br.y + br.h - 5, { size: 6.5, weight: 800, color: INK_SOFT, align: 'right' })
  const opts = m.turn?.options ?? []
  const rects = m.optionRects()
  opts.forEach((o, i) => {
    const r = rects[i]
    const sel = i === m.selected
    px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
    px(ctx, sel ? '#fff1c4' : PARCHMENT, r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    if (sel) selectArrow(ctx, r.x + 5, r.y + r.h / 2, t)
    textBlock(ctx, o.text, r.x + 14, r.y + (r.h > 20 ? 10 : r.h / 2 + 3), r.w - 20, { size: 7.5, weight: sel ? 800 : 700, maxLines: r.h > 20 ? 2 : 1, lineH: 9 })
  })
}

// --- panels --------------------------------------------------------------------

export function drawLevelPanel(ctx: Ctx, e: GameEngine, t: number) {
  const m = e.mech
  if (!m || m instanceof DeliverMechanic) return
  ctx.fillStyle = 'rgba(30,22,12,0.45)'
  ctx.fillRect(0, 0, e.W, e.H)
  const p = panelRect(e.W, e.H)
  woodPanel(ctx, p)
  header(ctx, e, p)
  if (m instanceof MixMechanic) drawMix(ctx, e, m, t)
  else if (m instanceof TimingMechanic) drawTiming(ctx, e, m)
  else if (m instanceof SortMechanic) drawSort(ctx, e, m, t)
  else if (m instanceof ConverseMechanic) drawConverse(ctx, e, m, t)
  footer(ctx, e, p)
}

export function drawDeliverHud(ctx: Ctx, e: GameEngine) {
  const m = e.mech
  if (!(m instanceof DeliverMechanic) || !e.level) return
  const orders = m.params.orders
  const w = 196
  const h = 20 + orders.length * 9
  const r = { x: 6, y: 6, w, h }
  px(ctx, 'rgba(40,24,10,0.25)', r.x + 2, r.y + 3, r.w, r.h)
  px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
  px(ctx, PARCHMENT, r.x + 2, r.y + 2, r.w - 4, r.h - 4)
  text(ctx, e.level.title, r.x + 7, r.y + 12, { size: 8, weight: 800, maxW: w - 60 })
  text(ctx, `${m.carrying.length}/${m.params.capacity} carried`, r.x + w - 7, r.y + 12, { size: 6.5, weight: 800, color: INK_SOFT, align: 'right' })
  orders.forEach((o, i) => {
    const st = m.status[o.id]
    const icon = st === 'delivered' ? '✓' : st === 'wrong' ? '✗' : st === 'carrying' ? '●' : '○'
    const color = st === 'delivered' ? '#3f7f3a' : st === 'wrong' ? '#b4432f' : INK
    text(ctx, `${icon} ${o.label}`, r.x + 7, r.y + 21 + i * 9, { size: 6.5, weight: st === 'carrying' ? 800 : 700, color, maxW: w - 14 })
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

export function drawIntro(ctx: Ctx, e: GameEngine, t: number) {
  const level = e.level
  if (!level) return
  ctx.fillStyle = 'rgba(30,22,12,0.45)'
  ctx.fillRect(0, 0, e.W, e.H)
  const r = cardRect(e.W, e.H)
  woodPanel(ctx, r)
  const x = r.x + 16
  const w = r.w - 32
  text(ctx, level.quest.title.toUpperCase(), r.x + r.w / 2, r.y + 22, { size: 6.5, weight: 800, color: INK_SOFT, align: 'center', maxW: w })
  text(ctx, level.title, r.x + r.w / 2, r.y + 38, { size: 13, weight: 800, align: 'center', maxW: w })
  let y = r.y + 54
  y += textBlock(ctx, level.aim, r.x + r.w / 2, y, w, { size: 8.5, weight: 700, align: 'center', maxLines: 3, lineH: 11 }) + 6
  px(ctx, shade(PARCHMENT, -0.12), x, y - 4, w, 1)
  text(ctx, `Score: ${level.metric.name}`, x, y + 6, { size: 8, weight: 800 })
  y += 8 + textBlock(ctx, level.metric.description, x, y + 16, w, { size: 7, weight: 700, color: INK_SOFT, maxLines: 2, lineH: 9 })
  if (level.time_limit_ms) text(ctx, `Time: ${fmtTime(level.time_limit_ms)}`, x + w, y - 2, { size: 7.5, weight: 800, align: 'right' })
  y += 14
  textBlock(ctx, level.controls_hint, x, y, w, { size: 7, weight: 700, color: INK, maxLines: 3, lineH: 9 })
  const blink = Math.floor(t / 600) % 2 === 0
  text(ctx, 'Press Enter or click to start', r.x + r.w / 2, r.y + r.h - 14, { size: 8, weight: 800, align: 'center', color: blink ? '#7a3f12' : INK_SOFT })
}

export function drawScoreCard(ctx: Ctx, e: GameEngine, t: number) {
  const res = e.result
  const level = e.level
  if (!res || !level) return
  ctx.fillStyle = 'rgba(30,22,12,0.5)'
  ctx.fillRect(0, 0, e.W, e.H)
  const r = cardRect(e.W, e.H)
  woodPanel(ctx, r)
  const color = res.passed ? '#8cc265' : '#f0a35d'
  const ribbon = { x: r.x + 20, y: r.y + 10, w: r.w - 40, h: 18 }
  px(ctx, WOOD_DARK, ribbon.x - 1, ribbon.y - 1, ribbon.w + 2, ribbon.h + 2)
  px(ctx, color, ribbon.x, ribbon.y, ribbon.w, ribbon.h)
  px(ctx, shade(color, 0.3), ribbon.x, ribbon.y, ribbon.w, 2)
  text(ctx, res.passed ? 'Quest complete!' : 'Not quite yet', r.x + r.w / 2, ribbon.y + 13, { size: 9.5, weight: 800, align: 'center' })
  // score + stars
  text(ctx, fmtNum(res.score), r.x + 26, r.y + 60, { size: 26, weight: 800, color: res.passed ? '#3f6f2a' : '#9a4a1e' })
  ctx.font = '800 26px Nunito, system-ui, sans-serif'
  const sw = ctx.measureText(fmtNum(res.score)).width
  text(ctx, '/100', r.x + 28 + sw, r.y + 60, { size: 9, weight: 800, color: INK_SOFT })
  text(ctx, level.metric.name, r.x + 26, r.y + 72, { size: 7, weight: 800, color: INK_SOFT })
  const stars = res.score >= 95 ? 3 : res.score >= 85 ? 2 : res.passed ? 1 : 0
  for (let i = 0; i < 3; i++) {
    const sx = r.x + r.w - 78 + i * 18
    const sy = r.y + 44
    const on = i < stars
    const pop = on ? Math.max(0, 1 - Math.abs(((t / 400) % 3) - i) * 2) : 0
    star(ctx, sx + 7, sy + 7 - pop, on ? GOLD : '#dcc9a2')
  }
  let y = r.y + 88
  const line = level.dialogue?.find((d) => d.at === (res.passed ? 'pass' : 'fail'))
  if (line) {
    const npc = e.npc(line.npc_id)
    y += textBlock(ctx, `${npc?.name ?? ''}: “${line.text}”`, r.x + 18, y, r.w - 36, { size: 7, weight: 700, italic: true, color: INK_SOFT, maxLines: 2, lineH: 9 }) + 3
  }
  for (const f of res.feedback.slice(0, 3)) {
    y += textBlock(ctx, `• ${f}`, r.x + 18, y, r.w - 36, { size: 7.5, weight: 800, maxLines: 2, lineH: 9 }) + 1
  }
  // breakdown bars
  const terms = Object.values(res.breakdown).slice(0, 6)
  const cols = terms.length > 3 ? 2 : 1
  const bw = (r.w - 36 - (cols - 1) * 10) / cols
  const top = Math.max(y + 3, r.y + r.h - 30 - Math.ceil(terms.length / cols) * 11)
  terms.forEach((b, i) => {
    const bx = r.x + 18 + (i % cols) * (bw + 10)
    const by = top + Math.floor(i / cols) * 11
    text(ctx, b.label, bx, by + 6, { size: 6.5, weight: 800, maxW: bw * 0.5 })
    const barX = bx + bw * 0.52
    const barW = bw * 0.48 - 16
    px(ctx, WOOD_DARK, barX, by, barW, 7)
    px(ctx, PARCHMENT_DARK, barX + 1, by + 1, barW - 2, 5)
    px(ctx, b.score >= 80 ? '#8cc265' : b.score >= 50 ? GOLD : '#f08a5d', barX + 1, by + 1, ((barW - 2) * b.score) / 100, 5)
    text(ctx, String(b.score), bx + bw, by + 6, { size: 6.5, weight: 800, align: 'right' })
  })
  text(ctx, 'Enter or click to continue', r.x + r.w / 2, r.y + r.h - 12, { size: 7.5, weight: 800, align: 'center', color: INK_SOFT })
}

function star(ctx: Ctx, cx: number, cy: number, color: string) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? 3.2 : 7.5
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 1
  ctx.stroke()
}

