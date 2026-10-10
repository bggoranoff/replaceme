// Fixed logical geometry (observation.viewport coordinates). Game logic, hit-testing,
// observation targets and the renderer all read these, so a run replays identically
// on any screen size.
import type { Rect } from './types'

export const TILE = 16
export const STEP_MS = 100

export function panelRect(W: number, H: number): Rect {
  const w = Math.min(W - 24, 368)
  const h = Math.min(H - 16, 236)
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h }
}

/** Area inside a level panel below the title/aim header and above the hint footer. */
export function contentRect(W: number, H: number): Rect {
  const p = panelRect(W, H)
  return { x: p.x + 12, y: p.y + 50, w: p.w - 24, h: p.h - 50 - 22 }
}

export function cardRect(W: number, H: number): Rect {
  const w = Math.min(W - 32, 288)
  const h = Math.min(H - 20, 220)
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h }
}

export const hit = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

export const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

// --- mix (craft station) ----------------------------------------------------

/** Craft station: a column of station items (Up/Down) with gauges, the selected item's tool, the result + action button. */
export function craftLayout(W: number, H: number, n: number, ingredients = 0) {
  const full = contentRect(W, H)
  // keep clear of the footer line (villager chatter bubble)
  const c = { ...full, h: full.h - 4 }
  const listW = 104
  const resW = 84
  const gap = 6
  const rowGap = 2
  const rowH = Math.min(34, Math.floor((c.h - rowGap * (n - 1)) / Math.max(1, n)))
  const listTop = c.y + Math.max(0, Math.floor((c.h - (rowH * n + rowGap * (n - 1))) / 2))
  const items: Rect[] = Array.from({ length: n }, (_, i) => ({ x: c.x, y: listTop + i * (rowH + rowGap), w: listW, h: rowH }))
  // each station's gauge: a thin track along the bottom of its row (slider:<var_id>)
  const gauges: Rect[] = items.map((r) => ({ x: r.x + 22, y: r.y + Math.min(r.h - 7, Math.floor(Math.max(0, r.h - 28) / 2) + 21), w: r.w - 28, h: 4 }))
  const stage: Rect = { x: c.x + listW + gap, y: c.y, w: c.w - listW - resW - gap * 2, h: c.h }
  const tool: Rect = { x: stage.x, y: stage.y, w: stage.w, h: stage.h - 24 }
  const back: Rect = { x: stage.x, y: stage.y + stage.h - 20, w: 62, h: 20 }
  const resX = stage.x + stage.w + gap
  const submit: Rect = { x: resX, y: c.y + c.h - 24, w: resW, h: 24 }
  const ingH = 16
  const ing: Rect[] = Array.from({ length: ingredients }, (_, i) => ({ x: resX, y: submit.y - 4 - (ingredients - i) * (ingH + 3), w: resW, h: ingH }))
  const resultBottom = (ing.length ? ing[0].y : submit.y) - 4
  const result: Rect = { x: resX, y: c.y, w: resW, h: Math.max(30, resultBottom - c.y) }
  return { items, gauges, stage, tool, back, result, submit, ingredients: ing }
}

// --- timing ----------------------------------------------------------------

/** The whole minigame stage (scene + meter): press or hold anywhere on it. */
export function timingMeter(W: number, H: number): Rect {
  const c = contentRect(W, H)
  return { x: c.x, y: c.y + 26, w: c.w, h: c.h - 26 - 22 }
}

// --- sort ------------------------------------------------------------------

export function sortItem(W: number, H: number): Rect {
  const c = contentRect(W, H)
  const w = 168
  return { x: Math.round(c.x + (c.w - w) / 2), y: c.y + 6, w, h: 52 }
}

export function sortBins(W: number, H: number, n: number): Rect[] {
  const c = contentRect(W, H)
  const gap = 8
  const w = Math.min(84, Math.floor((c.w - gap * (n - 1)) / n))
  const total = w * n + gap * (n - 1)
  const x0 = Math.round(c.x + (c.w - total) / 2)
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y: c.y + c.h - 72, w, h: 68 }))
}

// --- converse --------------------------------------------------------------

export function conversePortrait(W: number, H: number): Rect {
  const c = contentRect(W, H)
  return { x: c.x, y: c.y + 2, w: 52, h: 52 }
}

export function converseBubble(W: number, H: number): Rect {
  const c = contentRect(W, H)
  return { x: c.x + 62, y: c.y, w: c.w - 62, h: 58 }
}

export function converseOptions(W: number, H: number, n: number): Rect[] {
  const c = contentRect(W, H)
  const top = c.y + 66
  const gap = 4
  const h = Math.min(34, Math.floor((c.h - 66 - gap * (n - 1)) / Math.max(1, n)))
  return Array.from({ length: n }, (_, i) => ({ x: c.x, y: top + i * (h + gap), w: c.w, h }))
}
