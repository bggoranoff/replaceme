// Craft station panel (mix mechanic): physical tools instead of sliders. Visuals come only from the
// level params (labels, units, ranges); nothing here knows about a job, and no scoring target is drawn.
import type { GameEngine } from '../engine'
import { VERB_WORDS, type MixMechanic, type ToolFx, type Verb } from '../mechanics/mix'
import type { Rect, Variable } from '../types'
import { GOLD, INK, INK_SOFT, PARCHMENT, PARCHMENT_DARK, WOOD, WOOD_DARK, WOOD_LIGHT, button, mix, px, roundRect, seedOf, shade, text, type Ctx } from './pixel'

const ACTIVE_MS = 170
const TAU = Math.PI * 2

// --- colours from labels -------------------------------------------------------------

const TINTS: [RegExp, string][] = [
  [/coffee|espresso|bean|cocoa|choc|cacao/i, '#4a2a14'],
  [/tea|matcha|herb/i, '#6f7a2a'],
  [/flour|sugar|salt|starch|powder|food|baking|yeast/i, '#efe6d2'],
  [/wax|paraffin|resin/i, '#e9d7a0'],
  [/honey|syrup|caramel|malt/i, '#c98a1e'],
  [/milk|cream|oat/i, '#f5efe2'],
  [/oil|butter/i, '#e3c14a'],
  [/berry|wine|beet|cherry/i, '#8a2440'],
  [/leaf|grass|green|fert|moss/i, '#4f8f3a'],
  [/water|rinse|ice/i, '#8fc9ec'],
]
const FALLBACK = ['#b4563f', '#3f7fb4', '#8a5ab4', '#c98e4f', '#4f8f3a', '#d0743c']

/** The colour a label names (coffee, milk, oil...), or null. */
function namedTint(label: string): string | null {
  for (const [re, c] of TINTS) if (re.test(label)) return c
  return null
}

export function tintFor(label: string): string {
  return namedTint(label) ?? FALLBACK[seedOf(label) % FALLBACK.length]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const fracOf = (v: Variable, value: number) => clamp01((value - v.min) / (v.max - v.min || 1))

export function fmtAmount(v: Variable, value: number): string {
  const u = v.unit.trim()
  if (/^(s|sec|secs|seconds?)$/i.test(u) && value >= 60) {
    const s = Math.round(value)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  const a = Math.abs(value)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2
  return `${Number(value.toFixed(d))} ${u}`.trim()
}

interface ToolCtx {
  ctx: Ctx
  r: Rect
  v: Variable
  f: number
  fx: ToolFx
  /** Level time since the tool last moved (ms). */
  since: number
  pouring: boolean
  t: number
  liquid: string
  tint: string
  floorY: number
}

// --- small glyphs for the station list -------------------------------------------------

function glyph(ctx: Ctx, verb: Verb, x: number, y: number, tint: string) {
  switch (verb) {
    case 'pour':
      px(ctx, WOOD_DARK, x + 1, y + 2, 9, 10)
      px(ctx, '#dff1fb', x + 2, y + 3, 7, 8)
      px(ctx, tint, x + 2, y + 7, 7, 4)
      px(ctx, WOOD_DARK, x + 10, y + 4, 2, 5)
      break
    case 'scoop':
      px(ctx, WOOD_DARK, x, y + 9, 12, 3)
      px(ctx, shade(tint, -0.35), x + 1, y + 4, 10, 5)
      px(ctx, shade(tint, -0.35), x + 3, y + 2, 6, 2)
      px(ctx, tint, x + 2, y + 5, 8, 4)
      px(ctx, tint, x + 4, y + 3, 4, 2)
      px(ctx, shade(tint, -0.25), x + 3, y + 8, 6, 1)
      break
    case 'steep':
      ctx.fillStyle = WOOD_DARK
      ctx.beginPath()
      ctx.arc(x + 6, y + 7, 6, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fff8e8'
      ctx.beginPath()
      ctx.arc(x + 6, y + 7, 4.6, 0, TAU)
      ctx.fill()
      px(ctx, INK, x + 6, y + 3, 1, 4)
      px(ctx, INK, x + 6, y + 7, 3, 1)
      break
    case 'heat':
      px(ctx, '#e8574a', x + 3, y + 4, 6, 8)
      px(ctx, '#f2c14e', x + 4, y + 7, 4, 5)
      px(ctx, '#e8574a', x + 5, y + 1, 2, 3)
      break
    case 'stack':
      px(ctx, WOOD_DARK, x, y + 1, 12, 11)
      px(ctx, tint, x + 1, y + 2, 10, 4)
      px(ctx, shade(tint, -0.15), x + 1, y + 7, 10, 4)
      break
    case 'pump':
      ctx.fillStyle = WOOD_DARK
      ctx.beginPath()
      ctx.arc(x + 6, y + 8, 6, Math.PI, TAU)
      ctx.fill()
      px(ctx, '#fff8e8', x + 2, y + 6, 8, 2)
      px(ctx, '#e8574a', x + 6, y + 3, 1, 5)
      break
  }
}

// --- the tools -------------------------------------------------------------------------

function drawPour(o: ToolCtx) {
  const { ctx, r, f, t, since, fx } = o
  const vw = 46
  const vh = 70
  const vx = Math.round(r.x + r.w / 2 - 2)
  const vy = o.floorY - vh
  // measuring jug (glass)
  px(ctx, 'rgba(40,24,10,0.18)', vx + 3, o.floorY - 2, vw, 4)
  px(ctx, WOOD_DARK, vx - 1, vy - 1, vw + 2, vh + 2)
  px(ctx, '#eef8fd', vx, vy, vw, vh)
  px(ctx, WOOD_DARK, vx + vw + 1, vy + 12, 5, 3)
  px(ctx, WOOD_DARK, vx + vw + 4, vy + 12, 2, 30)
  px(ctx, WOOD_DARK, vx + vw + 1, vy + 40, 5, 3)
  const base = o.v.min > 0 ? 0.12 : 0
  const inner = vh - 6
  const level = Math.round(inner * (base + (1 - base) * f))
  const wobble = since < 500 ? Math.round(Math.sin(t / 60) * 1.5 * (1 - since / 500)) : 0
  if (level > 0) {
    const ly = vy + vh - 1 - level
    px(ctx, o.liquid, vx + 1, ly, vw - 2, level)
    px(ctx, shade(o.liquid, 0.35), vx + 1, ly, vw - 2, 2)
    px(ctx, shade(o.liquid, 0.5), vx + 4, ly + 1 + wobble, 10, 1)
    px(ctx, shade(o.liquid, -0.12), vx + 1, vy + vh - 3, vw - 2, 2)
  }
  // glass shine
  px(ctx, 'rgba(255,255,255,0.7)', vx + 3, vy + 4, 2, vh - 12)
  // measuring lines from the public range
  for (const val of niceTicks(o.v.min, o.v.max)) {
    const ly = vy + vh - 1 - Math.round(inner * (base + (1 - base) * fracOf(o.v, val)))
    px(ctx, 'rgba(74,52,36,0.75)', vx + vw - 12, ly, 11, 1)
    text(ctx, fmtShort(val), vx + vw - 14, ly + 2.5, { size: 5.5, weight: 800, color: 'rgba(74,52,36,0.85)', align: 'right' })
  }
  // kettle / jug tilting over the jug
  const pouring = o.pouring && fx.dir === 1
  const tilt = pouring ? -0.55 - Math.min(0.25, fx.streak * 0.02) : since < 260 && fx.dir === 1 ? -0.3 * (1 - since / 260) : 0
  const kx = vx - 28
  const ky = vy - 18
  ctx.save()
  ctx.translate(kx + 14, ky + 14)
  ctx.rotate(-tilt)
  ctx.translate(-14, -14)
  px(ctx, WOOD_DARK, 0, 2, 28, 22)
  px(ctx, '#c9d6de', 1, 3, 26, 20)
  px(ctx, '#e7eef2', 3, 5, 6, 14)
  px(ctx, WOOD_DARK, 27, 6, 10, 4)
  px(ctx, '#c9d6de', 28, 7, 8, 2)
  px(ctx, WOOD_DARK, -5, 6, 5, 3)
  px(ctx, WOOD_DARK, -6, 6, 2, 12)
  px(ctx, WOOD_DARK, -5, 16, 5, 3)
  px(ctx, WOOD_DARK, 8, -1, 12, 3)
  ctx.restore()
  // stream: thicker the longer you hold (the flow speeds up)
  const sx = vx + 10
  const sy = ky + 12
  const surface = vy + vh - 1 - level
  if (pouring) {
    const w = 1 + Math.min(3, Math.floor(fx.streak / 4))
    px(ctx, o.liquid, sx, sy, w, surface - sy)
    px(ctx, shade(o.liquid, 0.4), sx, sy, 1, surface - sy)
    for (let i = 0; i < 3; i++) {
      const sp = (t / 90 + i * 0.33) % 1
      px(ctx, shade(o.liquid, 0.45), sx - 3 + i * 3 + Math.round(sp * (i - 1) * 4), surface - 2 - Math.round(Math.sin(sp * Math.PI) * 4), 1, 1)
    }
  } else if (fx.dir === 1 && since < 700) {
    // a few drips after letting go
    for (let i = 0; i < 2; i++) {
      const d = since - i * 220
      if (d < 0 || d > 420) continue
      const y = sy + ((surface - sy) * d) / 420
      px(ctx, o.liquid, sx, y, 2, 3)
    }
  } else if (fx.dir === -1 && since < 400) {
    for (let i = 0; i < 4; i++) px(ctx, o.liquid, vx - 4 - i * 2, vy + 6 + ((since / 8 + i * 7) % 40), 2, 2)
  }
}

/** Round-number marks inside (min, max], about four of them. */
function niceTicks(min: number, max: number): number[] {
  const raw = (max - min) / 4 || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil((min + step * 0.5) / step) * step; v <= max + 1e-9 && out.length < 6; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

function fmtShort(v: number): string {
  const a = Math.abs(v)
  if (a >= 10000) return `${Math.round(v / 1000)}k`
  if (a >= 1000) return `${Number((v / 1000).toFixed(1))}k`
  return String(Number(v.toFixed(a >= 10 ? 0 : 1)))
}

function drawScoop(o: ToolCtx) {
  const { ctx, r, f, since, fx } = o
  const sw = 74
  const sx = Math.round(r.x + r.w / 2 - sw / 2)
  const sy = o.floorY - 16
  // scale
  px(ctx, 'rgba(40,24,10,0.18)', sx + 3, o.floorY - 2, sw, 4)
  px(ctx, WOOD_DARK, sx, sy, sw, 16)
  px(ctx, '#d8dde0', sx + 1, sy + 1, sw - 2, 14)
  px(ctx, '#2f3a33', sx + sw / 2 - 20, sy + 3, 40, 10)
  text(ctx, fmtAmount(o.v, valueOf(o)), sx + sw / 2, sy + 11, { size: 7.5, weight: 800, color: '#9df29a', align: 'center', maxW: 38 })
  px(ctx, WOOD_DARK, sx + 8, sy - 3, sw - 16, 3)
  // pile: grows with the amount
  const count = /^(x|×|pcs?|pieces?|items?|units?|count|eggs?|loaves|loaf|stems?|frames?|bunch(es)?|scoops?|shots?|)$/i.test(o.v.unit.trim())
  const ph = Math.round(4 + f * 46)
  const pw = Math.round(20 + f * 34)
  const cx = sx + sw / 2
  const base = sy - 3
  if (count) {
    // small whole counts are shown one for one; bigger ones scale to at most 21 pieces
    const value = valueOf(o)
    const exact = o.v.step >= 1 && o.v.max <= 21
    const n = exact ? Math.max(0, Math.round(value)) : Math.round(f * 20) + (o.v.min > 0 ? 1 : 0)
    // a neat pyramid on the scale plate: 6 on the bottom row, one fewer per row up
    let row = 0
    let inRow = 0
    for (let i = 0; i < n; i++) {
      const cap = Math.max(1, 6 - row)
      const rowCount = Math.min(cap, n - (i - inRow))
      const x = cx - ((rowCount - 1) * 9) / 2 + inRow * 9
      const y = base - 5 - row * 7.5
      const lift = exact && i === n - 1 && fx.dir === 1 && since < 220 ? Math.round(12 * (1 - since / 220)) : 0
      ctx.fillStyle = WOOD_DARK
      ctx.beginPath()
      ctx.arc(x, y - lift, 4.4, 0, TAU)
      ctx.fill()
      ctx.fillStyle = o.tint
      ctx.beginPath()
      ctx.arc(x, y - lift, 3.4, 0, TAU)
      ctx.fill()
      px(ctx, shade(o.tint, 0.35), x - 2, y - lift - 2, 2, 1)
      if (++inRow >= cap) {
        row++
        inRow = 0
      }
    }
  } else {
    const edge = shade(o.tint, isPale(o.tint) ? -0.3 : -0.25)
    for (let k = 0; k < ph; k++) {
      const w = Math.round(pw * Math.sqrt(1 - k / ph))
      px(ctx, k % 3 === 0 ? shade(o.tint, -0.12) : o.tint, cx - w / 2, base - 1 - k, w, 1)
      px(ctx, edge, cx - w / 2 - 1, base - 1 - k, 1, 1)
      px(ctx, edge, cx + w / 2, base - 1 - k, 1, 1)
    }
    for (let i = 0; i < 8; i++) {
      const gx = cx - pw / 2 + ((seedOf(`${i}`) % 100) / 100) * pw
      const gy = base - 2 - ((i * 37) % Math.max(1, ph - 2)) * 0.6
      px(ctx, shade(o.tint, i % 2 ? 0.25 : -0.3), gx, gy, 1, 1)
    }
  }
  // the scoop: dips in when adding, lifts out when taking back
  const active = since < 260
  const dip = active ? Math.sin((since / 260) * Math.PI) : 0
  const spx = cx + 8
  const spy = base - ph - 22 + (fx.dir === 1 ? dip * 6 : -dip * 6)
  ctx.save()
  ctx.translate(spx, spy)
  ctx.rotate(active && fx.dir === 1 ? 0.9 * dip : -0.2)
  px(ctx, WOOD_DARK, -1, -3, 26, 3)
  px(ctx, WOOD, 6, -2, 18, 1)
  px(ctx, WOOD_DARK, -12, -6, 12, 9)
  px(ctx, '#cfd8dc', -11, -5, 10, 7)
  if (!(active && fx.dir === 1) || dip < 0.6) px(ctx, o.tint, -11, -6, 10, 3)
  ctx.restore()
  if (active && fx.dir === 1) {
    for (let i = 0; i < 6; i++) {
      const g = (since / 260 + i * 0.13) % 1
      px(ctx, o.tint, spx - 8 + (i % 3) * 3, spy + 2 + g * (base - ph - spy), 2, 2)
    }
  }
}

function valueOf(o: ToolCtx) {
  return o.v.min + o.f * (o.v.max - o.v.min)
}

function drawSteep(o: ToolCtx) {
  const { ctx, r, f, t, since, fx } = o
  // brewing pot: colour deepens as time passes
  const bw = 50
  const bh = 52
  const cr = 21
  const bx = Math.round(r.x + (r.w - (bw + 10 + cr * 2 + 4)) / 2)
  const by = o.floorY - bh
  const from = o.tint === o.liquid ? shade(o.liquid, 0.25) : mix(shade(o.liquid, 0.25), shade(o.tint, 0.6), 0.75)
  const brew = mix(from, o.tint === o.liquid ? shade(o.tint, -0.7) : o.tint, Math.min(1, 0.15 + f * 0.95))
  const deep = f > 0.8 ? shade(brew, -(f - 0.8) * 2.2) : brew
  px(ctx, 'rgba(40,24,10,0.18)', bx + 3, o.floorY - 2, bw, 4)
  px(ctx, WOOD_DARK, bx - 1, by - 1, bw + 2, bh + 2)
  px(ctx, '#eef8fd', bx, by, bw, bh)
  px(ctx, deep, bx + 1, by + 10, bw - 2, bh - 11)
  px(ctx, shade(deep, 0.25), bx + 1, by + 10, bw - 2, 2)
  px(ctx, 'rgba(255,255,255,0.6)', bx + 3, by + 4, 2, bh - 10)
  // plunger rod
  px(ctx, WOOD_DARK, bx + bw / 2 - 1, by - 14, 3, 18)
  px(ctx, WOOD_DARK, bx + bw / 2 - 6, by - 16, 13, 3)
  px(ctx, '#9aa7ad', bx + 2, by + 8, bw - 4, 2)
  const running = o.pouring && fx.dir === 1
  const nb = running ? 7 : 3
  for (let i = 0; i < nb; i++) {
    const ph = ((t / (running ? 380 : 900) + i * 0.37) % 1)
    px(ctx, 'rgba(255,255,255,0.65)', bx + 6 + ((i * 13) % (bw - 12)), by + bh - 4 - ph * (bh - 16), 2, 2)
  }
  for (let i = 0; i < 3; i++) {
    const ph = (t / 1100 + i * 0.33) % 1
    px(ctx, `rgba(255,255,255,${0.7 - ph * 0.7})`, bx + 12 + i * 12 + Math.round(Math.sin(t / 300 + i) * 2), by - 20 - ph * 16, 3, 3)
  }
  // clock: the hand sweeps with every step, the ring shows how far through the range you are
  const cx = bx + bw + 12 + cr
  const cy = by + 6
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(cx, cy, cr + 2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#fff8e8'
  ctx.beginPath()
  ctx.arc(cx, cy, cr, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = shade(deep, 0.1)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, cr - 4, -Math.PI / 2, -Math.PI / 2 + TAU * f)
  ctx.stroke()
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU
    px(ctx, INK_SOFT, cx + Math.sin(a) * (cr - 9) - 0.5, cy - Math.cos(a) * (cr - 9) - 0.5, 1.5, 1.5)
  }
  const unit = o.v.unit.trim().toLowerCase()
  const perLap = /^(s|sec|secs|seconds?)$/.test(unit) ? 60 : /^(min|mins|minutes?)$/.test(unit) ? 60 : /^(h|hr|hrs|hours?)$/.test(unit) ? 12 : o.v.max || 1
  const val = valueOf(o)
  const a = ((val % perLap) / perLap) * TAU
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.sin(a) * (cr - 7), cy - Math.cos(a) * (cr - 7))
  ctx.stroke()
  const ah = (val / (perLap * 12)) * TAU
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.sin(ah) * (cr - 13), cy - Math.cos(ah) * (cr - 13))
  ctx.stroke()
  px(ctx, INK, cx - 1.5, cy - 1.5, 3, 3)
  text(ctx, fmtAmount(o.v, val), cx, cy + cr + 12, { size: 9, weight: 800, align: 'center' })
  if (running && since < ACTIVE_MS) px(ctx, GOLD, cx - 2, cy - cr - 6, 4, 3)
}

function drawHeat(o: ToolCtx) {
  const { ctx, r, f, t } = o
  // thermometer
  const tx = Math.round(r.x + r.w - 34)
  const ty = r.y + 26
  const th = o.floorY - ty - 18
  px(ctx, WOOD_DARK, tx - 1, ty - 1, 10, th + 2)
  px(ctx, '#fff8e8', tx, ty, 8, th)
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(tx + 4, ty + th + 6, 8, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#e8574a'
  ctx.beginPath()
  ctx.arc(tx + 4, ty + th + 6, 6.5, 0, TAU)
  ctx.fill()
  const mh = Math.round(4 + f * (th - 6))
  px(ctx, '#e8574a', tx + 2, ty + th - mh, 4, mh + 2)
  px(ctx, '#f6a08f', tx + 2, ty + th - mh, 1, mh)
  for (const val of niceTicks(o.v.min, o.v.max)) {
    const y = ty + th - 2 - Math.round((th - 6) * fracOf(o.v, val))
    px(ctx, INK_SOFT, tx + 9, y, 4, 1)
    text(ctx, fmtShort(val), tx + 15, y + 2, { size: 5.5, weight: 800, color: INK_SOFT })
  }
  // pot on a burner; the flame grows with the temperature
  const pw = 56
  const px0 = Math.round(r.x + 12)
  const py0 = o.floorY - 50
  const fh = 4 + f * 14
  for (let i = 0; i < 5; i++) {
    const flick = Math.sin(t / 70 + i * 1.7) * 2
    const h = fh + flick
    const x = px0 + 8 + i * 9
    px(ctx, '#e8574a', x, o.floorY - 10 - h, 6, h)
    px(ctx, '#f2c14e', x + 1, o.floorY - 10 - h * 0.6, 4, h * 0.6)
  }
  px(ctx, '#3a3434', px0, o.floorY - 10, pw, 10)
  px(ctx, '#555', px0 + 2, o.floorY - 8, pw - 4, 2)
  px(ctx, '#2f2a2a', px0, py0, pw, 34)
  px(ctx, '#4a4444', px0 + 2, py0 + 2, pw - 4, 4)
  px(ctx, o.liquid, px0 + 3, py0 + 6, pw - 6, 5)
  px(ctx, shade(o.liquid, 0.3), px0 + 6, py0 + 6, 16, 1)
  px(ctx, '#2f2a2a', px0 - 6, py0 + 8, 6, 3)
  px(ctx, '#2f2a2a', px0 + pw, py0 + 8, 6, 3)
  const steam = Math.round(f * 5)
  for (let i = 0; i < steam; i++) {
    const ph = (t / 800 + i * 0.21) % 1
    px(ctx, `rgba(255,255,255,${0.8 - ph * 0.8})`, px0 + 8 + i * 10 + Math.round(Math.sin(t / 250 + i) * 2), py0 - ph * 22, 3, 3)
  }
  if (f > 0.55) {
    for (let i = 0; i < 4; i++) {
      const ph = (t / 260 + i * 0.25) % 1
      px(ctx, 'rgba(255,255,255,0.8)', px0 + 8 + i * 12, py0 + 9 - Math.sin(ph * Math.PI) * 3, 2, 2)
    }
  }
}

function drawStack(o: ToolCtx) {
  const { ctx, r, f, since, fx } = o
  // delivery cart: crates stack up as the amount grows
  const cw = 92
  const cx = Math.round(r.x + r.w / 2 - cw / 2)
  const cy = o.floorY - 16
  px(ctx, 'rgba(40,24,10,0.18)', cx + 3, o.floorY - 2, cw, 4)
  px(ctx, WOOD_DARK, cx, cy, cw, 6)
  px(ctx, WOOD_LIGHT, cx + 1, cy + 1, cw - 2, 3)
  px(ctx, WOOD_DARK, cx + cw, cy - 18, 3, 22)
  px(ctx, WOOD_DARK, cx + cw, cy - 20, 10, 3)
  for (const wx of [cx + 14, cx + cw - 14]) {
    ctx.fillStyle = WOOD_DARK
    ctx.beginPath()
    ctx.arc(wx, cy + 9, 7, 0, TAU)
    ctx.fill()
    ctx.fillStyle = WOOD
    ctx.beginPath()
    ctx.arc(wx, cy + 9, 4.5, 0, TAU)
    ctx.fill()
    px(ctx, WOOD_DARK, wx - 1, cy + 8, 2, 2)
  }
  const cols = 4
  const rows = 4
  const slots = cols * rows
  const exact = f * slots
  const full = Math.floor(exact + 1e-9)
  const part = exact - full
  const bw = 20
  const bh = 14
  const crate = (i: number, fill: number, dy: number) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = cx + 4 + col * (bw + 2)
    const y = cy - (row + 1) * bh + dy
    const h = Math.max(3, Math.round(bh * fill))
    px(ctx, WOOD_DARK, x, y + bh - h, bw, h)
    px(ctx, o.tint, x + 1, y + bh - h + 1, bw - 2, h - 2)
    if (h >= bh - 1) {
      px(ctx, shade(o.tint, 0.25), x + 1, y + 1, bw - 2, 2)
      px(ctx, shade(o.tint, -0.25), x + bw / 2 - 1, y + 3, 2, bh - 5)
    }
  }
  const dropping = fx.dir === 1 && since < 220
  for (let i = 0; i < full; i++) {
    const last = i === full - 1 && part < 0.01
    crate(i, 1, last && dropping ? -Math.round(18 * (1 - since / 220)) : 0)
  }
  if (part > 0.01 && full < slots) crate(full, part, dropping ? -Math.round(18 * (1 - since / 220)) : 0)
  if (fx.dir === -1 && since < 260) {
    const y = cy - (Math.floor(full / cols) + 1) * bh - since / 8
    px(ctx, 'rgba(91,58,30,0.5)', cx + cw - 22, y, bw, bh)
  }
  // chalk tag with the amount
  const tag = { x: Math.round(r.x + r.w - 52), y: Math.round(r.y + 20), w: 46, h: 15 }
  roundRect(ctx, tag, 2, '#3c4a3f', WOOD_DARK, 1)
  text(ctx, fmtAmount(o.v, valueOf(o)), tag.x + tag.w / 2, tag.y + 10.5, { size: 7.5, weight: 800, color: '#f4f1e4', align: 'center', maxW: tag.w - 4 })
}

function drawPump(o: ToolCtx) {
  const { ctx, r, f, since, fx } = o
  const gr = 30
  const gx = Math.round(r.x + r.w / 2 - 14)
  const gy = o.floorY - gr - 6
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(gx, gy, gr + 2, Math.PI, TAU)
  ctx.fill()
  ctx.fillStyle = '#fff8e8'
  ctx.beginPath()
  ctx.arc(gx, gy, gr, Math.PI, TAU)
  ctx.fill()
  px(ctx, WOOD_DARK, gx - gr - 2, gy, gr * 2 + 4, 4)
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI + (k / 8) * Math.PI
    px(ctx, INK_SOFT, gx + Math.cos(a) * (gr - 5) - 0.5, gy + Math.sin(a) * (gr - 5) - 0.5, 1.5, 1.5)
  }
  const a = Math.PI + f * Math.PI
  ctx.strokeStyle = '#e8574a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(gx, gy)
  ctx.lineTo(gx + Math.cos(a) * (gr - 7), gy + Math.sin(a) * (gr - 7))
  ctx.stroke()
  px(ctx, INK, gx - 2, gy - 2, 4, 4)
  text(ctx, fmtAmount(o.v, valueOf(o)), gx, gy + 14, { size: 8, weight: 800, align: 'center' })
  // hand pump
  const pumpX = gx + gr + 14
  const press = fx.dir === 1 && since < 220 ? Math.sin((since / 220) * Math.PI) * 10 : 0
  px(ctx, WOOD_DARK, pumpX, o.floorY - 34, 12, 34)
  px(ctx, '#9aa7ad', pumpX + 1, o.floorY - 33, 10, 32)
  px(ctx, WOOD_DARK, pumpX + 5, o.floorY - 50 + press, 2, 18)
  px(ctx, WOOD_DARK, pumpX - 3, o.floorY - 52 + press, 18, 4)
}

const TOOLS: Record<Verb, (o: ToolCtx) => void> = { pour: drawPour, scoop: drawScoop, steep: drawSteep, heat: drawHeat, stack: drawStack, pump: drawPump }

// --- the result -------------------------------------------------------------------------

function resultTint(m: MixMechanic, liquid: string) {
  const vars = m.params.variables
  let strength = 0
  let n = 0
  let tint = ''
  vars.forEach((v, i) => {
    const verb = m.verbs[i]
    if (verb === 'scoop' || verb === 'steep') {
      strength += fracOf(v, m.values[i])
      n++
      const c = tintFor(v.label)
      if (!tint && verb === 'scoop') tint = c
    }
  })
  const s = n ? strength / n : 0
  if (!n) return liquid
  const dark = tint ? (isPale(tint) ? shade(tint, -0.05) : shade(tint, -0.1)) : shade(liquid, -0.6)
  // weak results are a pale version of the same colour (mixing toward the water colour turns grey)
  const light = tint ? shade(dark, 0.6) : liquid
  return mix(light, dark, Math.min(1, 0.25 + s * 0.9))
}

function isPale(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) > 600
}

function drawResult(ctx: Ctx, m: MixMechanic, r: Rect, t: number, liquid: string) {
  px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
  px(ctx, '#f6e7c4', r.x + 1, r.y + 1, r.w - 2, r.h - 2)
  px(ctx, PARCHMENT_DARK, r.x + 1, r.y + r.h - 14, r.w - 2, 13)
  const vars = m.params.variables
  const verbs = m.verbs
  const cx = r.x + r.w / 2
  const floor = r.y + r.h - 14
  const vessel = verbs.some((v) => v === 'pour' || v === 'steep' || v === 'heat')
  if (vessel) {
    const pours = vars.map((v, i) => (verbs[i] === 'pour' ? fracOf(v, m.values[i]) : -1)).filter((x) => x >= 0)
    const level = pours.length ? pours.reduce((a, b) => a + b, 0) / pours.length : 0.7
    const heat = vars.map((v, i) => (verbs[i] === 'heat' || verbs[i] === 'steep' ? fracOf(v, m.values[i]) : -1)).filter((x) => x >= 0)
    const warm = heat.length ? Math.max(...heat) : 0.4
    const color = resultTint(m, liquid)
    const w = Math.min(48, r.w - 22)
    const h = Math.min(52, r.h - 40)
    const x = Math.round(cx - w / 2 - 3)
    const y = floor - h - 2
    px(ctx, 'rgba(40,24,10,0.18)', x + 2, floor - 2, w + 4, 3)
    px(ctx, WOOD_DARK, x - 1, y - 1, w + 2, h + 2)
    px(ctx, '#fff8e8', x, y, w, h)
    px(ctx, WOOD_DARK, x + w + 1, y + 8, 6, 3)
    px(ctx, WOOD_DARK, x + w + 5, y + 8, 2, h - 20)
    px(ctx, WOOD_DARK, x + w + 1, y + h - 14, 6, 3)
    const lh = Math.round((h - 4) * Math.max(0.06, level))
    px(ctx, color, x + 1, y + h - 1 - lh, w - 2, lh)
    px(ctx, shade(color, 0.3), x + 1, y + h - 1 - lh, w - 2, 2)
    px(ctx, 'rgba(255,255,255,0.65)', x + 3, y + 3, 2, h - 8)
    const steam = Math.round(1 + warm * 3)
    for (let i = 0; i < steam; i++) {
      const ph = (t / 900 + i * 0.29) % 1
      px(ctx, `rgba(255,255,255,${0.85 - ph * 0.85})`, x + 8 + i * 10 + Math.round(Math.sin(t / 260 + i) * 2), y - 3 - ph * 18, 3, 3)
    }
  } else if (verbs.some((v) => v === 'stack')) {
    // everything loaded onto one cart, one stack per item
    const n = vars.length
    const bw = Math.max(6, Math.floor((r.w - 12) / n) - 2)
    vars.forEach((v, i) => {
      const f = fracOf(v, m.values[i])
      const h = Math.round(3 + f * (r.h - 46))
      const x = r.x + 6 + i * (bw + 2)
      const tint = tintFor(v.label)
      for (let y = 0; y < h; y += 7) {
        const hh = Math.min(6, h - y)
        px(ctx, WOOD_DARK, x, floor - 6 - y - hh, bw, hh)
        px(ctx, tint, x + 1, floor - 6 - y - hh + 1, bw - 2, Math.max(1, hh - 2))
      }
    })
    px(ctx, WOOD_DARK, r.x + 3, floor - 6, r.w - 6, 4)
    for (const wx of [r.x + 14, r.x + r.w - 14]) {
      ctx.fillStyle = WOOD_DARK
      ctx.beginPath()
      ctx.arc(wx, floor + 1, 4, 0, TAU)
      ctx.fill()
    }
  } else {
    // a bowl with a layer per ingredient
    const w = r.w - 20
    const x = r.x + 10
    let y = floor - 6
    vars.forEach((v, i) => {
      const h = Math.round(2 + fracOf(v, m.values[i]) * 12)
      px(ctx, tintFor(v.label), x + 4, y - h, w - 8, h)
      y -= h
    })
    px(ctx, WOOD_DARK, x, floor - 8, w, 8)
    px(ctx, WOOD, x + 2, floor - 7, w - 4, 5)
  }
  text(ctx, 'Result', cx, r.y + 10, { size: 6.5, weight: 800, color: INK_SOFT, align: 'center' })
}

// --- panel ------------------------------------------------------------------------------

/** A station's gauge: a thin track filled to the current amount, with a grip you can drag. */
function drawGauge(ctx: Ctx, g: Rect, f: number, active: boolean) {
  px(ctx, WOOD_DARK, g.x - 1, g.y - 1, g.w + 2, g.h + 2)
  px(ctx, PARCHMENT_DARK, g.x, g.y, g.w, g.h)
  const fill = Math.round(g.w * f)
  px(ctx, active ? '#e8a23c' : '#c9a36a', g.x, g.y, fill, g.h)
  px(ctx, active ? '#f6c66a' : '#dcbb85', g.x, g.y, fill, 1)
  const kx = Math.round(g.x + fill)
  px(ctx, WOOD_DARK, kx - 2, g.y - 2, 4, g.h + 4)
  px(ctx, active ? GOLD : '#f6e3bb', kx - 1, g.y - 1, 2, g.h + 2)
}

function selectArrow(ctx: Ctx, x: number, y: number, t: number) {
  const o = Math.round(Math.sin(t / 150))
  px(ctx, GOLD, x + o, y - 3, 2, 7)
  px(ctx, GOLD, x + 2 + o, y - 2, 2, 5)
  px(ctx, GOLD, x + 4 + o, y - 1, 2, 3)
}

/** One-line controls hint built from the tools on this station (overrides a stale level hint). */
export function craftHint(m: MixMechanic): string {
  const verb = VERB_WORDS[m.verbs[m.selected]]
  return `Up/Down pick · hold Right (or the tool) to ${verb.act.toLowerCase()} · Left to ${verb.back.toLowerCase()} · or drag a gauge · Enter: ${m.params.submit_label}`
}

export function drawCraft(ctx: Ctx, e: GameEngine, m: MixMechanic, t: number) {
  const l = m.layout()
  const now = e.levelTime()
  const vars = m.params.variables
  const liquid = shade(e.world.theme.palette.water ?? '#6fb3d9', 0.45)

  // station items (Up/Down), each with its gauge (click or drag to set)
  vars.forEach((v, i) => {
    const r = l.items[i]
    const g = l.gauges[i]
    const sel = i === m.selected
    const fx = m.fx[i]
    const bump = now - fx.at < 140 ? 1 : 0
    e.juice.withScale(ctx, `craft:item:${v.id}`, r.x + r.w / 2, r.y + r.h / 2, () => {
      px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
      px(ctx, sel ? '#fff1c4' : PARCHMENT, r.x + 1, r.y + 1, r.w - 2, r.h - 2)
      if (sel) px(ctx, GOLD, r.x + 1, r.y + 1, 3, r.h - 2)
      const valueY = g.y - 4
      const tight = r.h < 28
      glyph(ctx, m.verbs[i], r.x + 6, Math.round(valueY - (tight ? 11 : 12)), tintFor(v.label))
      text(ctx, v.label, r.x + 22, valueY - (tight ? 8.5 : 10), { size: tight ? 6 : 6.5, weight: 800, color: sel ? INK : INK_SOFT, maxW: r.w - 26 })
      text(ctx, fmtAmount(v, m.values[i]), r.x + 22, valueY - bump, { size: 8.5 + bump, weight: 800, color: sel ? '#7a3f12' : INK, maxW: r.w - 26 })
      drawGauge(ctx, g, fracOf(v, m.values[i]), sel || m.dragging === i)
    })
    if (sel) selectArrow(ctx, r.x - 9, r.y + r.h / 2, t)
  })

  // the selected tool
  const i = m.selected
  const v = vars[i]
  const verb = m.verbs[i]
  const words = VERB_WORDS[verb]
  const st = l.stage
  const tool = l.tool
  px(ctx, WOOD_DARK, st.x, st.y, st.w, tool.h)
  px(ctx, '#f3e2bd', st.x + 1, st.y + 1, st.w - 2, tool.h - 2)
  for (let y = st.y + 12; y < st.y + tool.h - 16; y += 12) px(ctx, 'rgba(154,106,63,0.12)', st.x + 1, y, st.w - 2, 1)
  const floorY = st.y + tool.h - 13
  px(ctx, WOOD, st.x + 1, floorY, st.w - 2, 12)
  px(ctx, WOOD_LIGHT, st.x + 1, floorY, st.w - 2, 2)
  const fx = m.fx[i]
  const since = now - fx.at
  const firstScoop = vars.findIndex((_, k) => m.verbs[k] === 'scoop')
  const toolTint = verb === 'steep' ? (firstScoop >= 0 ? tintFor(vars[firstScoop].label) : shade(liquid, -0.55)) : tintFor(v.label)
  const holding = m.hold && m.hold.index === i
  const pouring = since < ACTIVE_MS || !!holding
  text(ctx, v.label, st.x + 6, st.y + 11, { size: 7.5, weight: 800, maxW: st.w - 60 })
  text(ctx, fmtAmount(v, m.values[i]), st.x + st.w - 6, st.y + 12, { size: 10, weight: 800, align: 'right', color: '#7a3f12' })
  ctx.save()
  ctx.beginPath()
  ctx.rect(st.x + 1, st.y + 15, st.w - 2, tool.h - 16)
  ctx.clip()
  // tools are drawn a little larger than 1:1 so they read at a glance
  const S = 1.12
  ctx.translate(tool.x + tool.w / 2, floorY)
  ctx.scale(S, S)
  const r = { x: -tool.w / (2 * S), y: (tool.y - floorY) / S, w: tool.w / S, h: tool.h / S }
  e.juice.withScale(ctx, `craft:tool:${v.id}`, 0, 0, () =>
    TOOLS[verb]({ ctx, r, v, f: fracOf(v, m.values[i]), fx, since, pouring, t, liquid: verb === 'pour' ? (namedTint(v.label) ?? liquid) : liquid, tint: toolTint, floorY: 0 }),
  )
  ctx.restore()
  text(ctx, `hold ▶ to ${words.act.toLowerCase()}`, st.x + st.w / 2, floorY + 9.5, { size: 6.5, weight: 800, color: '#fff3d6', align: 'center' })
  // take back + action
  button(ctx, l.back, `◀ ${words.back}`, false, '#f6e3bb')
  ;(m.params.ingredients ?? []).forEach((g, k) => {
    button(ctx, l.ingredients[k], g.label, false, '#f6e3bb')
    const n = m.added.filter((a) => a === g.id).length
    if (n) text(ctx, `×${n}`, l.ingredients[k].x + l.ingredients[k].w - 3, l.ingredients[k].y + 7, { size: 6, weight: 800, align: 'right' })
  })
  text(ctx, `${i + 1}/${vars.length}`, st.x + st.w - 4, st.y + st.h - 6, { size: 6.5, weight: 800, color: INK_SOFT, align: 'right' })

  const firstPour = vars.findIndex((_, k) => m.verbs[k] === 'pour')
  drawResult(ctx, m, l.result, t, (firstPour >= 0 ? namedTint(vars[firstPour].label) : null) ?? liquid)
  const pulse = Math.floor(t / 500) % 2 === 0
  button(ctx, l.submit, `${m.params.submit_label} ⏎`, pulse, '#8cc265')
}
