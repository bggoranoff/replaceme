// Procedural pixel-art sprites for the village map. No external assets.
import { TILE } from '../layout'
import type { MapLocation, Npc, Palette, World } from '../types'
import { drawEnvLocation, drawInteriorGround, envOf } from './environments'
import { GOLD, INK, WOOD_DARK, hash, px, seedOf, shade, text, type Ctx } from './pixel'

export const DEFAULT_PALETTE: Palette = { grass: '#7fbf5a', path: '#dcb983', water: '#6fb3d9', wood: '#9a6a3f', roof: '#c8553d', accent: '#f2c14e' }

export function paletteOf(world: World): Palette {
  return { ...DEFAULT_PALETTE, ...(world.theme?.palette ?? {}) }
}

// --- ground ------------------------------------------------------------------

export function groundAt(world: World, x: number, y: number): string {
  return world.map.ground?.[y]?.[x] ?? 'g'
}

export function drawGround(ctx: Ctx, world: World) {
  const pal = paletteOf(world)
  if (envOf(world)) return drawInteriorGround(ctx, world, pal)
  const seed = seedOf(world.slug)
  const { cols, rows } = world.map
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const g = groundAt(world, x, y)
      const X = x * TILE
      const Y = y * TILE
      const h = hash(x, y, seed)
      if (g === 'w') {
        px(ctx, pal.water, X, Y, TILE, TILE)
        px(ctx, shade(pal.water, -0.08), X, Y + 10, TILE, 6)
        continue
      }
      if (g === 'p' || g === 's' || g === 'f') {
        const base = g === 'p' ? pal.path : g === 's' ? '#e8d39a' : shade(pal.wood, 0.35)
        px(ctx, base, X, Y, TILE, TILE)
        for (let i = 0; i < 4; i++) {
          const hx = hash(x * 7 + i, y * 3, seed)
          const hy = hash(x * 5, y * 11 + i, seed)
          px(ctx, shade(base, i % 2 ? -0.12 : 0.1), X + Math.floor(hx * 14), Y + Math.floor(hy * 14), 2, 1)
        }
        continue
      }
      const base = h < 0.33 ? pal.grass : h < 0.66 ? shade(pal.grass, -0.04) : shade(pal.grass, 0.04)
      px(ctx, base, X, Y, TILE, TILE)
      const tufts = Math.floor(hash(x, y, seed + 1) * 3)
      for (let i = 0; i < tufts; i++) {
        const tx = X + 2 + Math.floor(hash(x + i, y, seed + 2) * 11)
        const ty = Y + 3 + Math.floor(hash(x, y + i, seed + 3) * 10)
        px(ctx, shade(pal.grass, -0.22), tx, ty, 1, 2)
        px(ctx, shade(pal.grass, -0.22), tx + 2, ty + 1, 1, 2)
      }
      if (hash(x, y, seed + 4) < 0.05) {
        px(ctx, hash(x, y, seed + 5) < 0.5 ? '#fff6d6' : '#f7a6b8', X + 6, Y + 6, 2, 2)
        px(ctx, '#f2c14e', X + 6, Y + 6, 1, 1)
      }
    }
  }
  // Soft grass fringe where paths meet grass, and lighter shore on water edges.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const g = groundAt(world, x, y)
      const X = x * TILE
      const Y = y * TILE
      const nb = (dx: number, dy: number) => groundAt(world, x + dx, y + dy)
      if (g === 'p') {
        if (nb(0, -1) === 'g') px(ctx, shade(pal.grass, -0.1), X, Y, TILE, 1)
        if (nb(0, 1) === 'g') px(ctx, shade(pal.path, -0.15), X, Y + TILE - 1, TILE, 1)
        if (nb(-1, 0) === 'g') px(ctx, shade(pal.grass, -0.1), X, Y, 1, TILE)
        if (nb(1, 0) === 'g') px(ctx, shade(pal.grass, -0.1), X + TILE - 1, Y, 1, TILE)
      }
      if (g === 'w') {
        if (nb(0, -1) !== 'w') px(ctx, '#e8d39a', X, Y, TILE, 3)
        if (nb(0, 1) !== 'w') px(ctx, shade(pal.water, -0.2), X, Y + TILE - 2, TILE, 2)
        if (nb(-1, 0) !== 'w') px(ctx, '#e8d39a', X, Y, 2, TILE)
        if (nb(1, 0) !== 'w') px(ctx, '#e8d39a', X + TILE - 2, Y, 2, TILE)
      }
    }
  }
}

export function drawWaterShimmer(ctx: Ctx, world: World, t: number) {
  const ground = world.map.ground
  if (!ground) return
  ground.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'w') continue
      const ph = (t / 900 + hash(x, y, 9) * 6) % 6
      if (ph < 3) {
        const o = Math.floor(ph * 2)
        px(ctx, 'rgba(255,255,255,0.55)', x * TILE + 3 + o, y * TILE + 6 + (x % 2) * 3, 4, 1)
      }
    }
  })
}

// --- props -------------------------------------------------------------------

function shadow(ctx: Ctx, x: number, y: number, w: number) {
  ctx.fillStyle = 'rgba(30,40,20,0.22)'
  ctx.beginPath()
  ctx.ellipse(x, y, w / 2, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()
}

export function drawTree(ctx: Ctx, x: number, y: number, variant: number, sway = 0) {
  // x,y = top-left of the tile the trunk stands on
  shadow(ctx, x + 8, y + 14, 14)
  px(ctx, '#6b4428', x + 6, y + 7, 4, 8)
  px(ctx, '#83552f', x + 6, y + 7, 1, 8)
  const c1 = variant < 0.5 ? '#3f7f3a' : '#4a8a3c'
  const c2 = shade(c1, 0.18)
  const c3 = shade(c1, -0.2)
  const s = Math.round(sway)
  px(ctx, c3, x + 1 + s, y - 3, 14, 11)
  px(ctx, c1, x + 2 + s, y - 7, 12, 12)
  px(ctx, c1, x + s, y - 3, 16, 8)
  px(ctx, c2, x + 4 + s, y - 6, 6, 4)
  px(ctx, c2, x + 2 + s, y - 2, 3, 2)
  if (variant > 0.8) {
    px(ctx, '#e8574a', x + 10 + s, y - 1, 2, 2)
    px(ctx, '#e8574a', x + 5 + s, y + 2, 2, 2)
  }
}

export function drawBush(ctx: Ctx, x: number, y: number) {
  shadow(ctx, x + 8, y + 14, 14)
  px(ctx, '#3f7f3a', x + 1, y + 5, 14, 9)
  px(ctx, '#4f9a44', x + 2, y + 3, 12, 8)
  px(ctx, '#6cb85a', x + 4, y + 4, 4, 2)
}

export function drawRock(ctx: Ctx, x: number, y: number) {
  shadow(ctx, x + 8, y + 13, 12)
  px(ctx, '#8d8a85', x + 3, y + 6, 10, 7)
  px(ctx, '#a9a59e', x + 4, y + 5, 7, 4)
  px(ctx, '#6f6c68', x + 3, y + 11, 10, 2)
}

export function drawFlowers(ctx: Ctx, x: number, y: number, seed: number) {
  const colors = ['#f7a6b8', '#fff6d6', '#bfaef0', '#ffd877', '#f08a5d']
  for (let i = 0; i < 5; i++) {
    const fx = x + 2 + Math.floor(hash(i, seed, 3) * 11)
    const fy = y + 4 + Math.floor(hash(seed, i, 4) * 9)
    px(ctx, '#3f7f3a', fx, fy + 1, 1, 2)
    px(ctx, colors[Math.floor(hash(i, seed, 5) * colors.length)], fx - 1, fy - 1, 3, 2)
  }
}

export function drawLamp(ctx: Ctx, x: number, y: number, t: number) {
  shadow(ctx, x + 8, y + 14, 8)
  px(ctx, '#3a3046', x + 7, y - 4, 2, 18)
  px(ctx, '#3a3046', x + 5, y - 7, 6, 3)
  const glow = 0.75 + 0.25 * Math.sin(t / 500)
  px(ctx, `rgba(255,216,119,${glow})`, x + 6, y - 4, 4, 4)
}

export function drawSign(ctx: Ctx, x: number, y: number, accent: string) {
  shadow(ctx, x + 8, y + 14, 10)
  px(ctx, '#6b4428', x + 7, y + 4, 2, 10)
  px(ctx, WOOD_DARK, x + 2, y - 1, 12, 7)
  px(ctx, '#c98e4f', x + 3, y, 10, 5)
  px(ctx, accent, x + 9, y - 6, 4, 3)
  px(ctx, '#6b4428', x + 9, y - 6, 1, 6)
}

export function drawIcon(ctx: Ctx, icon: string, cx: number, cy: number, accent: string, t: number) {
  // cx, cy: centre of a ~14px icon
  const x = Math.round(cx - 7)
  const y = Math.round(cy - 7)
  switch (icon) {
    case 'pot':
    case 'tub': {
      px(ctx, '#2f2a2a', x + 1, y + 5, 12, 8)
      px(ctx, '#4a4444', x + 2, y + 6, 10, 2)
      px(ctx, accent, x + 2, y + 4, 10, 2)
      const b = Math.floor(t / 250) % 3
      px(ctx, '#ffffff', x + 3 + b * 3, y + 2 - (b % 2), 2, 2)
      px(ctx, '#2f2a2a', x, y + 4, 2, 2)
      px(ctx, '#2f2a2a', x + 12, y + 4, 2, 2)
      break
    }
    case 'oven':
    case 'fire': {
      px(ctx, '#a0503a', x + 1, y + 3, 12, 10)
      px(ctx, '#c46a4c', x + 2, y + 2, 10, 3)
      px(ctx, '#2f2a2a', x + 4, y + 7, 6, 5)
      const f = Math.floor(t / 150) % 2
      px(ctx, '#f2c14e', x + 5, y + 9 - f, 4, 3 + f)
      px(ctx, '#e8574a', x + 6, y + 10, 2, 2)
      break
    }
    case 'shelf':
    case 'chest':
    case 'crate': {
      px(ctx, '#8a5a32', x + 1, y + 2, 12, 11)
      px(ctx, '#b97a43', x + 2, y + 3, 10, 4)
      px(ctx, '#b97a43', x + 2, y + 8, 10, 4)
      px(ctx, accent, x + 3, y + 4, 2, 2)
      px(ctx, '#8fc6ee', x + 7, y + 4, 2, 2)
      px(ctx, '#f7a6b8', x + 4, y + 9, 2, 2)
      break
    }
    case 'counter':
    case 'desk': {
      px(ctx, '#ffffff', x + 1, y + 6, 5, 3)
      px(ctx, accent, x + 2, y + 4, 3, 2)
      px(ctx, '#ffffff', x + 8, y + 6, 5, 3)
      px(ctx, '#e8574a', x + 9, y + 4, 3, 2)
      break
    }
    case 'anvil': {
      px(ctx, '#55545a', x + 1, y + 4, 12, 4)
      px(ctx, '#55545a', x + 5, y + 8, 4, 4)
      px(ctx, '#3c3b40', x + 3, y + 12, 8, 2)
      break
    }
    case 'easel': {
      px(ctx, '#8a5a32', x + 3, y + 1, 1, 13)
      px(ctx, '#8a5a32', x + 10, y + 1, 1, 13)
      px(ctx, '#ffffff', x + 2, y + 2, 10, 8)
      px(ctx, accent, x + 4, y + 4, 4, 3)
      break
    }
    case 'hive':
    case 'barrel': {
      px(ctx, icon === 'hive' ? '#e2b84a' : '#8a5a32', x + 2, y + 2, 10, 11)
      px(ctx, icon === 'hive' ? '#b98d2e' : '#5b3a1e', x + 2, y + 5, 10, 1)
      px(ctx, icon === 'hive' ? '#b98d2e' : '#5b3a1e', x + 2, y + 9, 10, 1)
      break
    }
    case 'well': {
      px(ctx, '#8d8a85', x + 1, y + 7, 12, 6)
      px(ctx, '#6fb3d9', x + 3, y + 8, 8, 2)
      px(ctx, '#6b4428', x + 2, y + 1, 1, 7)
      px(ctx, '#6b4428', x + 11, y + 1, 1, 7)
      px(ctx, '#c8553d', x + 1, y, 12, 2)
      break
    }
    case 'cart': {
      px(ctx, '#b97a43', x + 1, y + 4, 12, 6)
      px(ctx, '#2f2a2a', x + 2, y + 10, 3, 3)
      px(ctx, '#2f2a2a', x + 9, y + 10, 3, 3)
      px(ctx, accent, x + 3, y + 2, 4, 2)
      break
    }
    default: {
      px(ctx, '#9a6a3f', x + 2, y + 3, 10, 10)
      px(ctx, '#c98e4f', x + 3, y + 4, 8, 3)
      px(ctx, accent, x + 6, y + 8, 2, 2)
    }
  }
}

export function drawBuilding(ctx: Ctx, loc: MapLocation, pal: Palette, roofColor?: string) {
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  const w = loc.w * TILE
  const h = loc.h * TILE
  const roof = roofColor ?? loc.color ?? pal.roof
  const wallTop = y + Math.round(h * 0.45)
  px(ctx, 'rgba(30,40,20,0.22)', x + 3, y + h - 2, w - 2, 4)
  // walls
  px(ctx, shade(pal.wood, 0.55), x + 2, wallTop, w - 4, y + h - wallTop)
  for (let i = x + 6; i < x + w - 4; i += 6) px(ctx, shade(pal.wood, 0.4), i, wallTop, 1, y + h - wallTop)
  px(ctx, shade(pal.wood, 0.2), x + 2, y + h - 3, w - 4, 3)
  // roof with shingles
  px(ctx, shade(roof, -0.35), x, y + 2, w, wallTop - y + 2)
  px(ctx, roof, x + 1, y + 1, w - 2, wallTop - y)
  for (let ry = y + 4; ry < wallTop; ry += 4) {
    px(ctx, shade(roof, -0.15), x + 1, ry, w - 2, 1)
    for (let rx = x + ((ry / 4) % 2 ? 3 : 6); rx < x + w - 2; rx += 6) px(ctx, shade(roof, -0.15), rx, ry - 3, 1, 3)
  }
  px(ctx, shade(roof, 0.25), x + 1, y + 1, w - 2, 1)
  // chimney
  px(ctx, '#8d8a85', x + w - 14, y - 4, 6, 8)
  px(ctx, '#6f6c68', x + w - 14, y - 4, 6, 2)
  // door + windows
  const doorX = x + Math.floor(loc.w / 2) * TILE + 4
  px(ctx, WOOD_DARK, doorX - 1, y + h - 14, 10, 14)
  px(ctx, shade(pal.wood, -0.1), doorX, y + h - 13, 8, 13)
  px(ctx, GOLD, doorX + 6, y + h - 7, 1, 2)
  for (const wx of [x + 6, x + w - 16]) {
    if (Math.abs(wx - doorX) < 12) continue
    px(ctx, WOOD_DARK, wx - 1, wallTop + 4, 12, 9)
    px(ctx, '#bfe3f5', wx, wallTop + 5, 10, 7)
    px(ctx, '#ffffff', wx + 1, wallTop + 6, 3, 2)
    px(ctx, WOOD_DARK, wx + 5, wallTop + 5, 1, 7)
  }
}

export function drawStall(ctx: Ctx, loc: MapLocation, pal: Palette, t: number) {
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  const w = loc.w * TILE
  const h = loc.h * TILE
  const accent = loc.accent ?? pal.accent
  px(ctx, 'rgba(30,40,20,0.22)', x + 2, y + h - 2, w - 2, 4)
  // posts
  px(ctx, '#6b4428', x + 2, y + 2, 2, h - 4)
  px(ctx, '#6b4428', x + w - 4, y + 2, 2, h - 4)
  // counter
  px(ctx, WOOD_DARK, x + 1, y + h - 13, w - 2, 12)
  px(ctx, shade(pal.wood, 0.3), x + 2, y + h - 12, w - 4, 10)
  px(ctx, shade(pal.wood, 0.5), x + 2, y + h - 12, w - 4, 2)
  // awning stripes + scallops
  for (let i = 0; i < w; i += 6) px(ctx, (i / 6) % 2 ? '#fff6e0' : accent, x + i, y, Math.min(6, w - i), 9)
  for (let i = 0; i < w; i += 6) px(ctx, (i / 6) % 2 ? '#fff6e0' : accent, x + i + 1, y + 9, 4, 2)
  px(ctx, shade(accent, -0.3), x, y, w, 1)
  // goods
  drawIcon(ctx, loc.icon ?? 'crate', x + w / 2, y + h - 16, accent, t)
}

export function drawStation(ctx: Ctx, loc: MapLocation, pal: Palette, t: number) {
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  const w = loc.w * TILE
  const h = loc.h * TILE
  const accent = loc.accent ?? pal.accent
  px(ctx, 'rgba(30,40,20,0.22)', x + 2, y + h - 2, w - 2, 4)
  // bench
  px(ctx, '#6b4428', x + 3, y + h - 8, 2, 7)
  px(ctx, '#6b4428', x + w - 5, y + h - 8, 2, 7)
  px(ctx, WOOD_DARK, x + 1, y + h - 16, w - 2, 9)
  px(ctx, shade(pal.wood, 0.35), x + 2, y + h - 15, w - 4, 6)
  px(ctx, shade(pal.wood, 0.55), x + 2, y + h - 15, w - 4, 1)
  // tools on the bench
  drawIcon(ctx, loc.icon ?? 'crate', x + w / 2, y + h - 22, accent, t)
  if (loc.w >= 3) {
    px(ctx, '#c9ced6', x + 4, y + h - 19, 2, 4)
    px(ctx, accent, x + w - 8, y + h - 19, 3, 3)
  }
}

export function drawField(ctx: Ctx, loc: MapLocation) {
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  const w = loc.w * TILE
  const h = loc.h * TILE
  px(ctx, '#7a5233', x, y, w, h)
  for (let ry = y + 3; ry < y + h - 2; ry += 6) {
    px(ctx, '#5e3d25', x + 1, ry + 3, w - 2, 1)
    for (let rx = x + 4; rx < x + w - 3; rx += 6) {
      px(ctx, '#5f9e5f', rx, ry, 2, 3)
      px(ctx, '#8cc265', rx - 1, ry, 1, 1)
      px(ctx, '#8cc265', rx + 2, ry, 1, 1)
    }
  }
  px(ctx, '#a07a4a', x, y, w, 1)
  px(ctx, '#a07a4a', x, y + h - 1, w, 1)
}

export function drawTable(ctx: Ctx, loc: MapLocation, pal: Palette, t: number) {
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  const w = loc.w * TILE
  const h = loc.h * TILE
  px(ctx, 'rgba(30,40,20,0.22)', x + 2, y + h - 3, w - 2, 4)
  px(ctx, shade(pal.wood, 0.1), x + 2, y + 2, w - 4, 3)
  px(ctx, shade(pal.wood, 0.1), x + 2, y + h - 5, w - 4, 3)
  px(ctx, WOOD_DARK, x + 4, y + 6, w - 8, h - 12)
  px(ctx, shade(pal.wood, 0.4), x + 5, y + 7, w - 10, h - 14)
  drawIcon(ctx, loc.icon ?? 'counter', x + w / 2, y + h / 2 - 2, loc.accent ?? pal.accent, t)
}

export function drawLocation(ctx: Ctx, world: World, loc: MapLocation, t: number) {
  const pal = paletteOf(world)
  const x = loc.tile[0] * TILE
  const y = loc.tile[1] * TILE
  const seed = seedOf(loc.id)
  if (envOf(world) && drawEnvLocation(ctx, world, loc, pal, t)) return
  if (loc.kind === 'decor') {
    switch (loc.icon) {
      case 'trees': {
        for (let ty = 0; ty < loc.h; ty++)
          for (let tx = 0; tx < loc.w; tx++) drawTree(ctx, x + tx * TILE, y + ty * TILE, hash(loc.tile[0] + tx, loc.tile[1] + ty, 7))
        return
      }
      case 'tree':
        return drawTree(ctx, x, y, hash(loc.tile[0], loc.tile[1], 7), Math.sin(t / 900 + seed) * 0.6)
      case 'bush':
        return drawBush(ctx, x, y)
      case 'rock':
        return drawRock(ctx, x, y)
      case 'flowers':
        return drawFlowers(ctx, x, y, seed % 997)
      case 'lamp':
        return drawLamp(ctx, x, y, t)
      case 'cottage':
      case 'house':
        return drawBuilding(ctx, loc, pal, shade(pal.roof, hash(seed, 1, 2) * 0.4 - 0.2))
      default:
        return drawBush(ctx, x, y)
    }
  }
  switch (loc.kind) {
    case 'building':
      drawBuilding(ctx, loc, pal)
      if (loc.icon && loc.icon !== 'house' && loc.icon !== 'shop') drawIcon(ctx, loc.icon, x + loc.w * TILE - 10, y + loc.h * TILE - 8, pal.accent, t)
      return
    case 'stall':
      return drawStall(ctx, loc, pal, t)
    case 'field':
      return drawField(ctx, loc)
    case 'table':
      return drawTable(ctx, loc, pal, t)
    case 'spot':
      return drawSign(ctx, x, y, loc.accent ?? pal.accent)
    default:
      return drawStation(ctx, loc, pal, t)
  }
}

// --- characters ----------------------------------------------------------------

export function npcColors(npc: Npc) {
  const s = seedOf(npc.id)
  const shirts = ['#d9734e', '#5e8fc9', '#8cbf5a', '#b56fc2', '#e2b84a', '#4fa59a']
  const hairs = ['#5b3a29', '#2f2a2a', '#c9873e', '#e3d9c6', '#7a4b2a', '#a33f2f']
  const skins = ['#f2c9a0', '#e8b48a', '#c98e64', '#8d5a3b', '#f6d3b0']
  return {
    shirt: npc.palette?.shirt ?? shirts[s % shirts.length],
    hair: npc.palette?.hair ?? hairs[(s >> 3) % hairs.length],
    skin: npc.palette?.skin ?? skins[(s >> 6) % skins.length],
  }
}

/** Person sprite; (x, y) = feet centre. */
export function drawPerson(
  ctx: Ctx,
  x: number,
  y: number,
  c: { shirt: string; hair: string; skin: string },
  facing: 'up' | 'down' | 'left' | 'right',
  frame: number,
  hat?: string,
) {
  const l = Math.round(x - 6)
  const top = Math.round(y - 20)
  shadow(ctx, x, y - 1, 11)
  const step = frame % 2
  // legs
  px(ctx, '#4a3a5a', l + 3, top + 15, 2, 4 + (step ? 0 : 1))
  px(ctx, '#4a3a5a', l + 7, top + 15, 2, 4 + (step ? 1 : 0))
  px(ctx, '#3a2a1e', l + 3, top + 18 + (step ? 0 : 1), 2, 1)
  px(ctx, '#3a2a1e', l + 7, top + 18 + (step ? 1 : 0), 2, 1)
  // body
  px(ctx, c.shirt, l + 2, top + 9, 8, 7)
  px(ctx, shade(c.shirt, -0.2), l + 2, top + 14, 8, 2)
  px(ctx, c.skin, l + 1, top + 10 + step, 1, 4)
  px(ctx, c.skin, l + 10, top + 10 + (1 - step), 1, 4)
  // head
  px(ctx, c.skin, l + 2, top + 2, 8, 7)
  px(ctx, c.hair, l + 2, top + 1, 8, 2)
  if (facing === 'up') px(ctx, c.hair, l + 2, top + 2, 8, 6)
  else if (facing === 'left') {
    px(ctx, c.hair, l + 6, top + 2, 4, 5)
    px(ctx, INK, l + 3, top + 5, 1, 1)
  } else if (facing === 'right') {
    px(ctx, c.hair, l + 2, top + 2, 4, 5)
    px(ctx, INK, l + 8, top + 5, 1, 1)
  } else {
    px(ctx, c.hair, l + 1, top + 2, 1, 4)
    px(ctx, c.hair, l + 10, top + 2, 1, 4)
    px(ctx, INK, l + 4, top + 5, 1, 1)
    px(ctx, INK, l + 7, top + 5, 1, 1)
    px(ctx, shade(c.skin, -0.15), l + 5, top + 7, 2, 1)
  }
  if (hat) {
    px(ctx, shade(hat, -0.25), l, top + 2, 12, 2)
    px(ctx, hat, l + 2, top - 1, 8, 3)
    px(ctx, '#c8553d', l + 2, top + 1, 8, 1)
  }
}

/** The player bot (the original ReplaceMe robot with halo and antenna); (x, y) = feet centre. */
export function drawRobot(ctx: Ctx, x: number, y: number, facing: 'up' | 'down' | 'left' | 'right', frame: number) {
  const left = Math.round(x - 6)
  const top = Math.round(y - 26)
  const legShift = frame % 2 ? 1 : 0
  shadow(ctx, x, y - 1, 12)
  // legs
  px(ctx, '#3a3046', left + 2, top + 21, 3, 5 - legShift)
  px(ctx, '#3a3046', left + 7, top + 21, 3, 4 + legShift)
  px(ctx, '#8e96a3', left + 2, top + 25 - legShift, 3, 1)
  px(ctx, '#8e96a3', left + 7, top + 24 + legShift, 3, 1)
  // body and arms
  px(ctx, '#3a3046', left + 1, top + 13, 10, 9)
  px(ctx, '#c9ced6', left - 1, top + 15 + legShift, 2, 5)
  px(ctx, '#c9ced6', left + 11, top + 16 - legShift, 2, 5)
  if (facing !== 'up') px(ctx, '#ff4a3a', left + 5, top + 15, 2, 2)
  // boxy head
  px(ctx, '#8e96a3', left + 5, top + 11, 2, 2)
  px(ctx, '#c9ced6', left, top + 2, 12, 10)
  px(ctx, '#8e96a3', left + 10, top + 2, 2, 10)
  px(ctx, '#8e96a3', left, top + 11, 12, 1)
  px(ctx, '#ffffff', left + 1, top + 3, 3, 1)
  // visor
  if (facing === 'down') {
    px(ctx, '#14101c', left + 1, top + 5, 10, 3)
    px(ctx, '#ff4a3a', left + 3, top + 6, 2, 1)
    px(ctx, '#ff4a3a', left + 7, top + 6, 2, 1)
  } else if (facing === 'left') {
    px(ctx, '#14101c', left, top + 5, 6, 3)
    px(ctx, '#ff4a3a', left + 1, top + 6, 2, 1)
  } else if (facing === 'right') {
    px(ctx, '#14101c', left + 6, top + 5, 6, 3)
    px(ctx, '#ff4a3a', left + 9, top + 6, 2, 1)
  } else {
    px(ctx, '#8e96a3', left + 3, top + 6, 6, 1)
  }
  // halo and antenna
  px(ctx, '#8e96a3', left + 5, top - 2, 1, 4)
  px(ctx, '#ff4a3a', left + 4, top - 4, 3, 2)
  px(ctx, '#e2b84a', left - 1, top - 6, 14, 1)
  px(ctx, '#e2b84a', left - 2, top - 5, 1, 2)
  px(ctx, '#e2b84a', left + 13, top - 5, 1, 2)
}

export function drawMarker(ctx: Ctx, x: number, y: number, kind: 'quest' | 'active' | 'done', t: number, label?: string) {
  const bob = Math.round(Math.sin(t / 220) * 1.5)
  if (kind === 'quest') {
    px(ctx, WOOD_DARK, x - 4, y - 12 + bob, 8, 11)
    px(ctx, GOLD, x - 3, y - 11 + bob, 6, 9)
    px(ctx, INK, x - 1, y - 10 + bob, 2, 5)
    px(ctx, INK, x - 1, y - 4 + bob, 2, 1)
  } else if (kind === 'active') {
    px(ctx, WOOD_DARK, x - 4, y - 11 + bob, 8, 3)
    px(ctx, WOOD_DARK, x - 3, y - 8 + bob, 6, 2)
    px(ctx, WOOD_DARK, x - 2, y - 6 + bob, 4, 2)
    px(ctx, WOOD_DARK, x - 1, y - 4 + bob, 2, 2)
    px(ctx, GOLD, x - 3, y - 10 + bob, 6, 1)
    px(ctx, GOLD, x - 2, y - 8 + bob, 4, 1)
  } else {
    const w = label ? Math.max(18, label.length * 5 + 12) : 10
    px(ctx, WOOD_DARK, x - w / 2, y - 11, w, 10)
    px(ctx, '#fff6e0', x - w / 2 + 1, y - 10, w - 2, 8)
    px(ctx, GOLD, x - w / 2 + 3, y - 8, 4, 4)
    if (label) text(ctx, label, x - w / 2 + 9, y - 3.5, { size: 7, weight: 800, color: INK })
  }
}

/** Name plaque centred on cx, kept inside the map width. */
export function drawLabel(ctx: Ctx, s: string, cx: number, y: number, mapW = Infinity) {
  ctx.font = `800 7px Nunito, system-ui, sans-serif`
  const w = Math.ceil(ctx.measureText(s).width) + 8
  const x = Math.max(2, Math.min(mapW - w - 2, cx - w / 2))
  px(ctx, 'rgba(58,38,20,0.78)', x, y - 7, w, 9)
  text(ctx, s, x + w / 2, y, { size: 7, weight: 800, color: '#fff6e0', align: 'center' })
}
