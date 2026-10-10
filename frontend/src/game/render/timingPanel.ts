// Timing minigame: each phase is a physical action (heat, pour, dip, bake, puff...) picked generically
// from the phase's unit and label (and the level's own words for what is being handled), a meter that
// fills or sweeps, and a reaction after every stop. It never marks where the good value is: the player
// learns that from the reactions. Pure drawing: reads the mechanic, never mutates it.
import type { GameEngine } from '../engine'
import { contentRect } from '../layout'
import { PHASE_BEAT_MS, type Reaction, type TimingMechanic } from '../mechanics/timing'
import type { Rect, TimingPhase } from '../types'
import { drawFace, type Tier } from './juice'
import { sceneOf, TIME_UNIT, type Scene } from './timingScene'
import { GOLD, INK, INK_SOFT, PARCHMENT, PARCHMENT_DARK, WOOD_DARK, font, mix, px, roundRect, shade, text, type Ctx } from './pixel'

const VERB: Record<Scene, string> = {
  heat: 'heat',
  oven: 'bake',
  pour: 'pour',
  height: 'lift',
  dip: 'dip',
  steep: 'steep',
  rise: 'let it rise',
  puff: 'puff',
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

// juice tiers: 0 way off, 1 close, 2 great, 3 perfect
const TIER_TEXT = ['Way off', 'Close', 'Great!', 'Perfect!']
const TIER_COLOR = ['#f08a6d', '#f0b65a', '#9fd36f', GOLD]

function dirWords(scene: Scene): [string, string] {
  switch (scene) {
    case 'heat':
      return ['Too cool', 'Too hot']
    case 'oven':
      return ['Too short', 'Too long']
    case 'puff':
      return ['Too little', 'Too much']
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

export function reactionWords(r: Reaction, scene: Scene): { big: string; small: string } {
  if (r.tier === null) return { big: 'Done', small: '' }
  const [low, high] = dirWords(scene)
  const side = r.dir < 0 ? low : r.dir > 0 ? high : ''
  if (r.tier === 0) return { big: side || TIER_TEXT[0], small: '' }
  if (r.tier === 3) return { big: TIER_TEXT[3], small: '' }
  return { big: TIER_TEXT[r.tier], small: side ? `a bit ${side.toLowerCase()}` : '' }
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


function cloud(ctx: Ctx, x: number, y: number, r: number, alpha: number, rgb = '255,255,255') {
  ctx.fillStyle = `rgba(${rgb},${alpha})`
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
  /** The meter is filling right now (held) or the needle is moving. */
  active: boolean
  holding: boolean
  /** Resting on a finished phase during the beat after it. */
  frozen: boolean
  t: number
  /** The level's own words (title, aim, station), lower case: what is being handled. */
  context: string
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

const isTime = (p: TimingPhase) => TIME_UNIT.test(p.unit.toLowerCase().trim())

function mug(ctx: Ctx, cx: number, base: number, w: number, h: number, level: number, liquid: string, t: number) {
  shadow(ctx, cx, base, w + 6)
  const x = cx - w / 2
  const y = base - h
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
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.moveTo(-14, -16)
  ctx.lineTo(-22, -20)
  ctx.lineTo(-14, -9)
  ctx.closePath()
  ctx.fill()
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

function stopwatchRing(ctx: Ctx, cx: number, cy: number, r: number, frac: number, active: boolean, t: number) {
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

/** Burner flames: taller and bluer at the core the hotter it runs. */
function flames(ctx: Ctx, cx: number, y: number, w: number, power: number, t: number) {
  if (power <= 0) return
  for (let i = 0; i < 7; i++) {
    const fx = cx - w / 2 + 3 + (i * (w - 6)) / 6
    const fh = (3 + power * 7) * (0.75 + 0.25 * Math.sin(t / 70 + i * 1.7))
    px(ctx, '#f08a3c', fx - 1.5, y - fh, 3, fh)
    px(ctx, '#ffd36b', fx - 0.5, y - fh * 0.6, 1, fh * 0.6)
    if (power > 0.5) px(ctx, '#7fb3ff', fx - 0.5, y - 2, 1, 2)
  }
}

function drawHeat(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.42
  // stove top
  px(ctx, WOOD_DARK, cx - 36, base - 8, 72, 8)
  px(ctx, '#4d5157', cx - 35, base - 7, 70, 6)
  px(ctx, '#6f747c', cx - 35, base - 7, 70, 1)
  const on = s.active || s.frozen
  flames(ctx, cx, base - 8, 44, on ? 0.35 + s.frac * 0.65 : 0, s.t)
  // pot
  const pb = base - 14 + jitter(s, 0.5)
  const w = 52
  const h = 36
  px(ctx, WOOD_DARK, cx - w / 2 - 1, pb - h, w + 2, h + 1)
  const glow = clamp01((s.frac - 0.5) * 2)
  const steel = mix('#c9ced6', '#f0a27a', glow * 0.5)
  px(ctx, steel, cx - w / 2 + 1, pb - h + 1, w - 2, h - 1)
  px(ctx, shade(steel, 0.45), cx - w / 2 + 4, pb - h + 4, 4, h - 8)
  px(ctx, shade(steel, -0.18), cx + w / 2 - 8, pb - h + 2, 5, h - 4)
  // handles
  px(ctx, WOOD_DARK, cx - w / 2 - 9, pb - h + 6, 9, 4)
  px(ctx, WOOD_DARK, cx + w / 2, pb - h + 6, 9, 4)
  // liquid surface
  const liquid = liquidColor(s.p, 'heat')
  px(ctx, WOOD_DARK, cx - w / 2 - 2, pb - h - 2, w + 4, 3)
  px(ctx, liquid, cx - w / 2 + 2, pb - h + 1, w - 4, 4)
  if (on) {
    const sw = Math.floor(s.t / 60) % 8
    px(ctx, shade(liquid, -0.08), cx - 14 + sw * 3, pb - h + 2, 6, 1)
  }
  // steam: more and bigger as it heats
  const n = on ? 1 + Math.floor(s.frac * 7) : 0
  for (let i = 0; i < n; i++) {
    const ph = (s.t / (560 - s.frac * 220) + i / n) % 1
    const x0 = cx - 18 + ((i * 37) % 34) + Math.sin(s.t / 300 + i) * 4
    cloud(ctx, x0, pb - h - 6 - ph * 30, 2.5 + ph * (3 + s.frac * 4), (1 - ph) * (0.5 + s.frac * 0.45))
  }
  // near the top of the meter: rolling bubbles
  if (s.frac > 0.8 && on) {
    for (let i = 0; i < 5; i++) {
      const bx = cx - w / 2 + 6 + ((i * 9 + Math.floor(s.t / 70)) % (w - 12))
      px(ctx, '#ffffff', bx, pb - h - ((s.t / 50 + i * 3) % 4), 2, 2)
    }
  }
}

function drawOven(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const ow = 96
  const oh = 66
  const cx = r.x + (isTime(s.p) ? r.w * 0.38 : r.w * 0.5)
  const x = cx - ow / 2
  const y = base - oh
  const on = s.active || s.frozen
  // brick body
  px(ctx, WOOD_DARK, x - 2, y - 2, ow + 4, oh + 2)
  px(ctx, '#b5653f', x, y, ow, oh)
  for (let row = 0; row * 7 < oh; row++) {
    px(ctx, '#9a5233', x, y + row * 7 + 6, ow, 1)
    for (let bx = (row % 2) * 8; bx < ow; bx += 16) px(ctx, '#9a5233', x + bx, y + row * 7, 1, 6)
  }
  px(ctx, '#c97a52', x, y, ow, 2)
  // door window
  const wx = x + 12
  const wy = y + 12
  const ww = ow - 24
  const wh = oh - 26
  px(ctx, WOOD_DARK, wx - 2, wy - 2, ww + 4, wh + 4)
  px(ctx, '#3a2418', wx, wy, ww, wh)
  const heat = on ? 0.35 + 0.35 * clamp01(s.frac * 1.2) + 0.05 * Math.sin(s.t / 160) : 0.12
  ctx.fillStyle = `rgba(255,150,60,${heat})`
  ctx.fillRect(wx, wy, ww, wh)
  // heating element
  px(ctx, on ? mix('#a0412a', '#ff7a3c', 0.5 + 0.5 * Math.sin(s.t / 200)) : '#6b3a26', wx + 4, wy + wh - 4, ww - 8, 2)
  // the loaf: springs up then browns
  const lx = wx + ww / 2
  const ly = wy + wh - 6
  const spring = 1 + 0.25 * clamp01(s.frac * 1.6)
  const crust = mix('#f3dca6', '#7a3e1c', clamp01(s.frac))
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.ellipse(lx, ly, 22, 9 * spring + 1, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = crust
  ctx.beginPath()
  ctx.ellipse(lx, ly, 21, 9 * spring, 0, Math.PI, 0)
  ctx.fill()
  px(ctx, shade(crust, 0.25), lx - 10, ly - 9 * spring + 3, 8, 2)
  px(ctx, shade(crust, -0.3), lx - 4, ly - 9 * spring + 2, 10, 1)
  // steam inside when the step is about steam
  if (on && /steam|vapou?r|humid/.test(`${s.p.label} ${s.p.id}`.toLowerCase())) {
    for (let i = 0; i < 4; i++) {
      const ph = (s.t / 700 + i / 4) % 1
      cloud(ctx, wx + 8 + ((i * 17) % (ww - 16)), wy + wh - 8 - ph * (wh - 10), 2 + ph * 3, (1 - ph) * 0.55)
    }
  }
  // handle and knobs
  px(ctx, WOOD_DARK, wx + 6, wy - 6, ww - 12, 3)
  px(ctx, '#d9c39a', wx + 7, wy - 5, ww - 14, 1)
  for (let i = 0; i < 3; i++) {
    px(ctx, WOOD_DARK, x + ow - 10, y + 16 + i * 12, 6, 6)
    px(ctx, '#d9d1c4', x + ow - 9, y + 17 + i * 12, 4, 4)
  }
  if (isTime(s.p)) stopwatchRing(ctx, r.x + r.w * 0.82, r.y + 30, 20, s.frac, s.active, s.t)
}

function drawPour(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.5
  const liquid = liquidColor(s.p, 'pour')
  const mw = 62
  const mh = 58
  mug(ctx, cx, base, mw, mh, s.frac, liquid, s.t)
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
  for (let k = 0; k <= 10; k++) px(ctx, INK_SOFT, rx, bottom - 34 - (span * k) / 10, k % 5 ? 4 : 7, 1)
  const cx = r.x + r.w * 0.55
  const hy = bottom - 34 - span * s.frac + jitter(s)
  if (pourish) {
    const liquid = liquidColor(s.p, 'pour')
    mug(ctx, cx, base, 48, 30, 0.5, shade(liquid, -0.45), s.t)
    const jx = cx - 6
    const tip = spoutTip(jx, hy, -0.9)
    stream(ctx, tip.x, tip.y, base - 30, liquid, s.t, s.frac > 0.7 ? 2 : 3)
    jug(ctx, jx, hy, -0.9, mix('#c9ced6', liquid, 0.2))
    if (s.frac > 0.65) {
      for (let i = 0; i < 4; i++) {
        const a = (s.t / 90 + i * 1.7) % (Math.PI * 2)
        px(ctx, liquid, tip.x + Math.cos(a) * 8 * s.frac, base - 32 - Math.abs(Math.sin(a)) * 6 * s.frac, 2, 2)
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

const FLOWER_WORDS = /\b(stem|stems|flower|flowers|bloom|blooms|rose|roses|tulip|bouquet|petal|floral)\b/

function drawDip(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const cx = r.x + r.w * 0.4
  const jw = 46
  const jh = 46
  const water = liquidColor(s.p, 'dip')
  shadow(ctx, cx, base, jw + 6)
  // depth: a held phase keeps the load under while held; a moving needle bobs it in and out
  const depth = s.p.mode === 'hold' ? (s.holding || s.frozen ? 1 : 0) : s.frac
  const low = base - jh - 18 + depth * (jh + 8) + jitter(s, 0.5)
  // jar back, then whatever is dipped, then the water over it
  px(ctx, WOOD_DARK, cx - jw / 2 - 1, base - jh, jw + 2, jh)
  ctx.fillStyle = 'rgba(220,240,250,0.55)'
  ctx.fillRect(cx - jw / 2 + 1, base - jh + 1, jw - 2, jh - 2)
  if (FLOWER_WORDS.test(`${s.p.label} ${s.p.id} ${s.context}`.toLowerCase())) {
    for (let i = 0; i < 4; i++) {
      const sx = cx - 9 + i * 6
      const top = low - 54 - (i % 2) * 6
      px(ctx, '#4f8f3a', sx, top, 2, low - top)
      const petal = ['#f28fb0', '#f6d36b', '#f28fb0', '#c89cf2'][i]
      px(ctx, WOOD_DARK, sx - 4, top - 7, 10, 8)
      px(ctx, petal, sx - 3, top - 6, 8, 6)
      px(ctx, '#ffffff', sx - 1, top - 5, 2, 2)
      px(ctx, '#3f7a2e', sx + 2, top + 16, 5, 3)
    }
  } else {
    // a wire basket on a rod: whatever is being dipped
    px(ctx, '#6f747c', cx - 1, low - 60, 2, 44)
    px(ctx, WOOD_DARK, cx - 6, low - 64, 12, 5)
    for (let i = 0; i < 3; i++) {
      px(ctx, WOOD_DARK, cx - 12 + i * 8, low - 22, 8, 8)
      px(ctx, ['#e8a86a', '#d9734e', '#f2c14e'][i], cx - 11 + i * 8, low - 21, 6, 6)
    }
    px(ctx, WOOD_DARK, cx - 16, low - 17, 32, 17)
    px(ctx, '#c9ced6', cx - 15, low - 16, 30, 15)
    for (let k = 1; k < 5; k++) px(ctx, '#8a9099', cx - 15 + k * 6, low - 16, 1, 15)
    for (let k = 1; k < 3; k++) px(ctx, '#8a9099', cx - 15, low - 16 + k * 5, 30, 1)
  }
  const wl = base - jh * 0.75
  ctx.fillStyle = water
  ctx.globalAlpha = 0.6
  ctx.fillRect(cx - jw / 2 + 1, wl, jw - 2, base - wl - 1)
  ctx.globalAlpha = 1
  px(ctx, shade(water, 0.4), cx - jw / 2 + 1, wl, jw - 2, 2)
  px(ctx, '#ffffff', cx - jw / 2 + 4, base - jh + 4, 3, jh - 10)
  px(ctx, WOOD_DARK, cx - jw / 2 - 3, base - jh - 2, jw + 6, 3)
  if (depth > 0.5 && low > wl) {
    for (let i = 0; i < 5; i++) {
      const by = low - ((s.t / 20 + i * 9) % Math.max(4, low - wl))
      px(ctx, '#ffffff', cx - 8 + ((i * 7) % 18), by, 2, 2)
    }
  }
  stopwatchRing(ctx, r.x + r.w * 0.8, r.y + 30, 20, s.frac, s.active, s.t)
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
  for (let i = 0; i < 7; i++) {
    const a = s.t / (s.active ? 260 : 900) + i * 0.9
    const lx = cx + Math.cos(a) * (8 + (i % 3) * 4)
    const ly = base - gh / 2 + Math.sin(a * 1.3) * 12
    px(ctx, mix('#6b8f3a', '#3a2412', s.frac), lx, ly, 3, 2)
  }
  px(ctx, '#ffffff', cx - gw / 2 + 4, base - gh + 4, 3, gh - 10)
  px(ctx, WOOD_DARK, cx - gw / 2 - 3, base - gh - 2, gw + 6, 3)
  if (s.active) for (let i = 0; i < 2; i++) cloud(ctx, cx - 6 + i * 12, base - gh - 6 - ((s.t / 30 + i * 20) % 18), 2.5, 0.5)
  stopwatchRing(ctx, r.x + r.w * 0.8, r.y + 30, 20, s.frac, s.active, s.t)
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
  stopwatchRing(ctx, r.x + r.w * 0.8, r.y + 30, 20, s.frac, s.active, s.t)
}

/** A smoker can (or a spray bottle for mist): each squeeze sends out a cloud; the meter counts them. */
function drawPuff(ctx: Ctx, r: Rect, s: SceneState) {
  const base = counter(ctx, r)
  const smoke = /smoke/.test(`${s.p.label} ${s.p.id} ${s.p.unit}`.toLowerCase())
  const cx = r.x + r.w * 0.28
  const squeeze = s.active ? 0.5 + 0.5 * Math.sin(s.t / 90) : 0
  shadow(ctx, cx, base, 34)
  if (smoke) {
    // can
    px(ctx, WOOD_DARK, cx - 13, base - 44, 26, 44)
    px(ctx, '#c9ced6', cx - 12, base - 43, 24, 42)
    px(ctx, '#e4e7ec', cx - 10, base - 43, 4, 42)
    for (let k = 0; k < 4; k++) px(ctx, '#9aa0a8', cx - 12, base - 36 + k * 9, 24, 1)
    // lid and spout
    px(ctx, WOOD_DARK, cx - 14, base - 48, 28, 5)
    px(ctx, WOOD_DARK, cx + 2, base - 58, 10, 11)
    px(ctx, '#9aa0a8', cx + 3, base - 57, 8, 9)
    // bellows on the side
    const bw = 12 - squeeze * 5
    px(ctx, WOOD_DARK, cx - 14 - bw - 2, base - 38, bw + 2, 26)
    px(ctx, '#b97a43', cx - 14 - bw - 1, base - 37, bw, 24)
    px(ctx, '#e8d0a6', cx - 14 - bw / 2 - 1, base - 37, 2, 24)
  } else {
    // spray bottle
    px(ctx, WOOD_DARK, cx - 11, base - 40, 22, 40)
    px(ctx, '#9fd3f0', cx - 10, base - 39, 20, 38)
    px(ctx, '#ffffff', cx - 8, base - 37, 3, 30)
    px(ctx, WOOD_DARK, cx - 5, base - 50, 10, 11)
    px(ctx, WOOD_DARK, cx + 5, base - 50, 9, 4)
    px(ctx, '#e8574a', cx - 4, base - 49, 8, 9)
    px(ctx, WOOD_DARK, cx - 9 + squeeze * 3, base - 46, 4, 10)
  }
  // clouds drift out, one per tenth of the meter
  const n = Math.round(s.frac * 10)
  const rgb = smoke ? '235,232,226' : '220,240,255'
  const sx = smoke ? cx + 7 : cx + 14
  const sy = smoke ? base - 60 : base - 47
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / 10
    const drift = Math.sin(s.t / 500 + i) * 3
    cloud(ctx, sx + 12 + k * (r.w * 0.6), sy - 4 - Math.sin(k * 3) * 14 + drift, 3 + k * 5, 0.85 - k * 0.35, rgb)
  }
  if (s.active) cloud(ctx, sx + 4, sy - 2, 2 + squeeze * 2, 0.8, rgb)
}

function drawClock(ctx: Ctx, r: Rect, s: SceneState) {
  counter(ctx, r)
  stopwatchRing(ctx, r.x + r.w * 0.45, r.y + r.h / 2 - 4, 36, s.frac, s.active, s.t)
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
  oven: drawOven,
  pour: drawPour,
  height: drawHeight,
  dip: drawDip,
  steep: drawSteep,
  rise: drawRise,
  puff: drawPuff,
  clock: drawClock,
  dial: drawDial,
}

// --- the meter --------------------------------------------------------------------

function drawMeter(ctx: Ctx, r: Rect, s: SceneState, tier: Tier | null) {
  const x = r.x + jitter(s, 0.6)
  const thermo = s.scene === 'heat' || s.scene === 'oven'
  const bulbR = thermo ? 9 : 0
  const tubeTop = r.y
  const tubeBottom = r.y + r.h - (thermo ? bulbR * 2 - 2 : 0)
  const th = tubeBottom - tubeTop
  px(ctx, 'rgba(40,24,10,0.25)', x + 2, tubeTop + 3, r.w, th)
  px(ctx, WOOD_DARK, x - 2, tubeTop - 2, r.w + 4, th + 4)
  px(ctx, thermo ? '#ffffff' : PARCHMENT_DARK, x, tubeTop, r.w, th)
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
  if (s.holding && s.frac > 0.9 && Math.floor(s.t / 90) % 2 === 0) {
    // the meter is about to run out at the top
    ctx.strokeStyle = '#e8574a'
    ctx.lineWidth = 2
    ctx.strokeRect(x - 3, tubeTop - 3, r.w + 6, th + 6)
  } else if (s.frozen && tier !== null) {
    ctx.strokeStyle = TIER_COLOR[tier]
    ctx.lineWidth = 2
    ctx.strokeRect(x - 3, tubeTop - 3, r.w + 6, th + 6)
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

/** How long a phase's reaction stays up (level time). */
const REACTION_MS = PHASE_BEAT_MS + 300
/** Stage height the scenes are drawn for. */
const SCENE_H = 100

function sceneRect(stage: Rect): Rect {
  return { x: stage.x + 2, y: stage.y + 2, w: stage.w - 132, h: stage.h - 4 }
}

function meterRect(stage: Rect): Rect {
  return { x: stage.x + stage.w - 118, y: stage.y + 8, w: 18, h: stage.h - 16 }
}

function reactionPop(ctx: Ctx, r: Rect, rec: Reaction, scene: Scene, age: number, t: number) {
  if (rec.tier === null) return
  const { big, small } = reactionWords(rec, scene)
  const k = Math.min(1, age / 140)
  const bounce = k < 1 ? 0.4 + 0.75 * k : 1 + Math.max(0, 0.12 - (age - 140) / 1500)
  const fade = age > REACTION_MS - 200 ? Math.max(0, (REACTION_MS - age) / 200) : 1
  const cx = r.x + r.w / 2
  const cy = r.y + 26
  ctx.save()
  ctx.globalAlpha = fade
  ctx.translate(cx, cy)
  ctx.scale(bounce, bounce)
  const size = rec.tier === 3 ? 20 : 17
  font(ctx, size, 900)
  const w = ctx.measureText(big).width
  drawFace(ctx, -w / 2 - 12, -size * 0.32, 8, rec.tier, t)
  outlined(ctx, big, 6, 0, size, TIER_COLOR[rec.tier], WOOD_DARK, 4)
  if (small) outlined(ctx, small, 6, 12, 8.5, '#fff8e8', WOOD_DARK, 3)
  ctx.restore()
  if (rec.tier >= 2) {
    const n = rec.tier === 3 ? 10 : 5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3
      const d = 14 + age * 0.07
      const alpha = Math.max(0, 1 - age / PHASE_BEAT_MS) * fade
      sparkle(ctx, cx + Math.cos(a) * d * 1.8, cy - 6 + Math.sin(a) * d, 2 + (i % 3), `rgba(255,236,150,${alpha})`)
    }
  }
}

export function drawTiming(ctx: Ctx, e: GameEngine, m: TimingMechanic) {
  const c = contentRect(e.W, e.H)
  const stage = m.meterRect()
  const n = m.params.phases.length
  const lt = m.now()
  // human play rests on the phase that just ended for a beat, so its reaction reads in place
  const frozen = m.pauseLeft() > 0 && !!m.last
  const p = frozen ? m.last!.phase : m.phase
  if (!p) return
  const shown = frozen ? m.params.phases.indexOf(p) : m.index
  const level = e.level
  const context = `${level?.title ?? ''} ${level?.aim ?? ''} ${e.location(level?.quest.location_id)?.name ?? ''}`.toLowerCase()

  // header row: pips + step label
  for (let i = 0; i < n; i++) {
    const rec = m.reactions[m.params.phases[i].id]
    px(ctx, WOOD_DARK, c.x + 2 + i * 13, c.y + 3, 10, 10)
    px(ctx, rec && rec.tier !== null ? TIER_COLOR[rec.tier] : rec ? '#e6f2d6' : i === shown ? '#fff1c4' : PARCHMENT_DARK, c.x + 3 + i * 13, c.y + 4, 8, 8)
    if (rec?.tier === 3) sparkle(ctx, c.x + 7 + i * 13, c.y + 8, 3, '#ffffff')
  }
  const lx = c.x + 6 + n * 13
  text(ctx, n > 1 ? `${shown + 1}/${n}  ${p.label}` : p.label, lx, c.y + 12, { size: 10, weight: 900, maxW: c.w - (lx - c.x) - 4 })
  const scene = sceneOf(p, context)
  const instr = p.mode === 'hold' ? `Hold to ${VERB[scene]}, let go at the right moment` : 'Press at the right moment'
  text(ctx, instr, c.x + 2, c.y + 23, { size: 7.5, weight: 800, color: INK_SOFT, maxW: c.w - 4 })

  // stage
  roundRect(ctx, stage, 4, '#f8e6bd', shade(PARCHMENT, -0.18), 1)
  const value = frozen ? m.last!.value : m.value()
  const holding = !frozen && m.holding
  const s: SceneState = {
    p,
    scene,
    frac: fracOf(p, value),
    active: !frozen && (p.mode === 'stop' ? !m.done : m.holding),
    holding,
    frozen,
    t: lt,
    context,
  }
  const sr = sceneRect(stage)
  // scenes are drawn for a ~100 px tall stage; scale them up to fill a taller one
  const k = Math.max(1, Math.min(1.6, sr.h / SCENE_H))
  ctx.save()
  ctx.beginPath()
  ctx.rect(sr.x, sr.y, sr.w, sr.h)
  ctx.clip()
  ctx.translate(sr.x, sr.y)
  ctx.scale(k, k)
  SCENES[scene](ctx, { x: 0, y: 0, w: sr.w / k, h: sr.h / k }, s)
  ctx.restore()
  drawMeter(ctx, meterRect(stage), s, frozen ? m.last!.tier : null)

  // right column: live value, then the big verb with keys
  const colX = stage.x + stage.w - 88
  const colW = 84
  const mid = colX + colW / 2
  const tier = frozen ? m.last!.tier : null
  text(ctx, fmt(value), mid, stage.y + 26, { size: 18, weight: 900, align: 'center', color: tier !== null ? shade(TIER_COLOR[tier], -0.35) : INK, maxW: colW })
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

  // the last phase's reaction pops over the scene
  if (m.last) {
    const age = lt - m.last.at
    if (age >= 0 && age < REACTION_MS) reactionPop(ctx, sr, m.last, sceneOf(m.last.phase, context), age, lt)
  }

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
    const col = rec.tier !== null ? TIER_COLOR[rec.tier] : '#e6f2d6'
    roundRect(ctx, r, 3, mix(col, '#ffffff', 0.55), WOOD_DARK)
    const mark = rec.tier === 3 ? '★' : rec.tier === 0 ? '✗' : '✓'
    const label = `${mark} ${ph.label} ${fmt(rec.value)} ${ph.unit}`.trim()
    text(ctx, label, r.x + 5, r.y + 11, { size: 7, weight: 800, maxW: w - 8 })
  })
}
