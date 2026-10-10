// Level panels and the intro card (sort, converse and deliver draw in their own files).
import type { GameEngine } from '../engine'
import { cardRect, panelRect } from '../layout'
import { ConverseMechanic } from '../mechanics/converse'
import { DeliverMechanic } from '../mechanics/deliver'
import { MixMechanic } from '../mechanics/mix'
import { SortMechanic } from '../mechanics/sort'
import { TimingMechanic } from '../mechanics/timing'
import type { Rect } from '../types'
import { INK, INK_SOFT, PARCHMENT, PARCHMENT_DARK, WOOD_DARK, px, roundRect, shade, text, textBlock, woodPanel, wrap, type Ctx } from './pixel'
import { craftHint, drawCraft } from './craftPanel'
import { drawPerson, npcColors } from './sprites'
import { drawSort } from './sortPanel'
import { drawConverse } from './conversePanel'
import { drawTiming } from './timingPanel'

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

/** The level's controls hint; the craft station describes its own tools. */
function controlsHint(e: GameEngine): string {
  if (e.phase === 'playing' && e.mech instanceof MixMechanic) return craftHint(e.mech)
  const level = e.level!
  if (level.mechanic === 'mix') {
    const submit = String((level.params as { submit_label?: string }).submit_label ?? 'finish')
    return `Up/Down pick a tool · hold Right (or hold the mouse on it) to use it · Left to take back · or drag its gauge · Enter: ${submit}`
  }
  return level.controls_hint
}

/** Footer: the controls hint, or a villager's line while their bubble is up (in-level chatter). */
function footer(ctx: Ctx, e: GameEngine, p: Rect) {
  const b = e.bubble
  const npc = b && e.t <= b.until && !(e.mech instanceof ConverseMechanic) ? e.npc(b.npcId) : undefined
  if (!b || !npc) {
    text(ctx, controlsHint(e), p.x + p.w / 2, p.y + p.h - 11, { size: 6.5, weight: 700, color: INK_SOFT, align: 'center', maxW: p.w - 24 })
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
  if (m instanceof MixMechanic) drawCraft(ctx, e, m, t)
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
  textBlock(ctx, controlsHint(e), x, y, w, { size: 7, weight: 700, color: INK, maxLines: 3, lineH: 9 })
  const blink = Math.floor(t / 600) % 2 === 0
  text(ctx, 'Press Enter or click to start', r.x + r.w / 2, r.y + r.h - 14, { size: 8, weight: 800, align: 'center', color: blink ? '#7a3f12' : INK_SOFT })
}
