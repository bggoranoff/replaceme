// JUICE KIT: shared particles, squash/stretch, shake, pop text, flying cards, emoji reactions
// and sounds for every mechanic. Purely cosmetic: nothing here changes engine state, scores or
// observations, and it runs on real time (performance.now), so virtual-time agent runs are
// unaffected. Sounds only play for a human ('play' engine); agent and spectator engines stay silent.
//
// ---------------------------------------------------------------------------------------------
// API (mechanics reach it as `this.ctx.juice`; renderers as `e.juice`). Coordinates are logical
// (observation.viewport) pixels, the same space as layout.ts rects.
//
//   juice.burst(x, y, { colors?, count?, speed?, gravity?, shape?: 'square'|'star'|'drop'|'spark', life?, size? })
//       particle burst; shape 'drop' + gravity for splashes, 'star' for celebrations
//   juice.confetti(x, y, count?)       multi-colour star/square burst (perfect, iridium, level end)
//   juice.popText(x, y, text, { color?, size?, rise?, ms? })
//       floating text that pops in, rises and fades ("+1", "Perfect!", "✓")
//   juice.shake(px = 2, ms = 220)      screen shake (renderer applies juice.offset() to the panel)
//   juice.flash(color = '#ffffff', ms = 140, alpha = 0.5)   full-screen flash
//   juice.squash(key, amount = 0.25, ms = 320)   squash-and-stretch an element; draw it with
//   juice.pop(key, ms = 260)                     pop-in (grows from small with overshoot)
//   juice.withScale(ctx, key, pivotX, pivotY, draw)   ...this wrapper (or read juice.scaleOf(key))
//   juice.fly(from: Rect, to: Rect, { label?, color?, ms?, onLand? })
//       a small card flies from one rect into another and shrinks (snap into a bin, hand over)
//   juice.react(key, tier, ms = 1600)  remember an emoji reaction (Moonlighter); read it back with
//   juice.reaction(key) -> { tier, age, k } | null   and draw it with drawReaction(...)
//   juice.later(ms, fn)                run a cosmetic callback after a real-time delay
//   juice.sfx(name, { pitch?, volume? })   one-shot sound, see sound.ts for names
//   juice.loop(key, name | null)       start ('pour' | 'hum') or stop (null) a continuous sound
//   juice.draw(ctx)                    called once per frame by render/index.ts (on top of panels)
//
// Ready-made combos (prefer these in mechanics, one line per game moment):
//   juice.select(key)                  selection moved: tick + small squash of `key`
//   juice.snapInto(from, to, key, label?)   card flies into `to`, `key` squashes, sparkles, snap+pop
//   juice.collect(x, y, label)         "+ label" pop text, sparkles, pop sound
//   juice.verdict(x, y, good, label?)  ✓ + stars + ding, or ✗ + thud + shake
//   juice.reactSound(tier)             sound for a reaction tier
//
// Helpers (no state): tierOfScore(score) / tierOfPoints(0..1) -> Tier 0..3 (way off, close,
// great, perfect); qualityOf(score, passed) -> Quality 0..3 (bronze, silver, gold, iridium);
// drawFace(ctx, x, y, r, tier, t); drawReaction(ctx, x, y, r, tier, k, t); drawQualityStar(...).
// ---------------------------------------------------------------------------------------------
import type { Rect } from '../types'
import { playSfx, startLoop, type LoopName, type SfxName } from '../sound'
import { INK, WOOD_DARK, px, text, type Ctx } from './pixel'

export type Tier = 0 | 1 | 2 | 3
export type Quality = 0 | 1 | 2 | 3

export const TIER_WORDS = ['Way off', 'Close', 'Great', 'Perfect!'] as const
export const QUALITY_NAMES = ['Bronze', 'Silver', 'Gold', 'Iridium'] as const
const QUALITY_COLORS: [string, string, string][] = [
  ['#c7834a', '#e8b07a', '#7a4a22'],
  ['#c9d3dc', '#f4f8fb', '#6f7d8a'],
  ['#f2c14e', '#fff0a8', '#9a6a12'],
  ['#a46be0', '#e2c6ff', '#4e2a80'],
]

/** Score card / reaction tier from a 0-100 score. */
export function tierOfScore(score: number): Tier {
  return score >= 97 ? 3 : score >= 80 ? 2 : score >= 50 ? 1 : 0
}

/** Reaction tier from a 0-1 quality (e.g. converse option points, closeness to a goal). */
export function tierOfPoints(p: number): Tier {
  return tierOfScore(p * 100)
}

/** Stardew-style quality from a 0-100 score. */
export function qualityOf(score: number, passed: boolean): Quality {
  if (score >= 97) return 3
  if (score >= 85) return 2
  if (score >= 70 || passed) return 1
  return 0
}

type Shape = 'square' | 'star' | 'drop' | 'spark'
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  age: number
  size: number
  color: string
  shape: Shape
  spin: number
}
interface PopText {
  x: number
  y: number
  text: string
  color: string
  size: number
  rise: number
  at: number
  ms: number
}
interface Flyer {
  from: Rect
  to: Rect
  label: string
  color: string
  at: number
  ms: number
  onLand?: () => void
  landed: boolean
}
interface Scale {
  kind: 'squash' | 'pop'
  amount: number
  at: number
  ms: number
}

const CONFETTI = ['#f2c14e', '#e8574a', '#8cc265', '#6cb4e4', '#c47ae0', '#fff6e0']

export class Juice {
  readonly audible: boolean
  private parts: Particle[] = []
  private texts: PopText[] = []
  private flyers: Flyer[] = []
  private scales = new Map<string, Scale>()
  private reactions = new Map<string, { tier: Tier; at: number; ms: number }>()
  private timers: { at: number; fn: () => void }[] = []
  private loops = new Map<string, () => void>()
  private shakeUntil = 0
  private shakeMs = 1
  private shakePx = 0
  private flashState: { color: string; at: number; ms: number; alpha: number } | null = null
  private last = 0

  /** audible: true only for a human-played engine. */
  constructor(audible: boolean) {
    this.audible = audible
  }

  now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  // --- particles -------------------------------------------------------------

  burst(x: number, y: number, o: { colors?: string[]; count?: number; speed?: number; gravity?: number; shape?: Shape; life?: number; size?: number; up?: boolean } = {}) {
    const n = o.count ?? 12
    const colors = o.colors ?? ['#fff6e0', '#f2c14e']
    const sp = o.speed ?? 70
    for (let i = 0; i < n && this.parts.length < 400; i++) {
      const a = o.up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2
      const v = sp * (0.45 + Math.random() * 0.75)
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: o.gravity ?? 160,
        life: (o.life ?? 650) * (0.7 + Math.random() * 0.6),
        age: 0,
        size: (o.size ?? 2.2) * (0.7 + Math.random() * 0.6),
        color: colors[i % colors.length],
        shape: o.shape ?? 'square',
        spin: (Math.random() - 0.5) * 10,
      })
    }
  }

  confetti(x: number, y: number, count = 28) {
    this.burst(x, y, { colors: CONFETTI, count, speed: 120, gravity: 140, shape: 'star', life: 1100, size: 3, up: true })
    this.burst(x, y, { colors: CONFETTI, count: Math.round(count / 2), speed: 90, gravity: 120, shape: 'square', life: 1000, size: 2 })
  }

  popText(x: number, y: number, s: string, o: { color?: string; size?: number; rise?: number; ms?: number } = {}) {
    this.texts.push({ x, y, text: s, color: o.color ?? '#fff6e0', size: o.size ?? 9, rise: o.rise ?? 16, at: this.now(), ms: o.ms ?? 900 })
    if (this.texts.length > 24) this.texts.shift()
  }

  // --- screen ----------------------------------------------------------------

  shake(pxs = 2, ms = 220) {
    this.shakePx = Math.max(this.shakeUntil > this.now() ? this.shakePx : 0, pxs)
    this.shakeMs = ms
    this.shakeUntil = this.now() + ms
  }

  /** Current shake offset; the renderer translates the level panel by it. */
  offset(): { x: number; y: number } {
    const left = this.shakeUntil - this.now()
    if (left <= 0) return { x: 0, y: 0 }
    const k = (left / this.shakeMs) * this.shakePx
    const t = this.now()
    return { x: Math.round(Math.sin(t / 17) * k), y: Math.round(Math.cos(t / 23) * k * 0.6) }
  }

  flash(color = '#ffffff', ms = 140, alpha = 0.5) {
    this.flashState = { color, at: this.now(), ms, alpha }
  }

  // --- element scale -----------------------------------------------------------

  squash(key: string, amount = 0.25, ms = 320) {
    this.scales.set(key, { kind: 'squash', amount, at: this.now(), ms })
  }

  pop(key: string, ms = 260) {
    this.scales.set(key, { kind: 'pop', amount: 0.45, at: this.now(), ms })
  }

  scaleOf(key: string): { sx: number; sy: number } {
    const s = this.scales.get(key)
    if (!s) return { sx: 1, sy: 1 }
    const k = (this.now() - s.at) / s.ms
    if (k >= 1 || k < 0) {
      if (k >= 1) this.scales.delete(key)
      return { sx: 1, sy: 1 }
    }
    if (s.kind === 'pop') {
      // grows from (1 - amount) with a little overshoot
      const e = 1 - Math.pow(1 - k, 3)
      const over = Math.sin(k * Math.PI) * 0.12
      const v = 1 - s.amount + s.amount * e + over
      return { sx: v, sy: v }
    }
    const d = Math.exp(-4 * k) * Math.cos(k * Math.PI * 3)
    return { sx: 1 + s.amount * d, sy: 1 - s.amount * d }
  }

  /** Draws `draw` scaled by the element's current squash/pop around (pivotX, pivotY). */
  withScale(ctx: Ctx, key: string, pivotX: number, pivotY: number, draw: () => void) {
    const { sx, sy } = this.scaleOf(key)
    if (sx === 1 && sy === 1) return draw()
    ctx.save()
    ctx.translate(pivotX, pivotY)
    ctx.scale(sx, sy)
    ctx.translate(-pivotX, -pivotY)
    draw()
    ctx.restore()
  }

  // --- flying cards --------------------------------------------------------------

  fly(from: Rect, to: Rect, o: { label?: string; color?: string; ms?: number; onLand?: () => void } = {}) {
    this.flyers.push({ from, to, label: o.label ?? '', color: o.color ?? '#fff8e8', at: this.now(), ms: o.ms ?? 240, onLand: o.onLand, landed: false })
  }

  // --- reactions -----------------------------------------------------------------

  react(key: string, tier: Tier, ms = 1600) {
    this.reactions.set(key, { tier, at: this.now(), ms })
  }

  /** k is 0..1 through the reaction's lifetime; age in ms. */
  reaction(key: string): { tier: Tier; age: number; k: number } | null {
    const r = this.reactions.get(key)
    if (!r) return null
    const age = this.now() - r.at
    if (age > r.ms) {
      this.reactions.delete(key)
      return null
    }
    return { tier: r.tier, age, k: age / r.ms }
  }

  clearReaction(key: string) {
    this.reactions.delete(key)
  }

  later(ms: number, fn: () => void) {
    this.timers.push({ at: this.now() + ms, fn })
  }

  // --- ready-made combos (one call per game moment) ------------------------------------

  /** Selection moved to `key` (a bin, an option, a variable): tick + tiny squash. */
  select(key: string) {
    this.squash(key, 0.1, 200)
    this.sfx('tick', { volume: 0.6 })
  }

  /** Something drops into a container: card flies, container squashes, sparkles, snap + pop. */
  snapInto(from: Rect, to: Rect, key: string, label = '', colors = ['#ffffff', '#f2c14e', '#fff0a8', '#8cc265']) {
    this.sfx('whoosh', { volume: 0.5 })
    this.fly(from, to, {
      label,
      onLand: () => {
        this.squash(key, 0.28, 360)
        const cx = to.x + to.w / 2
        const cy = to.y + Math.min(18, to.h / 3)
        this.burst(cx, cy, { colors, count: 16, speed: 95, gravity: 170, up: true, shape: 'star', size: 2.8, life: 750 })
        this.burst(cx, cy, { colors: ['#ffffff'], count: 6, speed: 50, gravity: 0, shape: 'spark', size: 1.4, life: 350 })
        this.sfx('snap', { volume: 0.7 })
        this.sfx('pop', { pitch: 0.9 + Math.random() * 0.25 })
      },
    })
  }

  /** Picked something up at (x, y). */
  collect(x: number, y: number, label: string) {
    this.popText(x, y, `+ ${label}`, { color: '#fff6e0', size: 8 })
    this.burst(x, y + 6, { colors: ['#fff6e0', '#f2c14e'], count: 10, speed: 55, gravity: 90, up: true, shape: 'spark', size: 1.6 })
    this.sfx('pop', { pitch: 1.15 })
  }

  /** A judged moment at (x, y): good = ding + stars, bad = thud + shake. */
  verdict(x: number, y: number, good: boolean, label?: string) {
    if (good) {
      this.popText(x, y, label ?? '✓', { color: '#bfe89a', size: 10 })
      this.burst(x, y, { colors: ['#f2c14e', '#fff0a8', '#8cc265', '#ffffff'], count: 18, speed: 90, gravity: 110, shape: 'star', size: 2.4, up: true })
      this.sfx('ding', { volume: 0.8 })
    } else {
      this.popText(x, y, label ?? '✗', { color: '#f08a5d', size: 10 })
      this.burst(x, y, { colors: ['#c9b393', '#a58a68'], count: 8, speed: 40, gravity: 150, shape: 'drop' })
      this.shake(1.5, 200)
      this.sfx('snap', { pitch: 0.5 })
    }
  }

  /** The sound that goes with a reaction tier (0 way off ... 3 perfect). */
  reactSound(tier: Tier) {
    if (tier === 3) {
      this.sfx('pop', { pitch: 1.4 })
      this.later(90, () => this.sfx('ding', { volume: 0.7 }))
    } else if (tier === 2) this.sfx('pop', { pitch: 1.15 })
    else if (tier === 1) this.sfx('tap', { pitch: 0.8 })
    else this.sfx('snap', { pitch: 0.5 })
  }

  // --- sound -----------------------------------------------------------------------

  sfx(name: SfxName, o: { pitch?: number; volume?: number } = {}) {
    if (this.audible) playSfx(name, o)
  }

  loop(key: string, name: LoopName | null, o: { pitch?: number; volume?: number } = {}) {
    const stop = this.loops.get(key)
    if (stop) {
      stop()
      this.loops.delete(key)
    }
    if (name && this.audible) this.loops.set(key, startLoop(name, o))
  }

  stopAll() {
    for (const stop of this.loops.values()) stop()
    this.loops.clear()
  }

  // --- frame -------------------------------------------------------------------------

  draw(ctx: Ctx) {
    const now = this.now()
    const dt = this.last ? Math.min(50, now - this.last) / 1000 : 0
    this.last = now
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now)
      this.timers = this.timers.filter((t) => t.at > now)
      due.forEach((t) => t.fn())
    }
    // flyers
    for (const f of this.flyers) {
      const k = Math.min(1, (now - f.at) / f.ms)
      const e = k * k * (3 - 2 * k)
      const fx = f.from.x + f.from.w / 2
      const fy = f.from.y + f.from.h / 2
      const tx = f.to.x + f.to.w / 2
      const ty = f.to.y + Math.min(f.to.h / 2, 20)
      const x = fx + (tx - fx) * e
      const y = fy + (ty - fy) * e - Math.sin(k * Math.PI) * 14
      const s = 1 - 0.75 * e
      const w = f.from.w * s
      const h = f.from.h * s
      ctx.save()
      ctx.globalAlpha = 1 - Math.max(0, k - 0.85) * 6
      px(ctx, WOOD_DARK, x - w / 2, y - h / 2, w, h)
      px(ctx, f.color, x - w / 2 + 1.5, y - h / 2 + 1.5, w - 3, h - 3)
      if (f.label && s > 0.45) text(ctx, f.label, x, y + 3, { size: 8 * s + 1, weight: 800, align: 'center', color: INK, maxW: w - 6 })
      ctx.restore()
      if (k >= 1 && !f.landed) {
        f.landed = true
        f.onLand?.()
      }
    }
    this.flyers = this.flyers.filter((f) => !f.landed)
    // particles
    for (const p of this.parts) {
      p.age += dt * 1000
      p.vy += p.g * dt
      p.vx *= 1 - 1.2 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      const a = Math.max(0, 1 - p.age / p.life)
      ctx.globalAlpha = Math.min(1, a * 1.6)
      ctx.fillStyle = p.color
      if (p.shape === 'star') {
        starPath(ctx, p.x, p.y, p.size * 1.4, p.size * 0.6, (p.age / 1000) * p.spin)
        ctx.fill()
      } else if (p.shape === 'drop') {
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, p.size * 0.7, p.size, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.shape === 'spark') {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size * 1.5, p.size, p.size * 3)
        ctx.fillRect(p.x - p.size * 1.5, p.y - p.size / 2, p.size * 3, p.size)
      } else {
        const s = p.size * (0.5 + a * 0.5)
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
      }
    }
    ctx.globalAlpha = 1
    this.parts = this.parts.filter((p) => p.age < p.life)
    // pop texts
    for (const t of this.texts) {
      const k = (now - t.at) / t.ms
      if (k >= 1) continue
      const grow = k < 0.18 ? 0.6 + (k / 0.18) * 0.55 : k < 0.3 ? 1.15 - ((k - 0.18) / 0.12) * 0.15 : 1
      const y = t.y - t.rise * Math.min(1, k * 1.6)
      ctx.save()
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      ctx.translate(t.x, y)
      ctx.scale(grow, grow)
      ctx.lineJoin = 'round'
      ctx.font = `800 ${t.size}px Nunito, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = WOOD_DARK
      ctx.strokeText(t.text, 0, 0)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, 0, 0)
      ctx.restore()
    }
    this.texts = this.texts.filter((t) => now - t.at < t.ms)
    // flash
    const f = this.flashState
    if (f) {
      const k = (now - f.at) / f.ms
      if (k >= 1) this.flashState = null
      else {
        ctx.globalAlpha = f.alpha * (1 - k)
        ctx.fillStyle = f.color
        ctx.fillRect(-20, -20, 4000, 4000)
        ctx.globalAlpha = 1
      }
    }
  }
}

// --- stateless drawing helpers -------------------------------------------------------

function starPath(ctx: Ctx, cx: number, cy: number, outer: number, inner: number, rot = 0) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5
    const rr = i % 2 ? inner : outer
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

/** Round emoji-style face: 0 worried, 1 meh, 2 happy, 3 star-struck. */
export function drawFace(ctx: Ctx, x: number, y: number, r: number, tier: Tier, t = 0) {
  const fill = tier === 0 ? '#f6c27a' : '#ffd84d'
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(x, y, r + 1.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2)
  ctx.fill()
  const ex = r * 0.36
  const ey = y - r * 0.18
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineWidth = Math.max(1, r * 0.14)
  ctx.lineCap = 'round'
  if (tier === 3) {
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#e8574a'
      starPath(ctx, x + s * ex, ey, r * 0.3, r * 0.13, Math.sin(t / 200) * 0.3)
      ctx.fill()
    }
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(x, y + r * 0.22, r * 0.42, 0, Math.PI)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#e8574a'
    ctx.beginPath()
    ctx.arc(x, y + r * 0.48, r * 0.2, Math.PI, Math.PI * 2)
    ctx.fill()
  } else if (tier === 2) {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(x + s * ex, ey + r * 0.08, r * 0.15, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, y + r * 0.1, r * 0.42, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
    ctx.fillStyle = 'rgba(232,87,74,0.35)'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(x + s * r * 0.58, y + r * 0.2, r * 0.17, r * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (tier === 1) {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(x + s * ex, ey, r * 0.11, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(x - r * 0.32, y + r * 0.38)
    ctx.lineTo(x + r * 0.32, y + r * 0.38)
    ctx.stroke()
  } else {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(x + s * ex, ey + r * 0.05, r * 0.11, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      // worried brows slope up toward the middle
      ctx.moveTo(x + s * ex - r * 0.2, ey - r * 0.32 - (s > 0 ? r * 0.1 : 0))
      ctx.lineTo(x + s * ex + r * 0.2, ey - r * 0.32 - (s > 0 ? 0 : r * 0.1))
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, y + r * 0.62, r * 0.32, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
    // sweat drop
    ctx.fillStyle = '#6cb4e4'
    ctx.beginPath()
    ctx.ellipse(x + r * 0.72, y - r * 0.15 + ((t / 30) % 4) * 0.2, r * 0.13, r * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineCap = 'butt'
}

/** A reaction face in a thought bubble that pops in, bobs, and fades at the end (k = 0..1). */
export function drawReaction(ctx: Ctx, x: number, y: number, r: number, tier: Tier, k: number, t: number, label = true) {
  const appear = Math.min(1, k * 7)
  const s = appear < 0.7 ? 0.4 + (appear / 0.7) * 0.8 : 1.2 - ((appear - 0.7) / 0.3) * 0.2
  const hop = tier >= 2 ? -Math.abs(Math.sin(t / 110)) * 2 : tier === 0 ? Math.sin(t / 40) * 0.8 : 0
  ctx.save()
  ctx.globalAlpha = k > 0.85 ? Math.max(0, 1 - (k - 0.85) / 0.15) : 1
  ctx.translate(x + (tier === 0 ? hop : 0), y + (tier >= 2 ? hop : 0))
  ctx.scale(s, s)
  // bubble
  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.arc(0, 0, r + 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0, 0, r + 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(-r * 0.9, r + 3, 2.2, 0, Math.PI * 2)
  ctx.arc(-r * 1.3, r + 6, 1.4, 0, Math.PI * 2)
  ctx.fill()
  drawFace(ctx, 0, 0, r, tier, t)
  if (label) {
    const colors = ['#b4432f', '#8a6a50', '#3f7f3a', '#9a4a1e']
    ctx.lineJoin = 'round'
    ctx.font = '800 7px Nunito, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#ffffff'
    ctx.strokeText(TIER_WORDS[tier], 0, r + 13)
    ctx.fillStyle = colors[tier]
    ctx.fillText(TIER_WORDS[tier], 0, r + 13)
  }
  ctx.restore()
}

/** Stardew-style quality star; `appear` 0..1 scales it in with a little overshoot. */
export function drawQualityStar(ctx: Ctx, x: number, y: number, r: number, q: Quality, t: number, appear = 1) {
  const [base, light, dark] = QUALITY_COLORS[q]
  const s = appear >= 1 ? 1 : appear < 0.7 ? (appear / 0.7) * 1.25 : 1.25 - ((appear - 0.7) / 0.3) * 0.25
  if (s <= 0) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.rotate(appear < 1 ? (1 - appear) * -1.2 : Math.sin(t / 600) * 0.06)
  // glow for gold and iridium
  if (q >= 2) {
    const pulse = 0.5 + Math.sin(t / 220) * 0.2
    ctx.fillStyle = q === 3 ? `rgba(196,122,224,${pulse * 0.45})` : `rgba(242,193,78,${pulse * 0.4})`
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2)
    ctx.fill()
  }
  starPath(ctx, 0, 0, r + 1.6, r * 0.45 + 1, 0)
  ctx.fillStyle = WOOD_DARK
  ctx.fill()
  starPath(ctx, 0, 0, r, r * 0.45, 0)
  ctx.fillStyle = base
  ctx.fill()
  starPath(ctx, -r * 0.08, -r * 0.1, r * 0.55, r * 0.24, 0)
  ctx.fillStyle = light
  ctx.fill()
  ctx.strokeStyle = dark
  ctx.lineWidth = 0.8
  starPath(ctx, 0, 0, r, r * 0.45, 0)
  ctx.stroke()
  // twinkle
  if (q >= 1) {
    const tw = (t / 900) % 1
    if (tw < 0.25) {
      const a = Math.sin((tw / 0.25) * Math.PI)
      ctx.fillStyle = `rgba(255,255,255,${a})`
      ctx.fillRect(r * 0.35 - 0.5, -r * 0.75 - 2.5, 1, 5)
      ctx.fillRect(r * 0.35 - 2.5, -r * 0.75 - 0.5, 5, 1)
    }
  }
  ctx.restore()
}
