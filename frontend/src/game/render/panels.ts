// Level panels and the intro card (sort, converse and deliver draw in their own files).
import type { GameEngine } from '../engine'
import { cardRect, contentRect, panelRect } from '../layout'
import { ConverseMechanic } from '../mechanics/converse'
import { DeliverMechanic } from '../mechanics/deliver'
import { MixMechanic } from '../mechanics/mix'
import { SortMechanic } from '../mechanics/sort'
import { TimingMechanic } from '../mechanics/timing'
import type { Rect } from '../types'
import { GOLD, INK, INK_SOFT, PARCHMENT, PARCHMENT_DARK, WOOD_DARK, button, mix, px, roundRect, shade, text, textBlock, woodPanel, wrap, type Ctx } from './pixel'
import { drawPerson, npcColors } from './sprites'
import { drawSort } from './sortPanel'
import { drawConverse } from './conversePanel'

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

// drawn in sortPanel.ts

// --- converse ------------------------------------------------------------------

// drawn in conversePanel.ts

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
