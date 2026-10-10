// Small canvas helpers for the procedural pixel-art renderer (logical coordinates).
import type { Rect } from '../types'

export type Ctx = CanvasRenderingContext2D

export const INK = '#4a3424'
export const INK_SOFT = '#8a6a50'
export const PARCHMENT = '#fbecc8'
export const PARCHMENT_DARK = '#efd7a6'
export const WOOD_DARK = '#5b3a1e'
export const WOOD = '#b97a43'
export const WOOD_LIGHT = '#dca46a'
export const GOLD = '#f2c14e'
export const LEAF = '#4f8f3a'
export const FONT = 'Nunito, system-ui, sans-serif'

export function px(ctx: Ctx, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

export function hash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

export function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

/** Lightens (amt > 0) or darkens (amt < 0) a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const f = (c: number) => clamp255(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))
  return `#${((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1)}`
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255]
  const [r1, g1, b1] = ch(pa)
  const [r2, g2, b2] = ch(pb)
  const l = (u: number, v: number) => clamp255(u + (v - u) * t)
  return `#${((1 << 24) | (l(r1, r2) << 16) | (l(g1, g2) << 8) | l(b1, b2)).toString(16).slice(1)}`
}

export function font(ctx: Ctx, size: number, weight = 700, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`
}

export interface TextOpts {
  size?: number
  weight?: number
  color?: string
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  italic?: boolean
  maxW?: number
}

export function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts = {}) {
  font(ctx, o.size ?? 8, o.weight ?? 700, o.italic)
  ctx.fillStyle = o.color ?? INK
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = o.baseline ?? 'alphabetic'
  let str = s
  if (o.maxW && ctx.measureText(str).width > o.maxW) {
    while (str.length > 1 && ctx.measureText(str + '…').width > o.maxW) str = str.slice(0, -1)
    str += '…'
  }
  ctx.fillText(str, x, y)
}

/** Word-wraps with the font already set by the caller (or by size/weight). */
export function wrap(ctx: Ctx, s: string, maxW: number, size = 8, weight = 700, italic = false): string[] {
  font(ctx, size, weight, italic)
  const words = s.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= maxW || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines
}

export function textBlock(ctx: Ctx, s: string, x: number, y: number, maxW: number, o: TextOpts & { lineH?: number; maxLines?: number } = {}): number {
  const size = o.size ?? 8
  let lines = wrap(ctx, s, maxW, size, o.weight ?? 700, o.italic)
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines)
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, '') + '…'
  }
  const lh = o.lineH ?? Math.round(size * 1.3)
  lines.forEach((l, i) => text(ctx, l, x, y + i * lh, { ...o, maxW: undefined }))
  return lines.length * lh
}

export function roundRect(ctx: Ctx, r: Rect, rad: number, fill?: string, stroke?: string, lw = 1) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, rad)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
  }
}

/** Wooden menu frame with a parchment inside (cozy farm-game style). */
export function woodPanel(ctx: Ctx, r: Rect, inner = PARCHMENT) {
  px(ctx, 'rgba(40,24,10,0.28)', r.x + 3, r.y + 4, r.w, r.h)
  px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
  px(ctx, WOOD, r.x + 2, r.y + 2, r.w - 4, r.h - 4)
  px(ctx, WOOD_LIGHT, r.x + 2, r.y + 2, r.w - 4, 1)
  px(ctx, WOOD_DARK, r.x + 5, r.y + 5, r.w - 10, r.h - 10)
  px(ctx, inner, r.x + 6, r.y + 6, r.w - 12, r.h - 12)
  px(ctx, shade(inner, -0.06), r.x + 6, r.y + r.h - 8, r.w - 12, 2)
  // corner studs
  for (const [cx, cy] of [[r.x + 2, r.y + 2], [r.x + r.w - 5, r.y + 2], [r.x + 2, r.y + r.h - 5], [r.x + r.w - 5, r.y + r.h - 5]]) {
    px(ctx, GOLD, cx, cy, 3, 3)
  }
}

export function button(ctx: Ctx, r: Rect, label: string, active: boolean, color = '#8cc265') {
  px(ctx, 'rgba(40,24,10,0.3)', r.x + 1, r.y + 2, r.w, r.h)
  px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
  px(ctx, active ? shade(color, 0.15) : color, r.x + 1, r.y + 1, r.w - 2, r.h - 2)
  px(ctx, shade(color, 0.35), r.x + 1, r.y + 1, r.w - 2, 1)
  px(ctx, shade(color, -0.25), r.x + 1, r.y + r.h - 3, r.w - 2, 2)
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 3, { size: 9, weight: 800, align: 'center', color: INK, maxW: r.w - 6 })
  if (active) {
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1
    ctx.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3)
  }
}
