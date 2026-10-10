// Map-level targets (npc:<id>, location:<id>, spot:<id>) and grid helpers.
import type { Target } from '../contract'
import { TILE } from './layout'
import type { MapLocation, Npc, Rect, World } from './types'

export interface WorldTarget {
  id: string
  kind: 'npc' | 'location' | 'spot'
  label: string
  /** Tile footprint. */
  tiles: Rect
  ref: Npc | MapLocation
}

export function locationTargetId(loc: MapLocation): string {
  return loc.kind === 'spot' ? `spot:${loc.id}` : `location:${loc.id}`
}

export function resolveTarget(world: World, id: string): WorldTarget | null {
  const [prefix, ...rest] = id.split(':')
  const key = rest.join(':')
  if (prefix === 'npc') {
    const n = world.npcs.find((x) => x.id === key)
    return n ? { id, kind: 'npc', label: n.name, tiles: { x: n.tile[0], y: n.tile[1], w: 1, h: 1 }, ref: n } : null
  }
  if (prefix === 'location' || prefix === 'spot') {
    const l = world.map.locations.find((x) => x.id === key)
    return l ? { id, kind: prefix, label: l.name, tiles: { x: l.tile[0], y: l.tile[1], w: l.w, h: l.h }, ref: l } : null
  }
  return null
}

export function toTarget(t: WorldTarget, enabled = true): Target {
  return { id: t.id, kind: t.kind, label: t.label, x: t.tiles.x * TILE, y: t.tiles.y * TILE, w: t.tiles.w * TILE, h: t.tiles.h * TILE, enabled }
}

/** Chebyshev distance from a tile to a footprint (0 = on it, 1 = adjacent incl. diagonals). */
export function tileDistance(tile: [number, number], r: Rect): number {
  const dx = Math.max(r.x - tile[0], 0, tile[0] - (r.x + r.w - 1))
  const dy = Math.max(r.y - tile[1], 0, tile[1] - (r.y + r.h - 1))
  return Math.max(dx, dy)
}

export function inFootprint(tile: [number, number], r: Rect): boolean {
  return tile[0] >= r.x && tile[0] < r.x + r.w && tile[1] >= r.y && tile[1] < r.y + r.h
}

export class Grid {
  readonly cols: number
  readonly rows: number
  private blocked: Uint8Array

  constructor(world: World) {
    this.cols = world.map.cols
    this.rows = world.map.rows
    this.blocked = new Uint8Array(this.cols * this.rows)
    for (const s of world.map.solids) {
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) this.set(x, y)
    }
    const ground = world.map.ground ?? []
    ground.forEach((row, y) => [...row].forEach((c, x) => c === 'w' && this.set(x, y)))
    for (const n of world.npcs) this.set(n.tile[0], n.tile[1])
  }

  private set(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) this.blocked[y * this.cols + x] = 1
  }

  walkable(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows && !this.blocked[y * this.cols + x]
  }

  blockedList(): [number, number][] {
    const out: [number, number][] = []
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) if (this.blocked[y * this.cols + x]) out.push([x, y])
    return out
  }

  /** Shortest 4-way path from a to any goal tile (excluding a), or null. */
  path(a: [number, number], goals: (t: [number, number]) => boolean): [number, number][] | null {
    const key = (x: number, y: number) => y * this.cols + x
    const prev = new Map<number, number>()
    const q: [number, number][] = [a]
    prev.set(key(a[0], a[1]), -1)
    while (q.length) {
      const cur = q.shift()!
      if (goals(cur)) {
        const out: [number, number][] = []
        let k = key(cur[0], cur[1])
        while (k !== key(a[0], a[1])) {
          out.push([k % this.cols, Math.floor(k / this.cols)])
          k = prev.get(k)!
        }
        return out.reverse()
      }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = cur[0] + dx
        const ny = cur[1] + dy
        if (!this.walkable(nx, ny) || prev.has(key(nx, ny))) continue
        prev.set(key(nx, ny), key(cur[0], cur[1]))
        q.push([nx, ny])
      }
    }
    return null
  }
}
