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

// --- mix -------------------------------------------------------------------

export const MIX_ART_W = 72

export function mixRows(W: number, H: number, n: number) {
  const c = contentRect(W, H)
  const x = c.x + MIX_ART_W + 8
  const w = c.w - MIX_ART_W - 8
  const rowsH = c.h - 28
  const rowH = Math.min(30, Math.floor(rowsH / Math.max(1, n)))
  const top = c.y + Math.max(0, Math.floor((rowsH - rowH * n) / 2))
  return Array.from({ length: n }, (_, i) => {
    const y = top + i * rowH
    return {
      row: { x, y, w, h: rowH },
      track: { x: x + 4, y: y + rowH - 13, w: w - 8, h: 12 },
    }
  })
}

export function mixSubmit(W: number, H: number): Rect {
  const c = contentRect(W, H)
  return { x: c.x + c.w - 84, y: c.y + c.h - 22, w: 84, h: 22 }
}

export function mixIngredients(W: number, H: number, n: number): Rect[] {
  const c = contentRect(W, H)
  const w = 52
  return Array.from({ length: n }, (_, i) => ({ x: c.x + i * (w + 4), y: c.y + c.h - 22, w, h: 22 }))
}

// --- timing ----------------------------------------------------------------

export function timingMeter(W: number, H: number): Rect {
  const c = contentRect(W, H)
  return { x: c.x + 18, y: c.y + 44, w: c.w - 36, h: 30 }
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
  return { x: c.x, y: c.y, w: 62, h: 62 }
}

export function converseBubble(W: number, H: number): Rect {
  const c = contentRect(W, H)
  return { x: c.x + 72, y: c.y, w: c.w - 72, h: 62 }
}

/** Answer cards below the portrait and bubble, centred in the space that is left. */
export function converseOptions(W: number, H: number, n: number): Rect[] {
  const c = contentRect(W, H)
  const top = c.y + 70
  const gap = 5
  const room = c.y + c.h - top
  const h = Math.min(32, Math.floor((room - gap * (n - 1)) / Math.max(1, n)))
  const y0 = top + Math.max(0, Math.floor((room - (h * n + gap * (n - 1))) / 2))
  return Array.from({ length: n }, (_, i) => ({ x: c.x, y: y0 + i * (h + gap), w: c.w, h }))
}
