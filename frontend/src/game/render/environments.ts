// Interior environments (builder/environments.py): floors, walls and every piece of furniture the templates use,
// drawn procedurally in the map's pixel-art style. Nothing here knows about a job; the world names an environment
// id and its palette, and each location names an icon. Unknown icons return false so sprites.ts can fall back.
import { TILE } from '../layout'
import type { MapLocation, Palette, World } from '../types'
import { GOLD, hash, mix, px, seedOf, shade, type Ctx } from './pixel'

export type EnvId = 'cafe' | 'kitchen' | 'shop' | 'garage' | 'office' | 'clinic' | 'workshop' | 'warehouse'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface EnvPal {
  floor: string
  wall: string
  trim: string
  accent: string
  wood: string
}

const LINE = '#3b2a20'
const STEEL = '#c5cbd1'
const STEEL_D = '#8e969e'
const STEEL_DD = '#5f666e'
const STEEL_L = '#e6eaed'
const GLASS = '#cfe8f2'
const WHITE = '#fbf8f0'
const DARK = '#3d3a40'
const PAPER = '#f4ecd8'
const CARD = '#c99a62'
const SACK = '#d9c49a'
const LEAF = '#4f9a44'
const LEAF_D = '#3a7a35'
const POT = '#c0673f'
const SKY = '#bfe3f5'
const GOODS = ['#e8574a', '#f2c14e', '#5e8fc9', '#8cbf5a', '#b56fc2', '#f7a6b8', '#4fa59a', '#e98a3c']

const ENV_IDS: EnvId[] = ['cafe', 'kitchen', 'shop', 'garage', 'office', 'clinic', 'workshop', 'warehouse']

/** The world's interior environment, or null for the outdoor village. */
export function envOf(world: World): EnvId | null {
  const id = world.theme?.environment
  return ENV_IDS.includes(id as EnvId) ? (id as EnvId) : null
}

function envPal(pal: Palette): EnvPal {
  return {
    floor: pal.floor ?? '#b07a4c',
    wall: pal.wall ?? '#ecd6ac',
    trim: pal.trim ?? '#6e4426',
    accent: pal.accent ?? GOLD,
    wood: pal.wood ?? '#9a6a3f',
  }
}

// Flat things lie on the floor and are drawn under everything else.
const FLAT = new Set(['rug', 'oil', 'shavings', 'bay'])
export const isFlat = (icon?: string) => !!icon && FLAT.has(icon)

// --- primitives ------------------------------------------------------------------------

function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, line = LINE) {
  px(ctx, line, x, y, w, h)
  px(ctx, fill, x + 1, y + 1, w - 2, h - 2)
}

function shadow(ctx: Ctx, x: number, y: number, w: number) {
  px(ctx, 'rgba(40,26,14,0.22)', x + 1, y - 1, w - 2, 3)
  px(ctx, 'rgba(40,26,14,0.1)', x + 2, y + 2, w - 4, 1)
}

/** A counter or bench seen from the front: top surface + front face. Returns the top surface. */
function counter(ctx: Ctx, b: Box, top: string, face: string, o: { faceH?: number; panels?: boolean; inset?: number } = {}): Box {
  const faceH = o.faceH ?? 11
  const inset = o.inset ?? 0
  const x = b.x + inset
  const w = b.w - inset * 2
  const topY = b.y + 5
  const bottom = b.y + b.h - 2
  shadow(ctx, x, bottom + 1, w)
  px(ctx, LINE, x, topY - 1, w, bottom - topY + 1)
  const depth = bottom - faceH - topY
  px(ctx, top, x + 1, topY, w - 2, depth)
  px(ctx, shade(top, 0.18), x + 1, topY, w - 2, 1)
  px(ctx, shade(top, -0.2), x + 1, topY + depth - 1, w - 2, 1)
  px(ctx, face, x + 1, bottom - faceH, w - 2, faceH - 1)
  px(ctx, shade(face, 0.12), x + 1, bottom - faceH, w - 2, 1)
  if (o.panels !== false) {
    for (let i = x + 16; i < x + w - 8; i += 16) px(ctx, shade(face, -0.18), i, bottom - faceH + 2, 1, faceH - 4)
  }
  px(ctx, shade(face, -0.32), x + 1, bottom - 2, w - 2, 1)
  return { x: x + 1, y: topY, w: w - 2, h: depth }
}

/** A tall cabinet whose front rises `rise` px above its footprint. Returns the inside of its front. */
function tallUnit(ctx: Ctx, b: Box, rise: number, body: string): Box {
  const top = b.y - rise
  const bottom = b.y + b.h - 1
  shadow(ctx, b.x + 1, bottom, b.w - 2)
  px(ctx, LINE, b.x + 1, top, b.w - 2, bottom - top)
  px(ctx, body, b.x + 2, top + 1, b.w - 4, bottom - top - 2)
  px(ctx, shade(body, 0.2), b.x + 2, top + 1, b.w - 4, 1)
  px(ctx, shade(body, -0.25), b.x + 2, bottom - 3, b.w - 4, 2)
  return { x: b.x + 4, y: top + 4, w: b.w - 8, h: bottom - top - 8 }
}

/** Shelf boards across a cabinet front, each filled with small goods. */
function shelves(ctx: Ctx, r: Box, body: string, rowH: number, s: number, kind: 'jars' | 'books' | 'boxes' | 'bottles' | 'mixed') {
  px(ctx, shade(body, -0.35), r.x, r.y, r.w, r.h)
  let row = 0
  for (let by = r.y + rowH; by <= r.y + r.h + 1; by += rowH, row++) {
    px(ctx, shade(body, 0.1), r.x, by - 1, r.w, 2)
    goods(ctx, r.x + 1, by - 1, r.w - 2, kind === 'mixed' ? (['jars', 'books', 'boxes', 'bottles'] as const)[(s + row) % 4] : kind, s + row * 31, rowH - 3)
  }
}

function goods(ctx: Ctx, x: number, by: number, w: number, kind: 'jars' | 'books' | 'boxes' | 'bottles', s: number, maxH: number) {
  let cx = x
  let i = 0
  while (cx < x + w - 2) {
    const r = hash(i, s, 3)
    const c = GOODS[Math.floor(hash(s, i, 5) * GOODS.length)]
    if (kind === 'books') {
      const bw = 2 + Math.floor(r * 2)
      const bh = Math.min(maxH, 5 + Math.floor(hash(s, i, 9) * 3))
      if (cx + bw > x + w) break
      px(ctx, shade(c, -0.15), cx, by - bh, bw, bh)
      px(ctx, shade(c, 0.25), cx, by - bh + 1, bw, 1)
      cx += bw
    } else if (kind === 'boxes') {
      const bw = 4 + Math.floor(r * 3)
      const bh = Math.min(maxH, 3 + Math.floor(hash(s, i, 9) * 3))
      if (cx + bw > x + w) break
      box(ctx, cx, by - bh, bw, bh, hash(s, i, 11) < 0.6 ? CARD : c)
      cx += bw + 1
    } else if (kind === 'bottles') {
      if (cx + 3 > x + w) break
      const bh = Math.min(maxH, 5 + Math.floor(r * 2))
      px(ctx, LINE, cx, by - bh, 3, bh)
      px(ctx, c, cx + 1, by - bh + 2, 1, bh - 2)
      cx += 4
    } else {
      if (cx + 4 > x + w) break
      px(ctx, LINE, cx, by - 5, 4, 5)
      px(ctx, GLASS, cx + 1, by - 4, 2, 3)
      px(ctx, c, cx + 1, by - 2, 2, 1)
      px(ctx, STEEL_D, cx + 1, by - 6, 2, 1)
      cx += 5
    }
    i++
  }
}

function cup(ctx: Ctx, x: number, by: number, c = WHITE) {
  px(ctx, LINE, x, by - 3, 4, 3)
  px(ctx, c, x + 1, by - 3, 2, 2)
  px(ctx, LINE, x + 4, by - 2, 1, 1)
}

function plantPot(ctx: Ctx, x: number, by: number, big: boolean, s: number) {
  const pw = big ? 8 : 5
  px(ctx, shade(POT, -0.3), x, by - (big ? 6 : 4), pw, big ? 6 : 4)
  px(ctx, POT, x + 1, by - (big ? 6 : 4), pw - 2, big ? 4 : 3)
  const lh = big ? 10 : 6
  px(ctx, LEAF_D, x - 1, by - (big ? 6 : 4) - lh + 2, pw + 2, lh - 2)
  px(ctx, LEAF, x, by - (big ? 6 : 4) - lh, pw, lh - 2)
  px(ctx, shade(LEAF, 0.25), x + 1 + (s % 2), by - (big ? 6 : 4) - lh + 1, 2, 2)
  if (big) px(ctx, shade(LEAF, 0.25), x + pw - 3, by - 12, 2, 2)
}

function monitor(ctx: Ctx, x: number, by: number, w: number, t: number, s: number) {
  px(ctx, STEEL_DD, x + w / 2 - 1, by - 3, 2, 3)
  px(ctx, STEEL_DD, x + w / 2 - 3, by - 1, 6, 1)
  box(ctx, x, by - 3 - 8, w, 9, DARK, '#26232a')
  const lit = Math.floor(t / 1400 + s) % 3
  for (let i = 0; i < 3; i++) px(ctx, i === lit ? '#bfe9ff' : '#6fa9c9', x + 2, by - 9 + i * 2, Math.max(2, w - 4 - ((i * 3 + s) % 4)), 1)
}

function sack(ctx: Ctx, x: number, by: number, w: number, c = SACK) {
  px(ctx, shade(c, -0.4), x, by - 9, w, 9)
  px(ctx, c, x + 1, by - 8, w - 2, 7)
  px(ctx, shade(c, 0.2), x + 2, by - 8, w - 4, 2)
  px(ctx, shade(c, -0.4), x + 2, by - 11, w - 4, 2)
  px(ctx, shade(c, -0.2), x + Math.floor(w / 2) - 1, by - 6, 3, 2)
}

function wheel(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.fillStyle = '#26232a'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = STEEL_D
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(1, r * 0.45), 0, Math.PI * 2)
  ctx.fill()
}

function steam(ctx: Ctx, x: number, y: number, t: number, s: number) {
  for (let i = 0; i < 2; i++) {
    const ph = (t / 900 + i * 0.5 + (s % 7) * 0.13) % 1
    if (ph > 0.85) continue
    const a = 0.65 * (1 - ph)
    px(ctx, `rgba(255,255,255,${a.toFixed(2)})`, x + Math.round(Math.sin(ph * 6 + i) * 1.5), y - ph * 10, 2, 2)
  }
}

// --- ground -----------------------------------------------------------------------------

/** Paints the whole interior floor (walls are drawn on top of it as locations). */
export function drawInteriorGround(ctx: Ctx, world: World, pal: Palette) {
  const env = envOf(world)
  if (!env) return
  const p = envPal(pal)
  const seed = seedOf(world.slug)
  const W = world.map.cols * TILE
  const H = world.map.rows * TILE
  switch (env) {
    case 'cafe':
    case 'shop':
      planks(ctx, W, H, p.floor, seed, env === 'cafe' ? 6 : 5, env === 'cafe' ? 40 : 32)
      break
    case 'workshop':
      planks(ctx, W, H, p.floor, seed, 8, 48)
      break
    case 'kitchen':
      checker(ctx, W, H, p.floor, mix(p.floor, p.trim, 0.22), 8)
      break
    case 'clinic':
      checker(ctx, W, H, p.floor, shade(p.floor, -0.04), 16)
      break
    case 'office':
      carpet(ctx, W, H, p.floor, seed)
      break
    case 'garage':
    case 'warehouse':
      concrete(ctx, W, H, p.floor, seed)
      break
  }
  const ground = world.map.ground ?? []
  // Entrance runner from the door to the middle of the room.
  const doorX = (ground[world.map.rows - 2] ?? '').indexOf('p')
  if ((env === 'cafe' || env === 'shop' || env === 'office') && doorX > 0) {
    const sy = world.map.spawn[1]
    const runner = mix(p.accent, p.trim, 0.45)
    px(ctx, shade(runner, -0.25), doorX * TILE + 2, sy * TILE + 2, TILE - 4, (world.map.rows - 1 - sy) * TILE - 2)
    px(ctx, runner, doorX * TILE + 3, sy * TILE + 3, TILE - 6, (world.map.rows - 1 - sy) * TILE - 3)
    for (let y = sy * TILE + 6; y < (world.map.rows - 1) * TILE - 2; y += 6) px(ctx, shade(runner, 0.2), doorX * TILE + 5, y, TILE - 10, 1)
  }
  // Shade cast by the back wall, and daylight from its windows.
  px(ctx, 'rgba(40,26,14,0.16)', 0, 2 * TILE, W, 3)
  px(ctx, 'rgba(40,26,14,0.08)', 0, 2 * TILE + 3, W, 2)
  for (const slot of backWallLayout(world)) {
    if (slot.kind !== 'window') continue
    for (let i = 0; i < 22; i++) {
      const a = 0.13 * (1 - i / 22)
      px(ctx, `rgba(255,244,210,${a.toFixed(3)})`, slot.x * TILE + 3 + i * 0.5, 2 * TILE + i, slot.w * TILE - 6, 1)
    }
  }
}

function planks(ctx: Ctx, W: number, H: number, floor: string, seed: number, rowH: number, len: number) {
  for (let y = 0, row = 0; y < H; y += rowH, row++) {
    const off = Math.floor(hash(row, seed, 1) * len)
    for (let x = -off, b = 0; x < W; x += len, b++) {
      const c = shade(floor, (hash(row, b, seed) - 0.5) * 0.07)
      px(ctx, c, x, y, len, rowH)
      px(ctx, shade(c, 0.07), x, y, len, 1)
      px(ctx, shade(floor, -0.2), x, y, 1, rowH - 1)
      if (hash(b, row, seed + 7) < 0.5) px(ctx, shade(c, -0.07), x + 5 + Math.floor(hash(b, row, 3) * (len - 14)), y + Math.floor(rowH / 2), 5, 1)
      if (hash(b, row, seed + 8) < 0.12) px(ctx, shade(c, -0.18), x + 3 + Math.floor(hash(row, b, 4) * (len - 8)), y + 2, 1, 1)
    }
    px(ctx, shade(floor, -0.22), 0, y + rowH - 1, W, 1)
  }
}

function checker(ctx: Ctx, W: number, H: number, a: string, b: string, size: number) {
  for (let y = 0; y < H; y += size)
    for (let x = 0; x < W; x += size) {
      const c = ((x + y) / size) % 2 ? b : a
      px(ctx, c, x, y, size, size)
      px(ctx, shade(c, 0.08), x, y, size, 1)
    }
  for (let y = 0; y < H; y += size) px(ctx, shade(a, -0.16), 0, y + size - 1, W, 1)
  for (let x = 0; x < W; x += size) px(ctx, shade(a, -0.16), x + size - 1, 0, 1, H)
}

function carpet(ctx: Ctx, W: number, H: number, floor: string, seed: number) {
  for (let y = 0; y < H; y += 32)
    for (let x = 0; x < W; x += 32) px(ctx, shade(floor, ((x + y) / 32) % 2 ? 0.03 : -0.03), x, y, 32, 32)
  for (let i = 0; i < (W * H) / 40; i++) {
    const x = Math.floor(hash(i, 1, seed) * W)
    const y = Math.floor(hash(i, 2, seed) * H)
    px(ctx, shade(floor, hash(i, 3, seed) < 0.5 ? -0.1 : 0.1), x, y, 1, 1)
  }
}

function concrete(ctx: Ctx, W: number, H: number, floor: string, seed: number) {
  px(ctx, floor, 0, 0, W, H)
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(hash(i, 1, seed) * W)
    const y = Math.floor(hash(i, 2, seed) * H)
    px(ctx, shade(floor, (hash(i, 3, seed) - 0.5) * 0.1), x, y, 6 + Math.floor(hash(i, 4, seed) * 14), 3 + Math.floor(hash(i, 5, seed) * 6))
  }
  for (let i = 0; i < (W * H) / 50; i++) {
    const x = Math.floor(hash(i, 6, seed) * W)
    const y = Math.floor(hash(i, 7, seed) * H)
    px(ctx, shade(floor, hash(i, 8, seed) < 0.5 ? -0.12 : 0.1), x, y, 1, 1)
  }
  for (let x = 64; x < W; x += 64) px(ctx, shade(floor, -0.14), x, 0, 1, H)
  for (let y = 64; y < H; y += 64) px(ctx, shade(floor, -0.14), 0, y, W, 1)
}

// --- walls ------------------------------------------------------------------------------

interface WallSlot {
  x: number
  w: number
  kind: string
}

const WALL_DECOR: Record<EnvId, string[]> = {
  cafe: ['menu', 'frame', 'clock', 'shelfw'],
  kitchen: ['utensils', 'clock', 'shelfw'],
  shop: ['frame', 'sign', 'clock', 'frame'],
  garage: ['roller', 'poster', 'clock'],
  office: ['whiteboard', 'clock', 'frame'],
  clinic: ['cross', 'chart', 'clock'],
  workshop: ['saws', 'frame', 'clock'],
  warehouse: ['roller', 'exit', 'clock'],
}
const DECOR_W: Record<string, number> = { menu: 2, utensils: 2, whiteboard: 2, roller: 3, saws: 2, shelfw: 2, sign: 2 }

/** Windows and wall decorations along the back wall, skipping columns hidden behind tall furniture. */
function backWallLayout(world: World): WallSlot[] {
  const env = envOf(world)
  if (!env) return []
  const cols = world.map.cols
  const blocked = new Array(cols).fill(false)
  for (const l of world.map.locations) {
    if (l.tile[1] !== 2 || isFlat(l.icon)) continue
    for (let x = l.tile[0]; x < l.tile[0] + l.w; x++) blocked[x] = true
  }
  const seed = seedOf(world.slug)
  const decor = WALL_DECOR[env]
  const out: WallSlot[] = []
  let x = 2
  let i = 0
  while (x < cols - 2) {
    const kind = i % 2 === 0 ? 'window' : decor[Math.floor(hash(i, seed, 4) * decor.length)]
    const w = kind === 'window' ? (env === 'warehouse' ? 3 : 2) : (DECOR_W[kind] ?? 1)
    let free = x + w <= cols - 2
    for (let k = x; k < x + w && free; k++) if (blocked[k]) free = false
    if (free) {
      out.push({ x, w, kind })
      x += w + 1 + Math.floor(hash(i, seed, 6) * 2)
      i++
    } else x++
  }
  return out
}

function drawBackWall(ctx: Ctx, world: World, loc: MapLocation, p: EnvPal, env: EnvId, t: number) {
  const W = loc.w * TILE
  const top = loc.tile[1] * TILE
  const H = loc.h * TILE
  const wall = p.wall
  px(ctx, wall, 0, top, W, H)
  // wall surface pattern
  if (env === 'cafe' || env === 'shop') {
    for (let x = 3; x < W; x += 8) px(ctx, shade(wall, env === 'cafe' ? -0.05 : 0.06), x, top + 4, 3, H - 12)
    if (env === 'shop') for (let x = 6; x < W; x += 8) px(ctx, mix(wall, p.accent, 0.35), x, top + 9 + ((x / 8) % 2) * 6, 1, 1)
  } else if (env === 'kitchen' || env === 'clinic') {
    const tileC = env === 'kitchen' ? WHITE : shade(wall, -0.02)
    const from = env === 'kitchen' ? top + 14 : top + 18
    px(ctx, tileC, 0, from, W, top + H - 6 - from)
    for (let y = from; y < top + H - 6; y += 4) {
      px(ctx, shade(tileC, -0.12), 0, y, W, 1)
      for (let x = ((y - from) / 4) % 2 ? 0 : 4; x < W; x += 8) px(ctx, shade(tileC, -0.12), x, y, 1, 4)
    }
    if (env === 'clinic') px(ctx, p.trim, 0, from - 2, W, 2)
  } else if (env === 'garage') {
    for (let y = top + 4; y < top + H - 4; y += 6) {
      px(ctx, shade(wall, -0.14), 0, y, W, 1)
      for (let x = ((y - top) / 6) % 2 ? 0 : 8; x < W; x += 16) px(ctx, shade(wall, -0.14), x, y, 1, 6)
    }
  } else if (env === 'warehouse') {
    for (let x = 0; x < W; x += 4) px(ctx, shade(wall, -0.1), x, top + 4, 1, H - 8)
    for (let x = 2; x < W; x += 4) px(ctx, shade(wall, 0.1), x, top + 4, 1, H - 8)
  } else if (env === 'workshop') {
    for (let x = 0; x < W; x += 10) {
      px(ctx, shade(wall, (hash(x, 3, 9) - 0.5) * 0.1), x, top + 4, 10, H - 8)
      px(ctx, shade(wall, -0.22), x, top + 4, 1, H - 8)
    }
  }
  // cornice, wainscot, skirting
  px(ctx, shade(p.trim, -0.35), 0, top, W, 3)
  px(ctx, p.trim, 0, top + 3, W, 1)
  const wains = env === 'cafe' || env === 'office' || env === 'shop'
  if (wains) {
    const wc = mix(p.trim, p.wood, 0.4)
    px(ctx, wc, 0, top + H - 9, W, 7)
    px(ctx, shade(wc, 0.2), 0, top + H - 9, W, 1)
    for (let x = 6; x < W; x += 12) px(ctx, shade(wc, -0.2), x, top + H - 7, 1, 4)
  }
  px(ctx, shade(p.trim, -0.2), 0, top + H - 2, W, 2)
  for (const slot of backWallLayout(world)) wallDecor(ctx, slot, top, p, env, t)
  // side wall tops continue up the corners
  px(ctx, shade(p.trim, -0.45), 0, top, TILE, H)
  px(ctx, shade(p.trim, -0.45), W - TILE, top, TILE, H)
  px(ctx, shade(p.trim, -0.15), TILE - 2, top + 3, 2, H - 3)
  px(ctx, shade(p.trim, -0.15), W - TILE, top + 3, 2, H - 3)
}

function wallDecor(ctx: Ctx, slot: WallSlot, top: number, p: EnvPal, env: EnvId, t: number) {
  const x = slot.x * TILE
  const w = slot.w * TILE
  const s = slot.x * 7
  switch (slot.kind) {
    case 'window': {
      const wy = top + 6
      const wh = env === 'warehouse' ? 9 : 17
      px(ctx, shade(p.trim, -0.3), x + 2, wy, w - 4, wh)
      px(ctx, SKY, x + 4, wy + 2, w - 8, wh - 4)
      px(ctx, '#d9f0fa', x + 4, wy + 2, w - 8, 3)
      px(ctx, '#ffffff', x + 6, wy + 4, 3, 2)
      px(ctx, shade(p.trim, -0.3), x + w / 2 - 1, wy + 2, 2, wh - 4)
      if (wh > 10) px(ctx, shade(p.trim, -0.3), x + 4, wy + Math.floor(wh / 2), w - 8, 1)
      if (env !== 'warehouse' && env !== 'garage') {
        px(ctx, shade(p.trim, 0.15), x + 1, wy + wh, w - 2, 2)
        if (env === 'cafe' || env === 'shop' || env === 'clinic') {
          const cur = env === 'clinic' ? WHITE : p.accent
          px(ctx, cur, x + 2, wy - 1, 3, wh)
          px(ctx, cur, x + w - 5, wy - 1, 3, wh)
          px(ctx, shade(cur, -0.2), x + 3, wy - 1, 1, wh)
          px(ctx, shade(cur, -0.2), x + w - 4, wy - 1, 1, wh)
          px(ctx, shade(p.trim, -0.3), x, wy - 2, w, 1)
        }
        if (hash(s, 1, 2) < 0.5) plantPot(ctx, x + w - 10, wy + wh, false, s)
      }
      return
    }
    case 'clock': {
      const cx = x + 8
      const cy = top + 12
      px(ctx, LINE, cx - 5, cy - 5, 10, 10)
      px(ctx, WHITE, cx - 4, cy - 4, 8, 8)
      const a = (t / 4000) % (Math.PI * 2)
      px(ctx, LINE, cx, cy - 3, 1, 3)
      px(ctx, LINE, cx + Math.round(Math.cos(a) * 2), cy + Math.round(Math.sin(a) * 2), 1, 1)
      px(ctx, p.accent, cx - 1, cy - 5, 2, 1)
      return
    }
    case 'frame': {
      const fy = top + 7
      px(ctx, shade(p.wood, -0.3), x + 2, fy, 12, 11)
      px(ctx, '#bfe3f5', x + 4, fy + 2, 8, 7)
      px(ctx, '#8cbf5a', x + 4, fy + 6, 8, 3)
      px(ctx, GOODS[s % GOODS.length], x + 9, fy + 3, 2, 2)
      return
    }
    case 'menu':
    case 'whiteboard': {
      const board = slot.kind === 'menu' ? '#2f3a33' : WHITE
      const ink = slot.kind === 'menu' ? '#e8efe8' : '#5e8fc9'
      px(ctx, slot.kind === 'menu' ? shade(p.wood, -0.3) : STEEL_D, x + 2, top + 5, w - 4, 18)
      px(ctx, board, x + 3, top + 6, w - 6, 16)
      for (let i = 0; i < 4; i++) px(ctx, i === 0 ? p.accent : ink, x + 6, top + 9 + i * 3, w - 14 - ((i * 5) % 9), 1)
      if (slot.kind === 'whiteboard') px(ctx, STEEL_D, x + 4, top + 22, w - 8, 1)
      return
    }
    case 'shelfw': {
      px(ctx, shade(p.wood, -0.1), x + 2, top + 17, w - 4, 2)
      px(ctx, shade(p.wood, -0.35), x + 4, top + 19, 2, 2)
      px(ctx, shade(p.wood, -0.35), x + w - 6, top + 19, 2, 2)
      if (env === 'cafe') for (let i = 0; i < 5; i++) cup(ctx, x + 4 + i * 5, top + 17, GOODS[(s + i) % GOODS.length])
      else goods(ctx, x + 3, top + 17, w - 6, 'jars', s, 6)
      return
    }
    case 'utensils': {
      px(ctx, STEEL_D, x + 2, top + 6, w - 4, 1)
      for (let i = 0; i < 5; i++) {
        const ux = x + 5 + i * 5
        px(ctx, STEEL_DD, ux, top + 7, 1, 4 + (i % 2) * 3)
        if (i % 2) px(ctx, DARK, ux - 2, top + 13, 5, 3)
        else px(ctx, STEEL, ux - 1, top + 11, 3, 2)
      }
      return
    }
    case 'sign': {
      px(ctx, shade(p.accent, -0.35), x + 3, top + 6, w - 6, 10)
      px(ctx, p.accent, x + 4, top + 7, w - 8, 8)
      px(ctx, WHITE, x + 8, top + 10, w - 16, 2)
      return
    }
    case 'roller': {
      px(ctx, shade(p.trim, -0.2), x, top + 4, w, 28)
      px(ctx, STEEL, x + 2, top + 6, w - 4, 26)
      for (let y = top + 8; y < top + 32; y += 3) px(ctx, STEEL_D, x + 2, y, w - 4, 1)
      px(ctx, '#e2b84a', x, top + 4, 2, 28)
      px(ctx, '#e2b84a', x + w - 2, top + 4, 2, 28)
      return
    }
    case 'poster': {
      px(ctx, LINE, x + 3, top + 6, 10, 13)
      px(ctx, p.accent, x + 4, top + 7, 8, 11)
      px(ctx, WHITE, x + 5, top + 9, 6, 3)
      return
    }
    case 'cross':
    case 'exit': {
      const c = slot.kind === 'cross' ? '#4fa59a' : '#3f9a4a'
      px(ctx, LINE, x + 3, top + 7, 10, 10)
      px(ctx, WHITE, x + 4, top + 8, 8, 8)
      if (slot.kind === 'cross') {
        px(ctx, c, x + 7, top + 9, 2, 6)
        px(ctx, c, x + 5, top + 11, 6, 2)
      } else {
        px(ctx, c, x + 4, top + 8, 8, 8)
        px(ctx, WHITE, x + 6, top + 10, 2, 4)
        px(ctx, WHITE, x + 8, top + 11, 2, 1)
      }
      return
    }
    case 'chart': {
      px(ctx, LINE, x + 3, top + 5, 10, 15)
      px(ctx, WHITE, x + 4, top + 6, 8, 13)
      for (let i = 0; i < 5; i++) px(ctx, LINE, x + 8 - (4 - i) / 2, top + 8 + i * 2, Math.max(1, 5 - i), 1)
      return
    }
    case 'saws': {
      px(ctx, shade(p.wood, -0.3), x + 2, top + 7, w - 4, 1)
      px(ctx, STEEL, x + 5, top + 8, 10, 5)
      px(ctx, shade(p.wood, -0.1), x + 3, top + 8, 3, 5)
      px(ctx, STEEL_DD, x + 19, top + 8, 2, 8)
      px(ctx, shade(p.wood, -0.1), x + 18, top + 15, 4, 3)
      px(ctx, STEEL_DD, x + 25, top + 8, 4, 2)
      px(ctx, shade(p.wood, -0.1), x + 26, top + 10, 2, 6)
      return
    }
  }
}

function drawWallTop(ctx: Ctx, loc: MapLocation, p: EnvPal) {
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  const w = loc.w * TILE
  const h = loc.h * TILE
  px(ctx, shade(p.trim, -0.45), x, y, w, h)
  const side = loc.w === 1
  if (side) px(ctx, shade(p.trim, -0.15), loc.tile[0] === 0 ? x + w - 2 : x, y, 2, h)
  else px(ctx, shade(p.trim, -0.15), x, y, w, 2)
}

function drawDoor(ctx: Ctx, loc: MapLocation, p: EnvPal) {
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  px(ctx, shade(p.trim, -0.45), x, y, TILE, TILE)
  px(ctx, '#f6e6c0', x + 2, y + 2, TILE - 4, TILE - 2)
  px(ctx, 'rgba(255,244,210,0.6)', x + 3, y + 3, TILE - 6, TILE - 3)
  px(ctx, shade(p.trim, -0.1), x + 1, y, TILE - 2, 2)
  px(ctx, mix(p.accent, p.trim, 0.3), x + 2, y - 5, TILE - 4, 5)
  px(ctx, shade(mix(p.accent, p.trim, 0.3), 0.2), x + 3, y - 4, TILE - 6, 1)
}

// --- furniture --------------------------------------------------------------------------

type Draw = (ctx: Ctx, b: Box, p: EnvPal, t: number, s: number) => void

const stone = (p: EnvPal) => mix('#e4ddd2', p.wall, 0.3)

const FURNITURE: Record<string, Draw> = {
  // cafe
  espresso: (ctx, b, p, t, s) => {
    const top = counter(ctx, b, stone(p), shade(p.trim, 0.2))
    const base = top.y + 10
    const mw = Math.min(26, b.w - 16)
    const mx = Math.round(b.x + b.w / 2 - mw / 2)
    box(ctx, mx, base - 16, mw, 16, STEEL)
    px(ctx, p.accent, mx + 1, base - 15, mw - 2, 3)
    for (let i = 0; i < 4; i++) cup(ctx, mx + 2 + i * 6, base - 16, i % 2 ? WHITE : shade(p.accent, 0.4))
    px(ctx, DARK, mx + 2, base - 11, mw - 4, 4)
    px(ctx, WHITE, mx + 4, base - 10, 2, 2)
    px(ctx, WHITE, mx + mw - 6, base - 10, 2, 2)
    for (const gx of [mx + 6, mx + mw - 10]) {
      px(ctx, STEEL_DD, gx, base - 6, 4, 2)
      px(ctx, LINE, gx - 3, base - 5, 3, 1)
      px(ctx, WHITE, gx, base - 3, 4, 2)
    }
    px(ctx, STEEL_DD, mx + 2, base - 2, mw - 4, 1)
    px(ctx, STEEL_D, mx + mw, base - 9, 1, 6)
    steam(ctx, mx + mw - 1, base - 9, t, s)
    // grinder at the side
    const gx = b.x + 4
    px(ctx, LINE, gx, base - 15, 6, 4)
    px(ctx, '#7a4a2a', gx + 1, base - 14, 4, 3)
    box(ctx, gx + 1, base - 11, 4, 9, DARK)
    if (b.w >= 48) cup(ctx, b.x + b.w - 8, base - 2, WHITE)
  },
  grinder: (ctx, b, p, _t, s) => {
    const top = counter(ctx, b, stone(p), shade(p.trim, 0.2))
    const base = top.y + 10
    for (const [i, gx] of [b.x + 6, b.x + b.w - 16].entries()) {
      px(ctx, LINE, gx, base - 18, 9, 6)
      px(ctx, GLASS, gx + 1, base - 17, 7, 4)
      px(ctx, '#6b3f22', gx + 1, base - 15 + i, 7, 2 - i)
      box(ctx, gx + 1, base - 12, 7, 11, i ? p.accent : DARK)
      px(ctx, STEEL_DD, gx + 3, base - 6, 3, 2)
    }
    sack(ctx, b.x + b.w / 2 - 5, base + 1, 10, mix(SACK, '#8a5a32', 0.3))
    px(ctx, p.accent, b.x + b.w / 2 - 2, base - 6, 4, 2)
    void s
  },
  brewbar: (ctx, b, p, t, s) => {
    const top = counter(ctx, b, mix(p.wood, '#ffffff', 0.25), shade(p.trim, 0.2))
    const base = top.y + 10
    const n = Math.max(2, Math.floor((b.w - 16) / 14))
    for (let i = 0; i < n; i++) {
      const dx = b.x + 8 + i * 14
      px(ctx, STEEL_DD, dx, base - 14, 1, 14)
      px(ctx, STEEL_DD, dx + 9, base - 14, 1, 14)
      px(ctx, STEEL_DD, dx, base - 14, 10, 1)
      px(ctx, LINE, dx + 2, base - 13, 6, 4)
      px(ctx, WHITE, dx + 3, base - 13, 4, 2)
      px(ctx, LINE, dx + 2, base - 6, 6, 6)
      px(ctx, GLASS, dx + 3, base - 5, 4, 4)
      px(ctx, '#6b3f22', dx + 3, base - 3, 4, 2)
      if (i === 0) steam(ctx, dx + 4, base - 14, t, s)
    }
    // kettle
    const kx = b.x + b.w - 12
    box(ctx, kx, base - 8, 8, 8, DARK)
    px(ctx, DARK, kx - 3, base - 9, 4, 1)
    px(ctx, DARK, kx - 4, base - 11, 1, 3)
    px(ctx, p.accent, kx + 2, base - 10, 4, 2)
  },
  pastry: (ctx, b, p) => {
    const top = counter(ctx, b, stone(p), shade(p.trim, 0.2), { faceH: 13 })
    // glass case on top
    const cx = b.x + 4
    const cw = b.w - 8
    px(ctx, LINE, cx, top.y - 8, cw, top.h + 9)
    px(ctx, GLASS, cx + 1, top.y - 7, cw - 2, top.h + 7)
    px(ctx, '#e7f5fa', cx + 2, top.y - 6, 3, top.h + 4)
    const items = ['#e8b48a', '#f7a6b8', '#7a4a2a', '#f2c14e', '#efe0c8']
    for (let i = 0, x = cx + 6; x < cx + cw - 7; i++, x += 8) {
      const c = items[i % items.length]
      px(ctx, WHITE, x - 1, top.y + top.h - 3, 7, 1)
      px(ctx, shade(c, -0.3), x, top.y + top.h - 7, 5, 4)
      px(ctx, c, x, top.y + top.h - 8, 5, 3)
      px(ctx, '#e8574a', x + 2, top.y + top.h - 9, 1, 1)
    }
    // front face glass row of cakes
    const fy = b.y + b.h - 13
    px(ctx, GLASS, b.x + 3, fy, b.w - 6, 8)
    for (let x = b.x + 6; x < b.x + b.w - 8; x += 9) {
      px(ctx, '#d39a6a', x, fy + 3, 6, 4)
      px(ctx, '#fbf0dc', x, fy + 2, 6, 2)
    }
  },
  till: (ctx, b, p, _t, s) => {
    const top = counter(ctx, b, mix(p.wood, '#ffffff', 0.2), shade(p.trim, 0.15))
    const base = top.y + 9
    const rx = b.x + Math.round(b.w * 0.3)
    box(ctx, rx, base - 10, 16, 10, DARK)
    px(ctx, '#9fe0a8', rx + 2, base - 9, 7, 3)
    for (let i = 0; i < 3; i++) px(ctx, STEEL, rx + 2 + i * 3, base - 5, 2, 2)
    px(ctx, STEEL_DD, rx + 1, base - 2, 14, 1)
    box(ctx, rx + 18, base - 6, 5, 6, STEEL_DD)
    px(ctx, '#9fe0a8', rx + 19, base - 5, 3, 1)
    // tip jar + menu card
    px(ctx, LINE, b.x + b.w - 14, base - 7, 5, 7)
    px(ctx, GLASS, b.x + b.w - 13, base - 6, 3, 5)
    px(ctx, GOLD, b.x + b.w - 13, base - 3, 3, 2)
    px(ctx, p.accent, b.x + 6, base - 9, 7, 9)
    px(ctx, WHITE, b.x + 7, base - 8, 5, 1)
    px(ctx, WHITE, b.x + 7, base - 6, 4, 1)
    void s
  },
  counter: (ctx, b, p, _t, s) => {
    const top = counter(ctx, b, mix(p.wood, '#ffffff', 0.2), shade(p.trim, 0.15))
    const base = top.y + 9
    px(ctx, GOLD, b.x + b.w / 2 - 3, base - 3, 6, 3)
    px(ctx, shade(GOLD, -0.3), b.x + b.w / 2 - 1, base - 5, 2, 2)
    for (let i = 0; i < 3; i++) cup(ctx, b.x + 6 + i * 6, base, GOODS[(s + i) % GOODS.length])
    plantPot(ctx, b.x + b.w - 10, base + 1, false, s)
  },
  // kitchen
  prep: (ctx, b, _p, _t, s) => {
    const top = counter(ctx, b, STEEL_L, STEEL, { panels: true })
    const base = top.y + 10
    px(ctx, LINE, b.x + 5, base - 6, 18, 6)
    px(ctx, '#d9a86a', b.x + 6, base - 5, 16, 4)
    px(ctx, '#e8574a', b.x + 8, base - 6, 3, 3)
    px(ctx, '#8cbf5a', b.x + 13, base - 5, 4, 2)
    px(ctx, '#f2c14e', b.x + 18, base - 6, 2, 3)
    px(ctx, STEEL_DD, b.x + 24, base - 4, 8, 1)
    px(ctx, LINE, b.x + 31, base - 5, 3, 2)
    px(ctx, LINE, b.x + b.w - 14, base - 6, 10, 6)
    px(ctx, WHITE, b.x + b.w - 13, base - 5, 8, 3)
    px(ctx, GOODS[s % GOODS.length], b.x + b.w - 11, base - 6, 4, 2)
  },
  pot: (ctx, b, _p, t, s) => FURNITURE.stove(ctx, b, _p, t, s),
  stove: (ctx, b, p, t, s) => {
    const top = counter(ctx, b, DARK, STEEL, { faceH: 13 })
    const n = Math.max(2, Math.floor(b.w / 16))
    for (let i = 0; i < n; i++) {
      const cx = b.x + 6 + i * ((b.w - 12) / n)
      px(ctx, '#26232a', cx, top.y + 3, 10, 6)
      const f = Math.floor(t / 140 + i) % 2
      px(ctx, '#5e8fc9', cx + 2, top.y + 6 - f, 6, 1 + f)
      if (i % 2 === 0) {
        box(ctx, cx, top.y - 3, 10, 7, STEEL_DD)
        px(ctx, STEEL, cx + 1, top.y - 3, 8, 2)
        steam(ctx, cx + 4, top.y - 4, t, s + i)
      } else {
        px(ctx, LINE, cx - 1, top.y + 1, 9, 4)
        px(ctx, DARK, cx, top.y + 2, 7, 2)
        px(ctx, LINE, cx + 8, top.y + 2, 5, 1)
      }
    }
    const fy = b.y + b.h - 13
    px(ctx, '#26232a', b.x + 5, fy + 2, b.w - 10, 7)
    px(ctx, `rgba(242,${150 + Math.floor(Math.sin(t / 300) * 30)},78,0.85)`, b.x + 7, fy + 4, b.w - 14, 3)
    for (let i = 0; i < n; i++) px(ctx, p.accent, b.x + 6 + i * ((b.w - 12) / n) + 3, fy, 3, 1)
  },
  mixer: (ctx, b, p, _t, s) => {
    const top = counter(ctx, b, STEEL_L, STEEL)
    const base = top.y + 10
    const mx = b.x + Math.round(b.w / 2) - 6
    px(ctx, LINE, mx, base - 2, 14, 2)
    box(ctx, mx + 1, base - 17, 5, 15, p.accent)
    box(ctx, mx + 1, base - 19, 13, 6, p.accent)
    px(ctx, STEEL_DD, mx + 9, base - 13, 1, 4)
    box(ctx, mx + 6, base - 9, 8, 7, STEEL)
    sack(ctx, b.x + 5, base + 1, 9, '#efe6d2')
    px(ctx, LINE, b.x + b.w - 13, base - 5, 9, 5)
    px(ctx, WHITE, b.x + b.w - 12, base - 4, 7, 3)
    void s
  },
  oven: (ctx, b, p, t) => {
    const rise = 10
    const r = tallUnit(ctx, b, rise, mix('#a0503a', p.trim, 0.25))
    for (let y = r.y - 2; y < r.y + 6; y += 3) px(ctx, shade('#a0503a', -0.2), b.x + 3, y, b.w - 6, 1)
    const doors = Math.max(1, Math.floor(b.w / 24))
    const dw = Math.floor((r.w - (doors - 1) * 3) / doors)
    for (let i = 0; i < doors; i++) {
      const dx = r.x + i * (dw + 3)
      px(ctx, STEEL_DD, dx, r.y + 7, dw, r.h - 9)
      px(ctx, '#7a2f14', dx + 2, r.y + 9, dw - 4, r.h - 15)
      const g = 0.7 + 0.3 * Math.sin(t / 400 + i * 1.7)
      px(ctx, `rgba(242,150,58,${g.toFixed(2)})`, dx + 3, r.y + 10, dw - 6, r.h - 17)
      px(ctx, `rgba(255,214,120,${(g * 0.9).toFixed(2)})`, dx + 4, r.y + r.h - 12, dw - 8, 3)
      px(ctx, '#d9a86a', dx + 5, r.y + r.h - 14, Math.max(3, dw - 12), 3)
      px(ctx, STEEL, dx + 2, r.y + r.h - 5, dw - 4, 1)
    }
  },
  pantry: (ctx, b, _p, _t, s) => {
    const body = '#8a5a32'
    const r = tallUnit(ctx, b, b.h > 16 ? 14 : 16, body)
    shelves(ctx, r, body, 8, s, 'jars')
    if (b.w >= 48) sack(ctx, b.x + b.w - 14, b.y + b.h - 2, 10)
  },
  shelf: (ctx, b, p, _t, s) => {
    const body = shade(p.wood, -0.05)
    const r = tallUnit(ctx, b, b.h > 16 ? 12 : 16, body)
    shelves(ctx, r, body, 8, s, 'mixed')
  },
  pass: (ctx, b, p, t, s) => {
    const top = counter(ctx, b, STEEL_L, STEEL)
    const n = Math.max(2, Math.floor(b.w / 16))
    for (let i = 0; i < n; i++) {
      const lx = b.x + 6 + i * ((b.w - 12) / n)
      px(ctx, STEEL_DD, lx + 4, b.y - 12, 1, 6)
      px(ctx, DARK, lx, b.y - 7, 9, 3)
      const g = 0.25 + 0.15 * Math.sin(t / 500 + i)
      px(ctx, `rgba(255,170,90,${g.toFixed(2)})`, lx - 1, b.y - 4, 11, top.y - b.y + 8)
      px(ctx, WHITE, lx, top.y + 4, 9, 3)
      px(ctx, GOODS[(s + i) % GOODS.length], lx + 2, top.y + 3, 5, 2)
    }
    for (let i = 0; i < 3; i++) px(ctx, PAPER, b.x + 6 + i * 6, top.y - 1, 4, 5)
    void p
  },
  // shop
  workbench_shop: (ctx, b, p, _t, s) => {
    const top = counter(ctx, b, mix(p.wood, '#ffffff', 0.3), shade(p.wood, -0.1), { faceH: 9 })
    const base = top.y + 10
    px(ctx, LINE, b.x + 4, base - 6, 12, 6)
    px(ctx, '#f0e2c4', b.x + 5, base - 5, 10, 4)
    px(ctx, shade(p.accent, -0.2), b.x + 4, base - 4, 12, 1)
    for (let i = 0; i < 3; i++) {
      const sx = b.x + b.w / 2 - 6 + i * 5
      px(ctx, LINE, sx, base - 4, 4, 4)
      px(ctx, GOODS[(s + i * 2) % GOODS.length], sx + 1, base - 3, 2, 2)
    }
    px(ctx, STEEL_DD, b.x + b.w - 12, base - 5, 6, 1)
    px(ctx, p.accent, b.x + b.w - 8, base - 6, 3, 3)
    bundle(ctx, b.x + b.w / 2 + 10, base - 1, s)
  },
  display: (ctx, b, p, _t, s) => {
    if (b.w <= TILE) {
      shadow(ctx, b.x + 1, b.y + 15, 14)
      px(ctx, LINE, b.x + 2, b.y + 6, 12, 9)
      px(ctx, shade(p.wood, 0.2), b.x + 3, b.y + 7, 10, 3)
      px(ctx, shade(p.wood, -0.1), b.x + 3, b.y + 10, 10, 4)
      bundle(ctx, b.x + 8, b.y + 8, s)
      return
    }
    const top = counter(ctx, b, mix(p.wood, '#ffffff', 0.25), shade(p.wood, -0.05), { faceH: 9 })
    px(ctx, LINE, b.x + 6, top.y - 2, b.w - 12, 4)
    px(ctx, shade(p.wood, 0.35), b.x + 7, top.y - 1, b.w - 14, 2)
    for (let i = 0, x = b.x + 8; x < b.x + b.w - 8; i++, x += 8) bundle(ctx, x + 2, top.y - 2 + (i % 2) * 10, s + i)
  },
  sink: (ctx, b, _p, _t, s) => {
    const top = counter(ctx, b, STEEL_L, STEEL)
    const sx = b.x + 6
    const sw = Math.min(22, b.w - 20)
    px(ctx, STEEL_DD, sx, top.y + 2, sw, top.h - 3)
    px(ctx, '#8fc9ec', sx + 1, top.y + 4, sw - 2, top.h - 6)
    px(ctx, '#c4e6f6', sx + 2, top.y + 4, 4, 1)
    px(ctx, STEEL_DD, sx + sw / 2 - 1, top.y - 6, 2, 8)
    px(ctx, STEEL_DD, sx + sw / 2 - 1, top.y - 6, 6, 2)
    // buckets on the side
    const bx = b.x + b.w - 13
    px(ctx, LINE, bx, top.y - 2, 9, 9)
    px(ctx, '#5e8fc9', bx + 1, top.y - 1, 7, 7)
    px(ctx, '#8fc9ec', bx + 1, top.y - 1, 7, 2)
    bundle(ctx, bx + 4, top.y - 2, s)
  },
  cooler: (ctx, b, p, _t, s) => {
    const r = tallUnit(ctx, b, b.h > 16 ? 14 : 16, STEEL_L)
    px(ctx, '#d9eef7', r.x, r.y, r.w, r.h)
    const doors = Math.max(1, Math.round(r.w / 14))
    for (let i = 1; i < doors; i++) px(ctx, STEEL_D, r.x + (i * r.w) / doors, r.y, 1, r.h)
    for (let by = r.y + 8; by < r.y + r.h; by += 8) {
      px(ctx, STEEL, r.x, by, r.w, 1)
      for (let x = r.x + 1; x < r.x + r.w - 4; x += 5) bundle(ctx, x + 2, by, s + x + by)
    }
    px(ctx, '#ffffff', r.x + 1, r.y + 1, 2, r.h - 2)
    px(ctx, p.accent, b.x + 2, b.y - (b.h > 16 ? 14 : 16) + 1, b.w - 4, 2)
  },
  // garage
  workbench: (ctx, b, p, _t, s) => {
    const top = counter(ctx, b, mix(p.wood, '#ffffff', 0.15), shade(p.wood, -0.25), { faceH: 8, panels: false })
    const base = top.y + 10
    // legs + lower shelf
    px(ctx, shade(p.wood, -0.45), b.x + 3, b.y + b.h - 9, 2, 7)
    px(ctx, shade(p.wood, -0.45), b.x + b.w - 5, b.y + b.h - 9, 2, 7)
    box(ctx, b.x + 6, b.y + b.h - 8, 8, 5, '#c0392b')
    // vise
    px(ctx, STEEL_DD, b.x + 5, base - 7, 8, 5)
    px(ctx, STEEL, b.x + 6, base - 6, 6, 1)
    px(ctx, STEEL_DD, b.x + 8, base - 9, 2, 2)
    // tools
    px(ctx, STEEL_DD, b.x + 18, base - 3, 10, 1)
    px(ctx, STEEL_DD, b.x + 17, base - 4, 2, 3)
    px(ctx, shade(p.wood, -0.3), b.x + 30, base - 3, 6, 2)
    px(ctx, STEEL_DD, b.x + 35, base - 5, 2, 5)
    px(ctx, GOODS[s % GOODS.length], b.x + b.w - 10, base - 6, 5, 6)
  },
  parts_washer: (ctx, b) => {
    const top = counter(ctx, b, STEEL_DD, '#c0392b', { faceH: 12 })
    px(ctx, STEEL_D, top.x + 3, top.y + 1, top.w - 6, top.h - 2)
    px(ctx, '#5e8fc9', top.x + 4, top.y + 2, top.w - 8, top.h - 4)
    px(ctx, '#8fc9ec', top.x + 6, top.y + 3, 6, 1)
    px(ctx, STEEL_DD, top.x + top.w - 10, top.y - 8, 2, 10)
    px(ctx, STEEL_DD, top.x + top.w - 14, top.y - 8, 6, 2)
    px(ctx, '#e2b84a', top.x + 10, top.y - 4, 2, 6)
    px(ctx, '#e2b84a', top.x + 8, top.y - 5, 6, 2)
  },
  lift: (ctx, b, p, _t, s) => {
    const bottom = b.y + b.h - 2
    px(ctx, STEEL_DD, b.x + 4, bottom - 2, b.w - 8, 2)
    for (const postX of [b.x + 3, b.x + b.w - 8]) {
      box(ctx, postX, b.y - 6, 5, bottom - b.y + 6, '#3f7fb4')
      px(ctx, '#e2b84a', postX + 1, b.y + 6, 3, 2)
    }
    // raised car
    const cy = b.y + 10
    carSide(ctx, b.x + 9, cy, b.w - 18, GOODS[(s + 2) % GOODS.length])
    px(ctx, '#e2b84a', b.x + 7, cy + 2, b.w - 14, 2)
    for (let x = b.x + 8; x < b.x + b.w - 8; x += 6) px(ctx, LINE, x, cy + 2, 3, 2)
    shadow(ctx, b.x + 10, bottom - 3, b.w - 20)
    void p
  },
  repair_stand: (ctx, b, p, _t, s) => {
    const bottom = b.y + b.h - 2
    shadow(ctx, b.x + 6, bottom, b.w - 12)
    const cx = b.x + b.w / 2
    px(ctx, STEEL_DD, cx - 1, b.y + 2, 2, bottom - b.y - 2)
    px(ctx, STEEL_DD, cx - 7, bottom - 1, 14, 2)
    px(ctx, STEEL_DD, cx - 1, b.y + 2, 6, 2)
    // bicycle
    const by = b.y + 4
    const r = Math.min(7, Math.floor(b.w / 7))
    const lx = cx - r * 2
    const rx = cx + r * 2
    ctx.strokeStyle = '#26232a'
    ctx.lineWidth = 1.5
    for (const wx of [lx, rx]) {
      ctx.beginPath()
      ctx.arc(wx, by + r, r, 0, Math.PI * 2)
      ctx.stroke()
      px(ctx, STEEL_D, wx - 1, by + r - 1, 2, 2)
    }
    ctx.strokeStyle = p.accent
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(lx, by + r)
    ctx.lineTo(cx - 1, by + r)
    ctx.lineTo(cx + r, by + 1)
    ctx.lineTo(lx + r, by + 1)
    ctx.lineTo(lx, by + r)
    ctx.moveTo(cx + r, by + 1)
    ctx.lineTo(rx, by + r)
    ctx.moveTo(lx + r, by + 1)
    ctx.lineTo(cx - 1, by + r)
    ctx.stroke()
    px(ctx, LINE, lx + r - 2, by - 1, 5, 2)
    px(ctx, LINE, cx + r - 1, by - 2, 2, 3)
    px(ctx, LINE, cx + r - 2, by - 3, 5, 1)
    void s
  },
  toolwall: (ctx, b, p, _t, s) => {
    const rise = b.h > 16 ? 16 : 18
    const top = b.y - rise
    px(ctx, LINE, b.x + 1, top, b.w - 2, rise + 6)
    const board = '#d9b98a'
    px(ctx, board, b.x + 2, top + 1, b.w - 4, rise + 4)
    for (let y = top + 3; y < b.y + 4; y += 3) for (let x = b.x + 4; x < b.x + b.w - 3; x += 3) px(ctx, shade(board, -0.2), x, y, 1, 1)
    const tools = Math.floor((b.w - 6) / 7)
    for (let i = 0; i < tools; i++) {
      const tx = b.x + 5 + i * 7
      const kind = (s + i) % 4
      if (kind === 0) {
        px(ctx, STEEL_DD, tx + 1, top + 4, 2, 10)
        px(ctx, STEEL_DD, tx, top + 3, 4, 2)
      } else if (kind === 1) {
        px(ctx, '#c0392b', tx + 1, top + 8, 2, 7)
        px(ctx, STEEL_DD, tx, top + 4, 4, 4)
      } else if (kind === 2) {
        px(ctx, '#e2b84a', tx + 1, top + 9, 2, 6)
        px(ctx, STEEL, tx + 1, top + 4, 2, 5)
      } else {
        px(ctx, STEEL_DD, tx, top + 5, 4, 1)
        px(ctx, STEEL_DD, tx + 1, top + 5, 1, 9)
      }
    }
    // bench under the board
    const bench: Box = { x: b.x, y: b.y + (b.h > 16 ? 0 : -6), w: b.w, h: b.h > 16 ? b.h : 22 }
    counter(ctx, bench, shade(p.wood, 0.2), shade(p.wood, -0.25), { faceH: b.h > 16 ? 9 : 7, panels: false })
  },
  drawers: (ctx, b, _p, _t, s) => {
    const r = tallUnit(ctx, { x: b.x + 2, y: b.y, w: b.w - 4, h: b.h }, 4, '#c0392b')
    const rows = Math.max(3, Math.floor(r.h / 5))
    for (let i = 0; i < rows; i++) {
      const y = r.y + i * (r.h / rows)
      px(ctx, shade('#c0392b', -0.3), r.x, y + r.h / rows - 1, r.w, 1)
      px(ctx, STEEL_L, r.x + r.w / 2 - 4, y + 1, 8, 1)
    }
    box(ctx, b.x + 8, b.y - 9, 14, 6, '#e2b84a')
    px(ctx, LINE, b.x + 13, b.y - 11, 4, 2)
    void s
  },
  // office
  desk: (ctx, b, p, t, s) => {
    const top = counter(ctx, b, shade(p.wood, 0.25), shade(p.wood, -0.1), { faceH: 9 })
    const base = top.y + 8
    monitor(ctx, b.x + b.w / 2 - 7, base, 14, t, s)
    px(ctx, LINE, b.x + b.w / 2 - 6, base + 2, 12, 2)
    px(ctx, STEEL_L, b.x + b.w / 2 - 5, base + 2, 10, 1)
    cup(ctx, b.x + b.w - 10, base + 2, GOODS[s % GOODS.length])
    px(ctx, PAPER, b.x + 5, base - 2, 8, 6)
    px(ctx, STEEL_D, b.x + 6, base, 6, 1)
    chairBack(ctx, b.x + b.w / 2 - 5, b.y + b.h + 2, p)
  },
  computer: (ctx, b, p, t, s) => {
    const top = counter(ctx, b, shade(p.wood, 0.25), shade(p.wood, -0.1), { faceH: 9 })
    const base = top.y + 8
    monitor(ctx, b.x + b.w / 2 - 16, base, 14, t, s)
    monitor(ctx, b.x + b.w / 2 + 2, base, 14, t, s + 1)
    px(ctx, LINE, b.x + b.w / 2 - 8, base + 2, 16, 2)
    box(ctx, b.x + b.w - 10, base - 12, 6, 14, DARK)
    px(ctx, '#9fe0a8', b.x + b.w - 8, base - 9, 2, 1)
  },
  printer: (ctx, b, p, t) => {
    const cx = b.x + b.w / 2 - 12
    shadow(ctx, cx, b.y + b.h - 1, 24)
    box(ctx, cx, b.y - 2, 24, b.h - 1, STEEL_L)
    px(ctx, STEEL_D, cx + 1, b.y + 6, 22, 1)
    px(ctx, STEEL_D, cx + 1, b.y + 14, 22, 1)
    px(ctx, DARK, cx + 3, b.y, 18, 4)
    px(ctx, PAPER, cx + 6, b.y - 4 - (Math.floor(t / 600) % 3), 12, 3)
    px(ctx, '#9fe0a8', cx + 19, b.y + 2, 2, 1)
    px(ctx, p.accent, cx + 2, b.y + 8, 3, 2)
  },
  filing: (ctx, b, p, _t, s) => {
    const n = Math.max(1, Math.floor(b.w / 14))
    const w = Math.floor((b.w - 2) / n)
    for (let i = 0; i < n; i++) {
      const r = tallUnit(ctx, { x: b.x + 1 + i * w, y: b.y, w, h: b.h }, b.h > 16 ? 6 : 12, mix(STEEL, p.trim, 0.25))
      const rows = 3
      for (let k = 0; k < rows; k++) {
        const y = r.y + k * (r.h / rows)
        px(ctx, shade(STEEL, -0.3), r.x - 1, y + r.h / rows - 1, r.w + 2, 1)
        px(ctx, PAPER, r.x + r.w / 2 - 2, y + 1, 4, 2)
        px(ctx, STEEL_DD, r.x + r.w / 2 - 2, y + 3, 4, 1)
      }
    }
    plantPot(ctx, b.x + 3, b.y - (b.h > 16 ? 6 : 12), false, s)
  },
  reception: (ctx, b, p, t, s) => {
    const top = counter(ctx, b, shade(p.wood, 0.3), WHITE, { faceH: 13, panels: false })
    const fy = b.y + b.h - 13
    px(ctx, p.accent, b.x + 2, fy + 4, b.w - 4, 3)
    monitor(ctx, b.x + b.w - 22, top.y + 8, 14, t, s)
    px(ctx, GOLD, b.x + 10, top.y + 3, 5, 3)
    px(ctx, shade(GOLD, -0.3), b.x + 12, top.y + 1, 1, 2)
    plantPot(ctx, b.x + 4, top.y + 6, false, s)
    px(ctx, PAPER, b.x + b.w / 2 - 6, top.y + 4, 8, 4)
  },
  meeting: (ctx, b, p, t, s) => {
    const tx = b.x + 6
    const tw = b.w - 12
    const ty = b.y + 8
    for (let x = tx + 3; x < tx + tw - 6; x += 12) {
      chairBack(ctx, x, ty - 1, p)
    }
    shadow(ctx, tx, b.y + b.h - 4, tw)
    px(ctx, LINE, tx, ty, tw, 14)
    px(ctx, shade(p.wood, 0.3), tx + 1, ty + 1, tw - 2, 10)
    px(ctx, shade(p.wood, 0.45), tx + 1, ty + 1, tw - 2, 1)
    px(ctx, shade(p.wood, -0.25), tx + 1, ty + 11, tw - 2, 2)
    for (let x = tx + 5; x < tx + tw - 8; x += 12) {
      px(ctx, PAPER, x, ty + 4, 6, 4)
      px(ctx, STEEL_D, x + 1, ty + 5, 4, 1)
    }
    monitor(ctx, tx + tw / 2 - 5, ty + 7, 10, t, s)
  },
  // clinic
  medcart: (ctx, b, p, _t, s) => {
    const cw = Math.min(b.w - 8, 28)
    const cx = b.x + (b.w - cw) / 2
    shadow(ctx, cx, b.y + b.h - 1, cw)
    box(ctx, cx, b.y + 4, cw, b.h - 8, WHITE)
    for (let i = 0; i < 3; i++) {
      px(ctx, [p.accent, '#5e8fc9', '#e2b84a'][i], cx + 2, b.y + 12 + i * 5, cw - 4, 3)
      px(ctx, WHITE, cx + cw / 2 - 2, b.y + 13 + i * 5, 4, 1)
    }
    wheel(ctx, cx + 3, b.y + b.h - 3, 2)
    wheel(ctx, cx + cw - 3, b.y + b.h - 3, 2)
    goods(ctx, cx + 2, b.y + 9, cw - 4, 'bottles', s, 7)
  },
  bed: (ctx, b, p) => {
    const by = b.h > 16 ? b.y + 4 : b.y - 2
    const bh = b.h > 16 ? b.h - 6 : 17
    shadow(ctx, b.x + 2, by + bh, b.w - 4)
    px(ctx, STEEL_DD, b.x + 2, by - 3, 3, bh + 3)
    px(ctx, LINE, b.x + 3, by + 2, b.w - 6, bh - 4)
    px(ctx, WHITE, b.x + 4, by + 3, b.w - 8, bh - 7)
    px(ctx, '#e6eef2', b.x + 6, by + 4, 9, 5)
    px(ctx, mix(p.accent, '#ffffff', 0.3), b.x + 16, by + 3, b.w - 20, bh - 7)
    px(ctx, shade(mix(p.accent, '#ffffff', 0.3), -0.15), b.x + 16, by + 3, 2, bh - 7)
    px(ctx, STEEL_DD, b.x + 4, by + bh - 4, b.w - 8, 2)
    if (b.w >= 40) {
      px(ctx, STEEL_DD, b.x + b.w - 4, by - 10, 1, bh + 6)
      px(ctx, '#d9eef7', b.x + b.w - 7, by - 10, 5, 6)
    }
  },
  cabinet: (ctx, b, p, _t, s) => {
    const r = tallUnit(ctx, b, b.h > 16 ? 12 : 16, WHITE)
    px(ctx, '#e3f1f4', r.x, r.y, r.w, r.h)
    for (let by = r.y + 7; by <= r.y + r.h; by += 7) {
      px(ctx, STEEL, r.x, by, r.w, 1)
      goods(ctx, r.x + 1, by, r.w - 2, (by / 7) % 2 ? 'bottles' : 'boxes', s + by, 6)
    }
    px(ctx, STEEL_D, r.x + r.w / 2, r.y, 1, r.h)
    px(ctx, '#ffffff', r.x + 1, r.y + 1, 1, r.h - 2)
    px(ctx, p.accent, b.x + b.w / 2 - 2, b.y - (b.h > 16 ? 12 : 16) + 2, 4, 2)
  },
  // workshop
  easel: (ctx, b, p, _t, s) => {
    const cx = b.x + b.w / 2
    shadow(ctx, cx - 9, b.y + b.h - 1, 18)
    px(ctx, shade(p.wood, -0.3), cx - 8, b.y - 6, 2, b.h + 4)
    px(ctx, shade(p.wood, -0.3), cx + 6, b.y - 6, 2, b.h + 4)
    px(ctx, shade(p.wood, -0.3), cx - 1, b.y - 10, 2, b.h + 8)
    px(ctx, LINE, cx - 9, b.y - 6, 18, 16)
    px(ctx, WHITE, cx - 8, b.y - 5, 16, 14)
    px(ctx, '#bfe3f5', cx - 8, b.y - 5, 16, 6)
    px(ctx, '#8cbf5a', cx - 8, b.y + 3, 16, 6)
    px(ctx, GOODS[s % GOODS.length], cx + 1, b.y - 2, 4, 4)
    px(ctx, shade(p.wood, -0.3), cx - 9, b.y + 10, 18, 2)
    // paint table
    if (b.w >= 40) {
      const tx = b.x + 2
      px(ctx, LINE, tx, b.y + 14, 10, 5)
      for (let i = 0; i < 3; i++) px(ctx, GOODS[(s + i) % GOODS.length], tx + 1 + i * 3, b.y + 15, 2, 2)
    }
  },
  kiln: (ctx, b, _p, t) => {
    const r = tallUnit(ctx, b, 10, '#a6684a')
    for (let y = r.y - 4; y < r.y + r.h; y += 4) {
      px(ctx, shade('#a6684a', -0.25), b.x + 2, y, b.w - 4, 1)
      for (let x = b.x + ((y / 4) % 2 ? 2 : 8); x < b.x + b.w - 2; x += 12) px(ctx, shade('#a6684a', -0.25), x, y, 1, 4)
    }
    const dx = b.x + b.w / 2 - 9
    px(ctx, '#26232a', dx, r.y + 4, 18, r.h - 6)
    const g = 0.6 + 0.3 * Math.sin(t / 350)
    px(ctx, `rgba(242,140,50,${g.toFixed(2)})`, dx + 2, r.y + 6, 14, r.h - 10)
    px(ctx, `rgba(255,220,120,${(g * 0.8).toFixed(2)})`, dx + 5, r.y + 8, 8, r.h - 14)
    px(ctx, STEEL_DD, b.x + b.w - 8, b.y - 16, 4, 8)
  },
  anvil: (ctx, b, p, t) => {
    const cx = b.x + b.w / 2
    shadow(ctx, cx - 8, b.y + b.h - 1, 16)
    px(ctx, shade(p.wood, -0.2), cx - 5, b.y + 10, 10, b.h - 11)
    px(ctx, shade(p.wood, 0.1), cx - 5, b.y + 10, 10, 2)
    px(ctx, '#55545a', cx - 9, b.y + 3, 18, 4)
    px(ctx, '#6d6c72', cx - 9, b.y + 3, 18, 1)
    px(ctx, '#55545a', cx - 3, b.y + 7, 6, 3)
    px(ctx, '#55545a', cx - 12, b.y + 4, 3, 2)
    if (b.w >= 40) {
      const fx = b.x + 3
      box(ctx, fx, b.y + 6, 10, b.h - 7, '#6d6c72')
      const g = 0.6 + 0.3 * Math.sin(t / 250)
      px(ctx, `rgba(242,120,40,${g.toFixed(2)})`, fx + 2, b.y + 8, 6, 4)
    }
  },
  worktable: (ctx, b, p, _t, s) => {
    if (b.w <= TILE) {
      shadow(ctx, b.x + 1, b.y + 15, 14)
      px(ctx, LINE, b.x + 1, b.y + 5, 14, 8)
      px(ctx, shade(p.wood, 0.25), b.x + 2, b.y + 6, 12, 4)
      px(ctx, shade(p.wood, -0.2), b.x + 2, b.y + 10, 12, 2)
      px(ctx, shade(p.wood, -0.4), b.x + 2, b.y + 12, 2, 3)
      px(ctx, shade(p.wood, -0.4), b.x + 12, b.y + 12, 2, 3)
      box(ctx, b.x + 5, b.y + 3, 6, 4, GOODS[s % GOODS.length])
      return
    }
    const top = counter(ctx, b, shade(p.wood, 0.25), shade(p.wood, -0.2), { faceH: 7, panels: false })
    px(ctx, CARD, top.x + 4, top.y + 2, 10, 6)
    px(ctx, shade(p.wood, -0.3), top.x + 18, top.y + 4, 12, 2)
    px(ctx, GOODS[s % GOODS.length], top.x + top.w - 10, top.y + 1, 5, 5)
  },
  // warehouse
  packing: (ctx, b, p, _t, s) => {
    const top = counter(ctx, b, shade(p.wood, 0.3), shade(p.wood, -0.15), { faceH: 8, panels: false })
    box(ctx, top.x + 4, top.y - 6, 12, 10, CARD)
    px(ctx, shade(CARD, 0.25), top.x + 5, top.y - 5, 10, 1)
    px(ctx, '#e2b84a', top.x + 9, top.y - 5, 2, 9)
    box(ctx, top.x + 18, top.y - 2, 9, 7, CARD)
    px(ctx, LINE, top.x + top.w - 12, top.y, 8, 5)
    px(ctx, '#d9eef7', top.x + top.w - 11, top.y + 1, 6, 3)
    px(ctx, '#c0392b', top.x + 30, top.y + 2, 5, 3)
    void s
  },
  conveyor: (ctx, b, _p, t) => {
    const by = b.y + 10
    shadow(ctx, b.x + 2, b.y + b.h - 1, b.w - 4)
    for (let x = b.x + 6; x < b.x + b.w - 4; x += 12) px(ctx, STEEL_DD, x, by + 8, 2, b.h - 18)
    px(ctx, LINE, b.x + 1, by, b.w - 2, 9)
    px(ctx, '#3d3a40', b.x + 2, by + 1, b.w - 4, 6)
    const o = Math.floor(t / 80) % 4
    for (let x = b.x + 2 + o; x < b.x + b.w - 3; x += 4) px(ctx, '#55525a', x, by + 1, 1, 6)
    px(ctx, '#e2b84a', b.x + 2, by + 7, b.w - 4, 1)
    const span = b.w - 16
    for (let i = 0; i < 2; i++) {
      const bx = b.x + 4 + ((t / 60 + i * span / 2) % span)
      box(ctx, bx, by - 6, 10, 8, CARD)
      px(ctx, shade(CARD, 0.25), bx + 1, by - 5, 8, 1)
    }
  },
  rack: (ctx, b, _p, _t, s) => {
    const rise = b.h > 16 ? 18 : 18
    const top = b.y - rise
    const bottom = b.y + b.h - 1
    shadow(ctx, b.x + 1, bottom, b.w - 2)
    const levels = 3
    const lh = (bottom - top) / levels
    for (let k = 0; k < levels; k++) {
      const ly = top + k * lh
      let x = b.x + 4
      let i = 0
      while (x < b.x + b.w - 8) {
        const w = 7 + Math.floor(hash(i, k, s) * 6)
        if (x + w > b.x + b.w - 4) break
        const h = Math.min(lh - 3, 5 + Math.floor(hash(k, i, s) * 4))
        box(ctx, x, ly + lh - 2 - h, w, h, hash(i, k, s + 1) < 0.75 ? CARD : GOODS[(i + k) % GOODS.length])
        x += w + 1
        i++
      }
      px(ctx, '#e98a3c', b.x + 2, ly + lh - 2, b.w - 4, 2)
    }
    px(ctx, '#3f7fb4', b.x + 1, top, 2, bottom - top)
    px(ctx, '#3f7fb4', b.x + b.w - 3, top, 2, bottom - top)
    if (b.w >= 48) px(ctx, '#3f7fb4', b.x + b.w / 2 - 1, top, 2, bottom - top)
  },
  dock: (ctx, b, p, _t, s) => {
    // a raised loading platform with bumpers, a parked pallet and a hand truck
    const top = counter(ctx, b, mix('#b3ab9b', p.trim, 0.15), shade('#b3ab9b', -0.25), { faceH: 10, panels: false })
    const fy = b.y + b.h - 12
    for (let x = b.x + 2; x < b.x + b.w - 3; x += 8) {
      px(ctx, '#e2b84a', x, fy + 1, 4, 2)
      px(ctx, LINE, x + 4, fy + 1, 4, 2)
    }
    px(ctx, LINE, b.x + 4, fy + 4, 4, 5)
    px(ctx, LINE, b.x + b.w - 8, fy + 4, 4, 5)
    const pal: Box = { x: top.x + 4, y: top.y - 8, w: 16, h: 16 }
    FURNITURE.pallet(ctx, pal, p, 0, s)
    px(ctx, STEEL_DD, top.x + top.w - 10, top.y - 10, 2, 14)
    px(ctx, STEEL_DD, top.x + top.w - 10, top.y + 3, 7, 2)
    box(ctx, top.x + top.w - 8, top.y - 4, 7, 7, CARD)
    wheel(ctx, top.x + top.w - 9, top.y + 5, 2)
  },
  // props
  bookcase: (ctx, b, p, _t, s) => {
    const body = shade(p.wood, -0.15)
    const r = tallUnit(ctx, b, 16, body)
    shelves(ctx, r, body, 8, s, 'books')
  },
  sofa: (ctx, b, p) => {
    const c = mix(p.accent, p.trim, 0.25)
    shadow(ctx, b.x + 1, b.y + 15, b.w - 2)
    // backrest, seat cushions, arms, legs
    px(ctx, LINE, b.x + 2, b.y - 3, b.w - 4, 10)
    px(ctx, c, b.x + 3, b.y - 2, b.w - 6, 8)
    px(ctx, shade(c, 0.18), b.x + 3, b.y - 2, b.w - 6, 1)
    px(ctx, LINE, b.x + 1, b.y + 5, b.w - 2, 9)
    px(ctx, shade(c, 0.1), b.x + 5, b.y + 5, b.w - 10, 5)
    px(ctx, shade(c, 0.25), b.x + 5, b.y + 5, b.w - 10, 1)
    px(ctx, shade(c, -0.2), b.x + b.w / 2, b.y + 5, 1, 5)
    px(ctx, shade(c, -0.15), b.x + 2, b.y + 2, 3, 11)
    px(ctx, shade(c, -0.15), b.x + b.w - 5, b.y + 2, 3, 11)
    px(ctx, shade(c, -0.35), b.x + 5, b.y + 10, b.w - 10, 3)
    px(ctx, LINE, b.x + 3, b.y + 14, 2, 2)
    px(ctx, LINE, b.x + b.w - 5, b.y + 14, 2, 2)
    px(ctx, GOLD, b.x + 6, b.y, 4, 4)
    px(ctx, shade(GOLD, -0.2), b.x + 6, b.y + 3, 4, 1)
  },
  cafe_table: (ctx, b, p, _t, s) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    chairSide(ctx, b.x - 2, b.y + 5, p)
    chairSide(ctx, b.x + 13, b.y + 5, p)
    ctx.fillStyle = LINE
    ctx.beginPath()
    ctx.ellipse(b.x + 8, b.y + 6, 7, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = stone(p)
    ctx.beginPath()
    ctx.ellipse(b.x + 8, b.y + 5.5, 6, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    px(ctx, LINE, b.x + 7, b.y + 9, 2, 5)
    px(ctx, LINE, b.x + 4, b.y + 14, 8, 1)
    cup(ctx, b.x + 4, b.y + 7, GOODS[s % GOODS.length])
    px(ctx, WHITE, b.x + 9, b.y + 4, 3, 2)
  },
  dining_table: (ctx, b, p, _t, s) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    chairSide(ctx, b.x - 1, b.y + 6, p)
    chairSide(ctx, b.x + 12, b.y + 6, p)
    px(ctx, LINE, b.x + 2, b.y + 3, 12, 8)
    px(ctx, WHITE, b.x + 3, b.y + 4, 10, 4)
    px(ctx, mix(p.accent, '#ffffff', 0.5), b.x + 3, b.y + 8, 10, 2)
    px(ctx, shade(p.wood, -0.3), b.x + 3, b.y + 11, 2, 4)
    px(ctx, shade(p.wood, -0.3), b.x + 11, b.y + 11, 2, 4)
    px(ctx, STEEL_L, b.x + 6, b.y + 5, 4, 2)
    px(ctx, GOODS[s % GOODS.length], b.x + 7, b.y + 5, 2, 1)
  },
  plant: (ctx, b, _p, _t, s) => {
    shadow(ctx, b.x + 3, b.y + 15, 10)
    plantPot(ctx, b.x + 4, b.y + 15, true, s)
  },
  sacks: (ctx, b, _p, _t, s) => {
    sack(ctx, b.x + 1, b.y + 15, 8, hash(s, 1, 2) < 0.5 ? SACK : '#c9b083')
    sack(ctx, b.x + 7, b.y + 15, 8, SACK)
    sack(ctx, b.x + 4, b.y + 9, 8, '#e3d2ad')
  },
  chalkboard: (ctx, b, p) => {
    shadow(ctx, b.x + 2, b.y + 15, 12)
    px(ctx, shade(p.wood, -0.3), b.x + 2, b.y - 4, 12, 18)
    px(ctx, '#2f3a33', b.x + 3, b.y - 3, 10, 14)
    px(ctx, '#e8efe8', b.x + 5, b.y, 6, 1)
    px(ctx, p.accent, b.x + 5, b.y + 3, 5, 1)
    px(ctx, '#e8efe8', b.x + 5, b.y + 6, 4, 1)
  },
  rug: (ctx, b, p) => {
    const c = mix(p.accent, p.floor, 0.35)
    px(ctx, shade(c, -0.25), b.x + 2, b.y + 2, b.w - 4, b.h - 4)
    px(ctx, c, b.x + 3, b.y + 3, b.w - 6, b.h - 6)
    px(ctx, shade(c, 0.25), b.x + 6, b.y + 6, b.w - 12, b.h - 12)
    px(ctx, c, b.x + 8, b.y + 8, b.w - 16, b.h - 16)
    for (let x = b.x + 3; x < b.x + b.w - 3; x += 3) {
      px(ctx, shade(c, 0.35), x, b.y + 1, 1, 1)
      px(ctx, shade(c, 0.35), x, b.y + b.h - 2, 1, 1)
    }
  },
  barrel: (ctx, b) => {
    shadow(ctx, b.x + 2, b.y + 15, 12)
    px(ctx, LINE, b.x + 3, b.y + 1, 10, 14)
    px(ctx, '#8a5a32', b.x + 4, b.y + 2, 8, 12)
    px(ctx, '#a8703f', b.x + 5, b.y + 2, 3, 12)
    px(ctx, STEEL_DD, b.x + 3, b.y + 4, 10, 1)
    px(ctx, STEEL_DD, b.x + 3, b.y + 11, 10, 1)
    px(ctx, '#6b4428', b.x + 4, b.y + 1, 8, 2)
  },
  bin: (ctx, b, p) => {
    shadow(ctx, b.x + 3, b.y + 15, 10)
    px(ctx, LINE, b.x + 4, b.y + 4, 8, 11)
    px(ctx, mix(STEEL, p.trim, 0.2), b.x + 5, b.y + 5, 6, 9)
    px(ctx, STEEL_DD, b.x + 3, b.y + 3, 10, 2)
    px(ctx, STEEL_DD, b.x + 7, b.y + 1, 2, 2)
  },
  buckets: (ctx, b, _p, _t, s) => {
    shadow(ctx, b.x + 2, b.y + 15, 12)
    px(ctx, LINE, b.x + 3, b.y + 7, 10, 8)
    px(ctx, '#5e8fc9', b.x + 4, b.y + 8, 8, 6)
    px(ctx, '#8fc9ec', b.x + 4, b.y + 8, 8, 1)
    bundle(ctx, b.x + 8, b.y + 8, s)
  },
  crate: (ctx, b, _p, _t, s) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    box(ctx, b.x + 2, b.y + 3, 12, 12, '#b98a52')
    px(ctx, '#8a5a32', b.x + 3, b.y + 8, 10, 1)
    px(ctx, '#d4a76a', b.x + 3, b.y + 4, 10, 1)
    px(ctx, '#8a5a32', b.x + 3, b.y + 4, 1, 10)
    px(ctx, '#8a5a32', b.x + 12, b.y + 4, 1, 10)
    if (hash(s, 3, 1) < 0.5) bundle(ctx, b.x + 8, b.y + 4, s)
  },
  car: (ctx, b, _p, _t, s) => {
    shadow(ctx, b.x + 1, b.y + 15, b.w - 2)
    carSide(ctx, b.x + 1, b.y + 4, b.w - 2, GOODS[s % GOODS.length])
  },
  tyres: (ctx, b) => {
    shadow(ctx, b.x + 2, b.y + 15, 12)
    for (let i = 0; i < 3; i++) {
      const y = b.y + 11 - i * 4
      px(ctx, '#26232a', b.x + 2, y, 12, 4)
      px(ctx, '#3d3a40', b.x + 3, y, 10, 1)
      px(ctx, STEEL_DD, b.x + 6, y + 1, 4, 2)
    }
  },
  drum: (ctx, b, p) => {
    shadow(ctx, b.x + 2, b.y + 15, 12)
    const c = mix(p.accent, '#3f7fb4', 0.5)
    px(ctx, LINE, b.x + 3, b.y + 1, 10, 14)
    px(ctx, c, b.x + 4, b.y + 2, 8, 12)
    px(ctx, shade(c, 0.25), b.x + 5, b.y + 2, 2, 12)
    px(ctx, shade(c, -0.3), b.x + 4, b.y + 6, 8, 1)
    px(ctx, shade(c, -0.3), b.x + 4, b.y + 10, 8, 1)
    px(ctx, STEEL_DD, b.x + 4, b.y + 1, 8, 2)
  },
  toolbox: (ctx, b) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    box(ctx, b.x + 2, b.y + 7, 12, 8, '#c0392b')
    px(ctx, shade('#c0392b', 0.25), b.x + 3, b.y + 8, 10, 1)
    px(ctx, LINE, b.x + 5, b.y + 4, 6, 1)
    px(ctx, LINE, b.x + 5, b.y + 4, 1, 3)
    px(ctx, LINE, b.x + 10, b.y + 4, 1, 3)
    px(ctx, STEEL_L, b.x + 7, b.y + 10, 2, 2)
  },
  cone: (ctx, b) => {
    shadow(ctx, b.x + 3, b.y + 15, 10)
    px(ctx, '#e98a3c', b.x + 3, b.y + 13, 10, 2)
    px(ctx, '#e98a3c', b.x + 5, b.y + 8, 6, 5)
    px(ctx, '#e98a3c', b.x + 6, b.y + 3, 4, 5)
    px(ctx, WHITE, b.x + 5, b.y + 8, 6, 2)
  },
  oil: (ctx, b, _p, _t, s) => {
    ctx.fillStyle = 'rgba(30,26,30,0.22)'
    ctx.beginPath()
    ctx.ellipse(b.x + 8, b.y + 9, 5 + (s % 3), 3, 0, 0, Math.PI * 2)
    ctx.fill()
  },
  cooler_water: (ctx, b) => {
    shadow(ctx, b.x + 3, b.y + 15, 10)
    box(ctx, b.x + 4, b.y + 4, 8, 11, WHITE)
    px(ctx, '#8fc9ec', b.x + 4, b.y - 6, 8, 10)
    px(ctx, '#c4e6f6', b.x + 5, b.y - 5, 2, 8)
    px(ctx, '#5e8fc9', b.x + 6, b.y + 7, 1, 2)
    px(ctx, '#e8574a', b.x + 9, b.y + 7, 1, 2)
  },
  desk_small: (ctx, b, p, t, s) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    px(ctx, LINE, b.x + 1, b.y + 5, 14, 8)
    px(ctx, shade(p.wood, 0.25), b.x + 2, b.y + 6, 12, 3)
    px(ctx, shade(p.wood, -0.1), b.x + 2, b.y + 9, 12, 3)
    px(ctx, shade(p.wood, -0.4), b.x + 2, b.y + 12, 2, 3)
    px(ctx, shade(p.wood, -0.4), b.x + 12, b.y + 12, 2, 3)
    monitor(ctx, b.x + 4, b.y + 7, 8, t, s)
  },
  copier: (ctx, b, p, t) => FURNITURE.printer(ctx, { ...b, x: b.x - 4, w: b.w + 8 }, p, t, 0),
  curtain: (ctx, b) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    px(ctx, STEEL_DD, b.x + 1, b.y - 6, 14, 1)
    for (let x = b.x + 1; x < b.x + 15; x += 3) {
      px(ctx, '#bfe0dc', x, b.y - 5, 3, 18)
      px(ctx, '#a3cfc9', x + 2, b.y - 5, 1, 18)
    }
    px(ctx, STEEL_DD, b.x + 1, b.y + 13, 1, 2)
    px(ctx, STEEL_DD, b.x + 14, b.y + 13, 1, 2)
  },
  chair: (ctx, b, p) => {
    shadow(ctx, b.x + 3, b.y + 15, 10)
    chairBack(ctx, b.x + 3, b.y + 12, p)
  },
  planks: (ctx, b, p) => {
    shadow(ctx, b.x + 1, b.y + 15, b.w - 2)
    for (let i = 0; i < 4; i++) {
      const x = b.x + 3 + i * Math.floor((b.w - 8) / 4)
      px(ctx, LINE, x, b.y - 10 + i, 5, 25 - i)
      px(ctx, shade(p.wood, 0.2 - i * 0.08), x + 1, b.y - 9 + i, 3, 23 - i)
    }
  },
  shavings: (ctx, b, p, _t, s) => {
    for (let i = 0; i < 9; i++) {
      const x = b.x + 2 + Math.floor(hash(i, s, 1) * 12)
      const y = b.y + 3 + Math.floor(hash(s, i, 2) * 10)
      px(ctx, shade(p.wood, 0.45), x, y, 2, 1)
    }
  },
  pallet: (ctx, b, _p, _t, s) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    px(ctx, '#a8824f', b.x + 1, b.y + 12, 14, 3)
    px(ctx, '#7a5a33', b.x + 1, b.y + 14, 14, 1)
    px(ctx, '#7a5a33', b.x + 4, b.y + 12, 1, 3)
    px(ctx, '#7a5a33', b.x + 11, b.y + 12, 1, 3)
    box(ctx, b.x + 2, b.y + 5, 7, 7, CARD)
    box(ctx, b.x + 8, b.y + 6, 6, 6, CARD)
    if (hash(s, 1, 1) < 0.6) box(ctx, b.x + 4, b.y, 7, 6, CARD)
  },
  forklift: (ctx, b) => {
    shadow(ctx, b.x + 1, b.y + 15, 14)
    box(ctx, b.x + 4, b.y + 4, 10, 9, '#e2b84a')
    px(ctx, LINE, b.x + 5, b.y - 3, 1, 8)
    px(ctx, LINE, b.x + 12, b.y - 3, 1, 8)
    px(ctx, LINE, b.x + 5, b.y - 3, 8, 1)
    px(ctx, DARK, b.x + 7, b.y + 5, 4, 3)
    px(ctx, STEEL_DD, b.x + 1, b.y - 2, 2, 15)
    px(ctx, STEEL_DD, b.x - 2, b.y + 11, 5, 1)
    wheel(ctx, b.x + 6, b.y + 13, 2)
    wheel(ctx, b.x + 12, b.y + 13, 2)
  },
  bay: (ctx, b) => {
    px(ctx, '#e2b84a', b.x + 1, b.y + 1, b.w - 2, 2)
    px(ctx, '#e2b84a', b.x + 1, b.y + b.h - 3, b.w - 2, 2)
    px(ctx, '#e2b84a', b.x + 1, b.y + 1, 2, b.h - 2)
    px(ctx, '#e2b84a', b.x + b.w - 3, b.y + 1, 2, b.h - 2)
    px(ctx, 'rgba(226,184,74,0.25)', b.x + 3, b.y + 3, b.w - 6, b.h - 6)
  },
}

/** A small bunch of goods: flowers, produce or parcels, coloured from the seed (never from the job). */
function bundle(ctx: Ctx, cx: number, by: number, s: number) {
  const c1 = GOODS[s % GOODS.length]
  const c2 = GOODS[(s + 3) % GOODS.length]
  px(ctx, LEAF_D, cx - 1, by - 3, 1, 3)
  px(ctx, LEAF_D, cx + 1, by - 3, 1, 3)
  px(ctx, c1, cx - 3, by - 6, 3, 3)
  px(ctx, c2, cx, by - 7, 3, 3)
  px(ctx, shade(c1, 0.3), cx - 1, by - 5, 2, 2)
}

function carSide(ctx: Ctx, x: number, y: number, w: number, c: string) {
  px(ctx, LINE, x, y + 1, w, 8)
  px(ctx, c, x + 1, y + 2, w - 2, 5)
  px(ctx, shade(c, 0.25), x + 1, y + 2, w - 2, 1)
  px(ctx, LINE, x + w * 0.25, y - 4, w * 0.5, 6)
  px(ctx, c, x + w * 0.25 + 1, y - 3, w * 0.5 - 2, 4)
  px(ctx, SKY, x + w * 0.25 + 2, y - 2, w * 0.2, 3)
  px(ctx, SKY, x + w * 0.5 + 1, y - 2, w * 0.2 - 2, 3)
  wheel(ctx, x + 5, y + 9, 3)
  wheel(ctx, x + w - 6, y + 9, 3)
  px(ctx, GOLD, x + w - 3, y + 3, 2, 2)
}

function chairBack(ctx: Ctx, x: number, by: number, p: EnvPal) {
  const c = shade(p.wood, -0.15)
  px(ctx, LINE, x, by - 12, 10, 9)
  px(ctx, c, x + 1, by - 11, 8, 7)
  px(ctx, shade(c, 0.2), x + 1, by - 11, 8, 1)
  px(ctx, shade(c, -0.3), x + 1, by - 4, 2, 4)
  px(ctx, shade(c, -0.3), x + 7, by - 4, 2, 4)
}

function chairSide(ctx: Ctx, x: number, y: number, p: EnvPal) {
  const c = shade(p.wood, -0.2)
  px(ctx, LINE, x, y - 1, 6, 6)
  px(ctx, c, x + 1, y, 4, 4)
  px(ctx, shade(c, 0.2), x + 1, y, 4, 1)
  px(ctx, shade(c, -0.35), x + 1, y + 5, 1, 4)
  px(ctx, shade(c, -0.35), x + 4, y + 5, 1, 4)
}

/** Draws an interior wall, door or furniture location; false when the icon is not an environment piece. */
export function drawEnvLocation(ctx: Ctx, world: World, loc: MapLocation, pal: Palette, t: number): boolean {
  const icon = loc.icon ?? ''
  const env = envOf(world)
  const p = envPal(pal)
  if (icon === 'wall') {
    if (!env) return false
    if (loc.tile[1] === 0 && loc.h >= 2) drawBackWall(ctx, world, loc, p, env, t)
    else drawWallTop(ctx, loc, p)
    return true
  }
  if (icon === 'door') {
    drawDoor(ctx, loc, p)
    return true
  }
  const draw = FURNITURE[icon]
  if (!draw) return false
  draw(ctx, { x: loc.tile[0] * TILE, y: loc.tile[1] * TILE, w: loc.w * TILE, h: loc.h * TILE }, p, t, seedOf(loc.id) % 9973)
  return true
}
