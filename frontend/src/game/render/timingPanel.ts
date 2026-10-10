// Timing minigame: each phase is a physical action (steam the milk, pour into a cup, dip the stems...)
// picked generically from the phase's unit and label, with a Papa's-style meter, a gold sweet zone
// and Cooking-Mama-style reactions. Pure drawing: reads the mechanic, never mutates it.
import type { GameEngine } from '../engine'
import { contentRect } from '../layout'
import { PHASE_BEAT_MS, type Reaction, type Tier, type TimingMechanic } from '../mechanics/timing'
import type { Rect, TimingPhase } from '../types'
import { GOLD, INK, INK_SOFT, PARCHMENT, PARCHMENT_DARK, WOOD_DARK, font, mix, px, roundRect, shade, text, type Ctx } from './pixel'

export type Scene = 'heat' | 'pour' | 'height' | 'dip' | 'steep' | 'rise' | 'clock' | 'dial'

const LENGTH_UNIT = /^(mm|cm|m|in|inch|inches|ft|feet|")$/
const VOLUME_UNIT = /^(ml|l|cl|dl|oz|fl ?oz|cups?|tsp|tbsp|g|kg|shots?)$/
const TIME_UNIT = /^(s|sec|secs|seconds?|ms|min|mins|minutes?|h|hr|hrs|hours?)$/

/** Which physical action a phase looks like, from its unit and label only (never the job). */
export function sceneOf(p: TimingPhase): Scene {
  const u = p.unit.toLowerCase().trim()
  const l = `${p.label} ${p.id}`.toLowerCase().replace(/_/g, ' ')
  if (/°|℃|℉|deg|kelvin/.test(u) || /\b(heat|temp|warm|steam|boil|cook|bake|roast|melt|toast|simmer|fry)/.test(l)) return 'heat'
  if (/\b(dip|immers|dunk|submerg|soak|rinse|plunge|bath)/.test(l)) return 'dip'
  if (LENGTH_UNIT.test(u) || /\b(height|length|depth|distance|cut|trim|lift)/.test(l)) return 'height'
  if (/\b(steep|brew|infus|extract|marinat|bloom)/.test(l)) return 'steep'
  if (/\b(rise|proof|dough|grow|ferment|knead)/.test(l)) return 'rise'
  if (VOLUME_UNIT.test(u) || /full|fill/.test(`${u} ${l}`) || /\b(pour|water|milk|drop|top up|portion|dose|add)/.test(l)) return 'pour'
  if (TIME_UNIT.test(u) || /\b(time|duration|wait|timer)/.test(l)) return 'clock'
  return 'dial'
}

const VERB: Record<Scene, string> = {
  heat: 'heat',
  pour: 'pour',
  height: 'lift',
  dip: 'dip',
  steep: 'steep',
  rise: 'let it rise',
  clock: 'time it',
  dial: 'build it up',
}

function liquidColor(p: TimingPhase, scene: Scene): string {
  const l = `${p.label} ${p.id}`.toLowerCase()
  if (/milk|cream|foam|latte|white/.test(l)) return '#fbf3e1'
  if (/coffee|espresso|tea|brew|cocoa|choc/.test(l)) return '#8a5a3a'
  if (/water|rinse|dip|immers|bath|stem/.test(l) || scene === 'dip') return '#9fd3f0'
  if (/oil|honey|syrup|sauce/.test(l)) return '#e8b04a'
  if (scene === 'heat') return '#fbf3e1'
  return '#e8a86a'
}

const TIER_TEXT: Record<Tier, string> = { perfect: 'Perfect!', great: 'Great!', good: 'Good', miss: 'Miss' }
const TIER_COLOR: Record<Tier, string> = { perfect: GOLD, great: '#9fd36f', good: '#f0b65a', miss: '#f08a6d' }

function dirWords(scene: Scene): [string, string] {
  switch (scene) {
    case 'heat':
      return ['Too cool', 'Too hot']
    case 'pour':
      return ['Too little', 'Too much']
    case 'height':
      return ['Too low', 'Too high']
    case 'dip':
    case 'steep':
    case 'rise':
    case 'clock':
      return ['Too short', 'Too long']
    default:
      return ['Too low', 'Too high']
  }
}

export function reactionWords(r: Reaction): { big: string; small: string } {
  const scene = sceneOf(r.phase)
  if (!r.tier) return { big: 'Done', small: '' }
  const [low, high] = dirWords(scene)
  const side = r.dir < 0 ? low : r.dir > 0 ? high : ''
  if (r.tier === 'miss') return { big: side || 'Miss', small: '' }
  if (r.tier === 'perfect') return { big: 'Perfect!', small: '' }
  return { big: TIER_TEXT[r.tier], small: side ? `a bit ${side.replace(/^Too /, '').toLowerCase()}` : '' }
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const fracOf = (p: TimingPhase, v: number) => clamp01((v - p.min) / (p.max - p.min || 1))

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '-'
  const a = Math.abs(v)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2
  return String(Number(v.toFixed(d)))
}

function outlined(ctx: Ctx, s: string, x: number, y: number, size: number, fill: string, stroke = WOOD_DARK, lw = 3) {
  font(ctx, size, 900)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke
  ctx.lineWidth = lw
  ctx.strokeText(s, x, y)
  ctx.fillStyle = fill
  ctx.fillText(s, x, y)
}

function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.28, y - r * 0.28)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x + r * 0.28, y + r * 0.28)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.28, y + r * 0.28)
  ctx.lineTo(x - r, y)
  ctx.lineTo(x - r * 0.28, y - r * 0.28)
  ctx.closePath()
  ctx.fill()
}

function puff(ctx: Ctx, x: number, y: number, r: number, alpha: number) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.arc(x + r * 0.8, y + r * 0.2, r * 0.75, 0, Math.PI * 2)
  ctx.arc(x - r * 0.7, y + r * 0.3, r * 0.65, 0, Math.PI * 2)
  ctx.fill()
}

// --- the scene ------------------------------------------------------------------

interface SceneState {
  p: TimingPhase
  scene: Scene
  frac: number
  zone: [number, number] | null
  /** The meter is filling right now (held) or the needle is moving. */
  active: boolean
  holding: boolean
  /** 1 while frozen on a finished phase. */
  frozen: boolean
  t: number
}

function counter(ctx: Ctx, r: Rect): number {
  const y = r.y + r.h - 12
  px(ctx, '#a86a3a', r.x, y, r.w, 12)
  px(ctx, '#c98e4f', r.x, y, r.w, 3)
  px(ctx, '#8a5530', r.x, y + 10, r.w, 2)
  for (let x = r.x + 14; x < r.x + r.w; x += 38) px(ctx, '#95603a', x, y + 5, 12, 1)
  return y
}

function shadow(ctx: Ctx, cx: number, y: number, w: number) {
  ctx.fillStyle = 'rgba(40,24,10,0.22)'
  ctx.beginPath()
  ctx.ellipse(cx, y + 1, w / 2, 3, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Shaky hands: grows as the meter nears the top while holding. */
function jitter(s: SceneState, k = 1): number {
  if (!s.holding || s.frac < 0.55) return 0
  return Math.round(Math.sin(s.t / 23) * (s.frac - 0.55) * 4 * k)
}

function mug(ctx: Ctx, cx: number, base: number, w: number, h: number, level: number, liquid: string, zone: [number, number] | null, t: number) {
  shadow(ctx, cx, base, w + 6)
  const x = cx - w / 2
  const y = base - h
  // handle
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(x + w + 2, y + h * 0.45, h * 0.22, -Math.PI / 2, Math.PI / 2)
  ctx.stroke()
  ctx.strokeStyle = '#f4efe6'
  ctx.lineWidth = 3
  ctx.stroke()
  px(ctx, WOOD_DARK, x - 2, y, w + 4, h)
  px(ctx, WOOD_DARK, x, base, w, 2)
  px(ctx, '#f4efe6', x, y, w, h)
  px(ctx, '#d9d1c4', x + w - 6, y, 6, h)
  const innerH = h - 6
  const lh = Math.round(innerH * clamp01(level))
  if (lh > 0) {
    px(ctx, liquid, x + 2, base - 3 - lh, w - 4, lh)
    px(ctx, shade(liquid, 0.35), x + 2, base - 3 - lh, w - 4, 2)
    for (let i = 0; i < 4; i++) {
      const bx = x + 5 + ((i * 13 + Math.floor(t / 90)) % (w - 10))
      px(ctx, shade(liquid, 0.5), bx, base - 3 - lh + 1, 2, 1)
    }
  }
  // Papa's fill line: the gold zone, marked on the cup
  if (zone) {
    const y0 = base - 3 - innerH * zone[1]
    const y1 = base - 3 - innerH * zone[0]
    ctx.fillStyle = 'rgba(242,193,78,0.22)'
    ctx.fillRect(x + 2, y0, w - 4, y1 - y0)
    for (let xx = x + 2; xx < x + w - 2; xx += 6) {
      px(ctx, GOLD, xx, y0, 3, 1)
      px(ctx, GOLD, xx, y1, 3, 1)
    }
  }
  px(ctx, '#ffffff', x + 3, y + 3, 3, h - 10)
  px(ctx, WOOD_DARK, x - 3, y - 2, w + 6, 2)
}

function jug(ctx: Ctx, x: number, y: number, angle: number, body = '#c9ced6') {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = WOOD_DARK
  ctx.fillRect(-14, -16, 28, 30)
  ctx.fillStyle = body
  ctx.fillRect(-12, -14, 24, 26)
  ctx.fillStyle = shade(body, 0.35)
  ctx.fillRect(-10, -14, 4, 26)
  ctx.fillStyle = shade(body, -0.2)
  ctx.fillRect(8, -14, 4, 26)
  // spout
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.moveTo(-14, -16)
  ctx.lineTo(-22, -20)
  ctx.lineTo(-14, -9)
  ctx.closePath()
  ctx.fill()
  // handle
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(15, -1, 7, -Math.PI / 2, Math.PI / 2)
  ctx.stroke()
  ctx.restore()
}

/** Where the spout tip of jug() ends up after rotation. */
function spoutTip(x: number, y: number, angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: x + (-22 * c - -20 * s), y: y + (-22 * s + -20 * c) }
}

function stream(ctx: Ctx, x0: number, y0: number, y1: number, color: string, t: number, w = 3) {
  if (y1 <= y0) return
  px(ctx, color, x0 - w / 2, y0, w, y1 - y0)
  px(ctx, shade(color, 0.4), x0 - w / 2, y0, 1, y1 - y0)
  for (let i = 0; i < 3; i++) {
    const yy = y0 + ((t / 4 + i * 17) % Math.max(1, y1 - y0))
    px(ctx, shade(color, 0.55), x0 - 1, yy, 2, 3)
  }
}

function stopwatchRing(ctx: Ctx, cx: number, cy: number, r: number, frac: number, zone: [number, number] | null, active: boolean, t: number) {
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
  ctx.fill()
  px(ctx, WOOD_DARK, cx - 3, cy - r - 8, 6, 5)
  px(ctx, active ? '#e8574a' : '#b8b0a4', cx - 2, cy - r - 7, 4, 3)
  ctx.fillStyle = '#fffaf0'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  const a0 = -Math.PI / 2
  if (zone) {
    ctx.strokeStyle = 'rgba(242,193,78,0.9)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(cx, cy, r - 2.5, a0 + zone[0] * Math.PI * 2, a0 + zone[1] * Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(232,87,74,0.35)'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, r - 5, a0, a0 + frac * Math.PI * 2)
  ctx.closePath()
  ctx.fill()
  for (let k = 0; k < 12; k++) {
    const a = a0 + (k * Math.PI) / 6
    px(ctx, INK_SOFT, cx + Math.cos(a) * (r - 3) - 0.5, cy + Math.sin(a) * (r - 3) - 0.5, 1, 1)
  }
  const a = a0 + frac * Math.PI * 2
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4))
  ctx.stroke()
  px(ctx, INK, cx - 1, cy - 1, 2, 2)
  if (active) px(ctx, `rgba(232,87,74,${0.5 + 0.5 * Math.sin(t / 120)})`, cx - 1, cy + r - 9, 2, 2)
}

function drawHeat(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.42 + jitter(s)
  const w0 = 46
  const w1 = 38
  const h = 50
  shadow(ctx, cx, base, w0 + 6)
  const glow = clamp01((s.frac - 0.5) * 2)
  const steel = mix('#c9ced6', '#f0a27a', glow * 0.55)
  // pitcher body (trapezoid)
  const trap = (inset: number, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(cx - w0 / 2 + inset, base - inset)
    ctx.lineTo(cx + w0 / 2 - inset, base - inset)
    ctx.lineTo(cx + w1 / 2 - inset, base - h + inset)
    ctx.lineTo(cx - w1 / 2 + inset, base - h + inset)
    ctx.closePath()
    ctx.fill()
  }
  trap(0, WOOD_DARK)
  trap(2, steel)
  px(ctx, shade(steel, 0.45), cx - w0 / 2 + 6, base - h + 6, 4, h - 10)
  px(ctx, shade(steel, -0.18), cx + w1 / 2 - 8, base - h + 4, 4, h - 8)
  // spout and handle
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.moveTo(cx - w1 / 2, base - h)
  ctx.lineTo(cx - w1 / 2 - 10, base - h - 5)
  ctx.lineTo(cx - w1 / 2 + 2, base - h + 8)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx + w0 / 2 + 2, base - h / 2, 11, -Math.PI / 2, Math.PI / 2)
  ctx.stroke()
  // milk surface, swirling while steamed
  const milk = liquidColor(s.p, 'heat')
  px(ctx, milk, cx - w1 / 2 + 3, base - h + 2, w1 - 6, 4)
  if (s.active) {
    const sw = Math.floor(s.t / 60) % 6
    px(ctx, shade(milk, -0.08), cx - 10 + sw * 3, base - h + 3, 5, 1)
  }
  // steam wand from the machine above
  const wx = cx + 6
  px(ctx, '#6f747c', r.x + r.w * 0.42 + 30, r.y, 22, 8)
  ctx.strokeStyle = '#4d5157'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(r.x + r.w * 0.42 + 38, r.y + 6)
  ctx.lineTo(wx, base - h + 14)
  ctx.stroke()
  // steam puffs: more and bigger as it heats
  const n = s.active || s.frozen ? 2 + Math.floor(s.frac * 7) : 1
  for (let i = 0; i < n; i++) {
    const ph = ((s.t / (520 - s.frac * 200) + i / n) % 1)
    const px0 = cx - 16 + ((i * 37) % 30) + Math.sin(s.t / 300 + i) * 4
    puff(ctx, px0, base - h - 4 - ph * 34, 2.5 + ph * (3 + s.frac * 4), (1 - ph) * (0.55 + s.frac * 0.4))
  }
  // too hot: bubbling and a hiss
  if (s.frac > 0.8 && (s.active || s.frozen)) {
    for (let i = 0; i < 4; i++) {
      const bx = cx - w1 / 2 + 6 + ((i * 9 + Math.floor(s.t / 70)) % (w1 - 12))
      px(ctx, '#ffffff', bx, base - h + 1 - ((s.t / 50 + i * 3) % 4), 2, 2)
    }
  }
}

function drawPour(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.5
  const liquid = liquidColor(s.p, 'pour')
  const mw = 62
  const mh = 58
  mug(ctx, cx, base, mw, mh, s.frac, liquid, s.zone, s.t)
  const flowing = s.active
  const angle = flowing ? -0.95 : -0.35
  const jx = cx - mw / 2 + 8 + jitter(s)
  const jy = r.y + 18
  const tip = spoutTip(jx, jy, angle)
  if (flowing) stream(ctx, tip.x, tip.y, base - 3 - (mh - 6) * s.frac, liquid, s.t)
  jug(ctx, jx, jy, angle, mix('#c9ced6', liquid, 0.25))
}

function drawHeight(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const pourish = /pour|drop|stream|height/.test(`${s.p.label} ${s.p.id}`.toLowerCase())
  // ruler
  const rx = r.x + 18
  const top = r.y + 4
  const bottom = base - 2
  px(ctx, WOOD_DARK, rx - 1, top - 1, 12, bottom - top + 2)
  px(ctx, '#f6e3a0', rx, top, 10, bottom - top)
  const span = bottom - top - 40
  if (s.zone) {
    const y0 = bottom - 34 - span * s.zone[1]
    const y1 = bottom - 34 - span * s.zone[0]
    px(ctx, 'rgba(242,193,78,0.85)', rx, y0, 10, y1 - y0)
  }
  for (let k = 0; k <= 10; k++) px(ctx, INK_SOFT, rx, bottom - 34 - (span * k) / 10, k % 5 ? 4 : 7, 1)
  const cx = r.x + r.w * 0.55
  const hy = bottom - 34 - span * s.frac + jitter(s)
  if (pourish) {
    const liquid = liquidColor(s.p, 'pour')
    mug(ctx, cx, base, 48, 30, 0.5, '#8a5a3a', null, s.t)
    const jx = cx - 6
    const tip = spoutTip(jx, hy, -0.9)
    stream(ctx, tip.x, tip.y, base - 30, '#fbf3e1', s.t, s.frac > 0.7 ? 2 : 3)
    jug(ctx, jx, hy, -0.9, mix('#c9ced6', liquid, 0.2))
    if (s.frac > 0.65) {
      for (let i = 0; i < 4; i++) {
        const a = (s.t / 90 + i * 1.7) % (Math.PI * 2)
        px(ctx, '#fbf3e1', tip.x + Math.cos(a) * 8 * s.frac, base - 32 - Math.abs(Math.sin(a)) * 6 * s.frac, 2, 2)
      }
    }
  } else {
    // a marker line held at the chosen height over a block
    px(ctx, 'rgba(40,24,10,0.2)', cx - 30, base - 3, 60, 3)
    px(ctx, WOOD_DARK, cx - 26, hy - 2, 52, 5)
    px(ctx, '#e8574a', cx - 25, hy - 1, 50, 3)
    px(ctx, 'rgba(232,87,74,0.25)', rx + 10, hy, cx - 26 - rx - 10, 1)
    px(ctx, '#b97a43', cx - 4, hy + 3, 8, base - hy - 3)
  }
  // pointer on the ruler
  px(ctx, WOOD_DARK, rx + 11, hy - 3, 4, 7)
  px(ctx, GOLD, rx + 12, hy - 2, 2, 5)
}

function drawDip(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.4
  const jw = 44
  const jh = 46
  const water = liquidColor(s.p, 'dip')
  shadow(ctx, cx, base, jw + 6)
  // depth: held = stems in the jar; a moving needle bobs them in and out
  const depth = s.p.mode === 'hold' ? (s.holding || s.frozen ? 1 : 0) : s.frac
  const stemBottom = base - jh - 18 + depth * (jh + 8) + jitter(s, 0.5)
  // stems behind the front glass
  for (let i = 0; i < 4; i++) {
    const sx = cx - 9 + i * 6
    const top = stemBottom - 54 - (i % 2) * 6
    px(ctx, '#4f8f3a', sx, top, 2, stemBottom - top)
    const petal = ['#f28fb0', '#f6d36b', '#f28fb0', '#c89cf2'][i]
    px(ctx, WOOD_DARK, sx - 4, top - 7, 10, 8)
    px(ctx, petal, sx - 3, top - 6, 8, 6)
    px(ctx, '#ffffff', sx - 1, top - 5, 2, 2)
    px(ctx, '#3f7a2e', sx + 2, top + 16, 5, 3)
  }
  // jar
  px(ctx, WOOD_DARK, cx - jw / 2 - 1, base - jh, jw + 2, jh)
  ctx.fillStyle = 'rgba(220,240,250,0.55)'
  ctx.fillRect(cx - jw / 2 + 1, base - jh + 1, jw - 2, jh - 2)
  const wl = base - jh * 0.75
  ctx.fillStyle = water
  ctx.globalAlpha = 0.75
  ctx.fillRect(cx - jw / 2 + 1, wl, jw - 2, base - wl - 1)
  ctx.globalAlpha = 1
  px(ctx, shade(water, 0.4), cx - jw / 2 + 1, wl, jw - 2, 2)
  px(ctx, '#ffffff', cx - jw / 2 + 4, base - jh + 4, 3, jh - 10)
  px(ctx, WOOD_DARK, cx - jw / 2 - 3, base - jh - 2, jw + 6, 3)
  if (depth > 0.5 && stemBottom > wl) {
    for (let i = 0; i < 5; i++) {
      const by = stemBottom - ((s.t / 20 + i * 9) % Math.max(4, stemBottom - wl))
      px(ctx, '#ffffff', cx - 8 + ((i * 7) % 18), by, 2, 2)
    }
  }
  stopwatchRing(ctx, r.x + r.w * 0.8, r.y + 30, 20, s.frac, s.zone, s.active, s.t)
}

function drawSteep(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.4
  const gw = 40
  const gh = 58
  shadow(ctx, cx, base, gw + 6)
  px(ctx, WOOD_DARK, cx - gw / 2 - 1, base - gh, gw + 2, gh)
  ctx.fillStyle = 'rgba(230,244,250,0.6)'
  ctx.fillRect(cx - gw / 2 + 1, base - gh + 1, gw - 2, gh - 2)
  const liquid = mix('#f6e7b8', '#5a3218', s.frac)
  px(ctx, liquid, cx - gw / 2 + 1, base - gh + 10, gw - 2, gh - 11)
  // swirling leaves / grounds
  for (let i = 0; i < 7; i++) {
    const a = s.t / (s.active ? 260 : 900) + i * 0.9
    const lx = cx + Math.cos(a) * (8 + (i % 3) * 4)
    const ly = base - gh / 2 + Math.sin(a * 1.3) * 12
    px(ctx, mix('#6b8f3a', '#3a2412', s.frac), lx, ly, 3, 2)
  }
  px(ctx, '#ffffff', cx - gw / 2 + 4, base - gh + 4, 3, gh - 10)
  px(ctx, WOOD_DARK, cx - gw / 2 - 3, base - gh - 2, gw + 6, 3)
  if (s.active) for (let i = 0; i < 2; i++) puff(ctx, cx - 6 + i * 12, base - gh - 6 - ((s.t / 30 + i * 20) % 18), 2.5, 0.5)
  stopwatchRing(ctx, r.x + r.w * 0.8, r.y + 30, 20, s.frac, s.zone, s.active, s.t)
}

function drawRise(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.4
  const bw = 66
  shadow(ctx, cx, base, bw + 4)
  const dh = 8 + s.frac * 40 + (s.active ? Math.sin(s.t / 200) : 0)
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.ellipse(cx, base - 18, bw / 2 - 4 + s.frac * 4, dh + 1, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#f6dfb0'
  ctx.beginPath()
  ctx.ellipse(cx, base - 18, bw / 2 - 5 + s.frac * 4, dh, 0, Math.PI, 0)
  ctx.fill()
  px(ctx, '#fff3d6', cx - 14, base - 18 - dh + 4, 10, 3)
  // bowl
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.moveTo(cx - bw / 2 - 2, base - 20)
  ctx.lineTo(cx + bw / 2 + 2, base - 20)
  ctx.lineTo(cx + bw / 2 - 10, base)
  ctx.lineTo(cx - bw / 2 + 10, base)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#7fb3d9'
  ctx.beginPath()
  ctx.moveTo(cx - bw / 2, base - 18)
  ctx.lineTo(cx + bw / 2, base - 18)
  ctx.lineTo(cx + bw / 2 - 11, base - 2)
  ctx.lineTo(cx - bw / 2 + 11, base - 2)
  ctx.closePath()
  ctx.fill()
  px(ctx, '#a9d0ec', cx - bw / 2 + 4, base - 16, bw - 8, 2)
  stopwatchRing(ctx, r.x + r.w * 0.8, r.y + 30, 20, s.frac, s.zone, s.active, s.t)
}

function drawClock(ctx: Ctx, r: Rect, s: SceneState) {
  counter(ctx, r)
  stopwatchRing(ctx, r.x + r.w * 0.45, r.y + r.h / 2 - 4, 36, s.frac, s.zone, s.active, s.t)
}

function drawDial(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.45
  const cy = base - 14
  const R = 52
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(cx, cy, R + 3, Math.PI, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fffaf0'
  ctx.beginPath()
  ctx.arc(cx, cy, R, Math.PI, 0)
  ctx.closePath()
  ctx.fill()
  const ang = (f: number) => Math.PI + f * Math.PI
  if (s.zone) {
    ctx.strokeStyle = 'rgba(242,193,78,0.95)'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(cx, cy, R - 6, ang(s.zone[0]), ang(s.zone[1]))
    ctx.stroke()
  }
  for (let k = 0; k <= 10; k++) {
    const a = ang(k / 10)
    ctx.strokeStyle = INK_SOFT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2))
    ctx.lineTo(cx + Math.cos(a) * (R - (k % 5 ? 6 : 10)), cy + Math.sin(a) * (R - (k % 5 ? 6 : 10)))
    ctx.stroke()
  }
  const a = ang(s.frac) + (s.holding && s.frac > 0.6 ? Math.sin(s.t / 20) * 0.03 : 0)
  ctx.strokeStyle = '#c0392b'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8))
  ctx.stroke()
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fill()
}

const SCENES: Record<Scene, (ctx: Ctx, r: Rect, s: SceneState) => void> = {
  heat: drawHeat,
  pour: drawPour,
  height: drawHeight,
  dip: drawDip,
  steep: drawSteep,
  rise: drawRise,
  clock: drawClock,
  dial: drawDial,
}

// --- the meter --------------------------------------------------------------------

function drawMeter(ctx: Ctx, r: Rect, s: SceneState) {
  const inZone = !!s.zone && s.frac >= s.zone[0] && s.frac <= s.zone[1]
  const shake = jitter(s, 0.6)
  const x = r.x + shake
  const thermo = s.scene === 'heat'
  const bulbR = thermo ? 9 : 0
  const tubeTop = r.y
  const tubeBottom = r.y + r.h - (thermo ? bulbR * 2 - 2 : 0)
  const th = tubeBottom - tubeTop
  // frame
  px(ctx, 'rgba(40,24,10,0.25)', x + 2, tubeTop + 3, r.w, th)
  px(ctx, WOOD_DARK, x - 2, tubeTop - 2, r.w + 4, th + 4)
  px(ctx, thermo ? '#ffffff' : PARCHMENT_DARK, x, tubeTop, r.w, th)
  // sweet zone
  if (s.zone) {
    const y0 = tubeBottom - th * s.zone[1]
    const y1 = tubeBottom - th * s.zone[0]
    const pulse = inZone ? 0.75 + 0.25 * Math.sin(s.t / 80) : 0.45
    ctx.fillStyle = `rgba(242,193,78,${pulse})`
    ctx.fillRect(x, y0, r.w, y1 - y0)
    px(ctx, WOOD_DARK, x - 6, y0, 4, 1)
    px(ctx, WOOD_DARK, x - 6, y1 - 1, 4, 1)
    px(ctx, WOOD_DARK, x - 6, y0, 1, y1 - y0)
    px(ctx, WOOD_DARK, x + r.w + 2, y0, 4, 1)
    px(ctx, WOOD_DARK, x + r.w + 2, y1 - 1, 4, 1)
    px(ctx, WOOD_DARK, x + r.w + 5, y0, 1, y1 - y0)
  }
  // fill column
  const fillColor = thermo ? mix('#f08a5d', '#d63a2a', s.frac) : s.scene === 'pour' || s.scene === 'dip' ? liquidColor(s.p, s.scene) : '#e8a23c'
  const fh = Math.round(th * s.frac)
  const cw = thermo ? 6 : r.w - 6
  const cx = x + (r.w - cw) / 2
  px(ctx, fillColor, cx, tubeBottom - fh, cw, fh)
  px(ctx, shade(fillColor, 0.35), cx, tubeBottom - fh, 2, fh)
  if (fh > 0) px(ctx, shade(fillColor, -0.25), cx, tubeBottom - fh, cw, 1)
  for (let k = 1; k < 10; k++) px(ctx, 'rgba(74,52,36,0.45)', x, tubeBottom - (th * k) / 10, k === 5 ? 6 : 3, 1)
  if (thermo) {
    ctx.fillStyle = WOOD_DARK
    ctx.beginPath()
    ctx.arc(x + r.w / 2, r.y + r.h - bulbR, bulbR + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = fillColor
    ctx.beginPath()
    ctx.arc(x + r.w / 2, r.y + r.h - bulbR, bulbR, 0, Math.PI * 2)
    ctx.fill()
    px(ctx, fillColor, cx, tubeBottom - 2, cw, 4)
    px(ctx, '#ffffff', x + r.w / 2 - 4, r.y + r.h - bulbR - 4, 3, 3)
  }
  // the marker: where you are now
  const my = tubeBottom - th * s.frac
  px(ctx, WOOD_DARK, x + r.w + 1, my - 4, 3, 9)
  px(ctx, WOOD_DARK, x + r.w + 4, my - 3, 2, 7)
  px(ctx, WOOD_DARK, x + r.w + 6, my - 1, 2, 3)
  // over the top: red warning flash while holding
  if (s.holding && s.frac > 0.9 && Math.floor(s.t / 90) % 2 === 0) {
    ctx.strokeStyle = '#e8574a'
    ctx.lineWidth = 2
    ctx.strokeRect(x - 3, tubeTop - 3, r.w + 6, th + 6)
  } else if (inZone && (s.active || s.frozen)) {
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.5
    ctx.strokeRect(x - 3.5, tubeTop - 3.5, r.w + 7, th + 7)
    sparkle(ctx, x + r.w + 9, my - 8 + Math.sin(s.t / 120) * 2, 3, '#fff6c8')
  }
}

// --- controls hint ------------------------------------------------------------------

function keycap(ctx: Ctx, x: number, y: number, w: number, label: string, down: boolean) {
  const o = down ? 1 : 0
  px(ctx, WOOD_DARK, x, y, w, 13)
  px(ctx, down ? '#e9d2a6' : '#fff8e8', x + 1, y + 1 + o, w - 2, 10 - o)
  if (!down) px(ctx, '#d9c39a', x + 1, y + 10, w - 2, 2)
  text(ctx, label, x + w / 2, y + 9 + o, { size: 6.5, weight: 900, align: 'center' })
}

function mouseIcon(ctx: Ctx, x: number, y: number, down: boolean) {
  roundRect(ctx, { x, y, w: 9, h: 13 }, 4, '#fff8e8', WOOD_DARK, 1)
  px(ctx, down ? '#e8574a' : '#d9c39a', x + 1.5, y + 1.5, 3, 4)
  px(ctx, WOOD_DARK, x + 4.5, y + 1, 0.8, 5)
}

// --- the panel ------------------------------------------------------------------

function sceneRect(stage: Rect): Rect {
  return { x: stage.x + 2, y: stage.y + 2, w: stage.w - 132, h: stage.h - 4 }
}

function meterRect(stage: Rect): Rect {
  return { x: stage.x + stage.w - 118, y: stage.y + 8, w: 18, h: stage.h - 16 }
}

function reactionPop(ctx: Ctx, r: Rect, rec: Reaction, age: number) {
  if (!rec.tier) return
  const { big, small } = reactionWords(rec)
  const k = Math.min(1, age / 140)
  const bounce = k < 1 ? 0.4 + 0.75 * k : 1 + Math.max(0, 0.12 - (age - 140) / 1500)
  const cx = r.x + r.w / 2
  const cy = r.y + 30
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(bounce, bounce)
  outlined(ctx, big, 0, 0, rec.tier === 'perfect' ? 22 : 18, TIER_COLOR[rec.tier], WOOD_DARK, 4)
  if (small) outlined(ctx, small, 0, 13, 9, '#fff8e8', WOOD_DARK, 3)
  ctx.restore()
  if (rec.tier === 'perfect' || rec.tier === 'great') {
    const n = rec.tier === 'perfect' ? 10 : 5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3
      const d = 14 + age * 0.07
      const alpha = Math.max(0, 1 - age / PHASE_BEAT_MS)
      sparkle(ctx, cx + Math.cos(a) * d * 1.8, cy - 6 + Math.sin(a) * d, 2 + (i % 3), `rgba(255,236,150,${alpha})`)
    }
  }
}

export function drawTiming(ctx: Ctx, e: GameEngine, m: TimingMechanic) {
  const c = contentRect(e.W, e.H)
  const stage = m.meterRect()
  const n = m.params.phases.length
  const lt = m.now()
  const pause = m.pauseLeft()
  // while paused, stay on the phase that just ended so its reaction reads in place
  const frozen = pause > 0 && !!m.last
  const p = frozen ? m.last!.phase : m.phase
  if (!p) return
  const shown = frozen ? m.params.phases.indexOf(p) : m.index

  // header row: pips + step label
  for (let i = 0; i < n; i++) {
    const rec = m.reactions[m.params.phases[i].id]
    px(ctx, WOOD_DARK, c.x + 2 + i * 13, c.y + 3, 10, 10)
    px(ctx, rec?.tier ? TIER_COLOR[rec.tier] : i === shown ? '#fff1c4' : PARCHMENT_DARK, c.x + 3 + i * 13, c.y + 4, 8, 8)
    if (rec?.tier === 'perfect') sparkle(ctx, c.x + 7 + i * 13, c.y + 8, 3, '#ffffff')
  }
  const lx = c.x + 6 + n * 13
  text(ctx, n > 1 ? `${shown + 1}/${n}  ${p.label}` : p.label, lx, c.y + 12, { size: 10, weight: 900, maxW: c.w - (lx - c.x) - 4 })
  const scene = sceneOf(p)
  const verb = VERB[scene]
  const instr = p.mode === 'hold' ? `Hold to ${verb}, let go in the gold zone` : 'Press when it is in the gold zone'
  text(ctx, instr, c.x + 2, c.y + 23, { size: 7.5, weight: 800, color: INK_SOFT, maxW: c.w - 4 })

  // stage
  roundRect(ctx, stage, 4, '#f8e6bd', shade(PARCHMENT, -0.18), 1)
  const value = frozen ? m.last!.value : m.value()
  const frac = fracOf(p, value)
  const zone0 = m.zone(p)
  const zone: [number, number] | null = zone0 ? [fracOf(p, zone0[0]), fracOf(p, zone0[1])] : null
  const holding = !frozen && m.holding
  const s: SceneState = {
    p,
    scene,
    frac,
    zone,
    active: !frozen && (p.mode === 'stop' ? !m.done : m.holding),
    holding,
    frozen,
    t: lt,
  }
  const sr = sceneRect(stage)
  ctx.save()
  ctx.beginPath()
  ctx.rect(sr.x, sr.y, sr.w, sr.h)
  ctx.clip()
  SCENES[scene](ctx, sr, s)
  ctx.restore()
  drawMeter(ctx, meterRect(stage), s)

  // right column: live value, then the big verb with keys
  const colX = stage.x + stage.w - 88
  const colW = 84
  const mid = colX + colW / 2
  text(ctx, fmt(value), mid, stage.y + 26, { size: 18, weight: 900, align: 'center', color: frozen && m.last?.tier ? shade(TIER_COLOR[m.last.tier], -0.35) : INK, maxW: colW })
  text(ctx, p.unit, mid, stage.y + 37, { size: 7.5, weight: 800, align: 'center', color: INK_SOFT, maxW: colW })
  text(ctx, `${fmt(p.min)} to ${fmt(p.max)}`, mid, stage.y + 47, { size: 6.5, weight: 700, align: 'center', color: INK_SOFT, maxW: colW })
  if (!frozen && !m.done) {
    const big = p.mode === 'hold' ? (m.holding ? 'Let go!' : 'HOLD') : 'PRESS'
    const pulse = p.mode === 'hold' && m.holding ? 1 + 0.06 * Math.sin(lt / 70) : 1 + 0.04 * Math.sin(lt / 160)
    ctx.save()
    ctx.translate(mid, stage.y + 68)
    ctx.scale(pulse, pulse)
    outlined(ctx, big, 0, 0, 13, m.holding ? '#fff1c4' : '#ffffff', WOOD_DARK, 3)
    ctx.restore()
    const down = m.holding
    keycap(ctx, colX + 4, stage.y + 76, 34, 'SPACE', down)
    keycap(ctx, colX + 42, stage.y + 76, 14, '▲', down)
    mouseIcon(ctx, colX + 62, stage.y + 76, down)
  }

  if (frozen && m.last) reactionPop(ctx, sr, m.last, PHASE_BEAT_MS - pause)

  // finished phases
  m.params.phases.forEach((ph, i) => {
    const rec = m.reactions[ph.id]
    const w = Math.floor((c.w - (n - 1) * 4) / n)
    const r = { x: c.x + i * (w + 4), y: c.y + c.h - 18, w, h: 16 }
    if (!rec) {
      roundRect(ctx, r, 3, 'rgba(0,0,0,0.04)', shade(PARCHMENT, -0.15))
      text(ctx, ph.label, r.x + 6, r.y + 11, { size: 6.5, weight: 700, color: INK_SOFT, maxW: w - 10 })
      return
    }
    const col = rec.tier ? TIER_COLOR[rec.tier] : '#e6f2d6'
    roundRect(ctx, r, 3, mix(col, '#ffffff', 0.55), WOOD_DARK)
    const mark = rec.tier === 'perfect' ? '★' : rec.tier === 'miss' ? '✗' : '✓'
    const label = `${mark} ${ph.label} ${fmt(rec.value)} ${ph.unit}`.trim()
    text(ctx, label, r.x + 5, r.y + 11, { size: 7, weight: 800, maxW: w - 8 })
  })
}
