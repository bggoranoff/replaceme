// Composes one frame of the game from engine state. Pure drawing: never mutates the engine.
import type { GameEngine } from '../engine'
import { TILE } from '../layout'
import { DeliverMechanic } from '../mechanics/deliver'
import type { MapLocation } from '../types'
import { INK, WOOD_DARK, px, roundRect, text, wrap, type Ctx } from './pixel'
import { drawDeliverHud, drawIntro, drawLevelPanel } from './panels'
import { drawScoreCard } from './scorecard'
import { drawGround, drawLabel, drawLocation, drawMarker, drawPerson, drawRobot, drawWaterShimmer, npcColors } from './sprites'

/** Per-view render state (visual smoothing and caches); one per canvas. */
export class RenderView {
  ax = 0
  ay = 0
  walked = 0
  lastReal = 0
  private ground: HTMLCanvasElement | null = null
  private groundKey = ''

  groundLayer(e: GameEngine, scale: number): HTMLCanvasElement {
    const key = `${e.world.slug}:${scale}`
    if (!this.ground || this.groundKey !== key) {
      const c = document.createElement('canvas')
      c.width = e.W * scale
      c.height = e.H * scale
      const g = c.getContext('2d')!
      g.imageSmoothingEnabled = false
      g.setTransform(scale, 0, 0, scale, 0, 0)
      drawGround(g, e.world)
      this.ground = c
      this.groundKey = key
    }
    return this.ground
  }
}

function speechBubble(ctx: Ctx, e: GameEngine, anchorX: number, anchorY: number, speaker: string, body: string) {
  const maxW = 170
  const lines = wrap(ctx, body, maxW - 14, 7.5, 700).slice(0, 4)
  ctx.font = '700 7.5px Nunito, system-ui, sans-serif'
  const w = Math.min(maxW, Math.max(60, ...lines.map((l) => ctx.measureText(l).width + 14)))
  const h = 16 + lines.length * 9.5
  const x = Math.max(4, Math.min(e.W - w - 4, anchorX - w / 2))
  const below = anchorY - h - 6 < 2
  const y = below ? anchorY + 26 : anchorY - h - 6
  roundRect(ctx, { x, y, w, h }, 5, '#ffffff', WOOD_DARK, 1.2)
  const tx = Math.max(x + 6, Math.min(x + w - 10, anchorX - 3))
  if (below) {
    px(ctx, '#ffffff', tx, y - 4, 6, 5)
    px(ctx, WOOD_DARK, tx - 1, y - 5, 1, 5)
  } else {
    px(ctx, '#ffffff', tx, y + h - 1, 6, 5)
    px(ctx, WOOD_DARK, tx - 1, y + h, 1, 5)
    px(ctx, WOOD_DARK, tx + 6, y + h, 1, 5)
  }
  text(ctx, speaker, x + 7, y + 10, { size: 6.5, weight: 800, color: '#9a4a1e', maxW: w - 14 })
  lines.forEach((l, i) => text(ctx, l, x + 7, y + 19 + i * 9.5, { size: 7.5, weight: 700, color: INK }))
}

function locationCenter(loc: MapLocation) {
  return { x: (loc.tile[0] + loc.w / 2) * TILE, y: loc.tile[1] * TILE }
}

export function drawFrame(ctx: Ctx, e: GameEngine, view: RenderView, scale: number, realNow: number) {
  const dt = view.lastReal ? Math.min(100, realNow - view.lastReal) : 0
  view.lastReal = realNow
  const world = e.world
  const t = realNow

  // avatar smoothing toward its logical tile
  const tx = e.avatar.col * TILE + TILE / 2
  const ty = e.avatar.row * TILE + TILE
  const dist = Math.hypot(tx - view.ax, ty - view.ay)
  if (!view.lastReal || dist > TILE * 3 || dt === 0) {
    view.ax = tx
    view.ay = ty
  } else if (dist > 0) {
    const step = Math.min(dist, 0.17 * dt)
    view.ax += ((tx - view.ax) / dist) * step
    view.ay += ((ty - view.ay) / dist) * step
    view.walked += step
  }
  const moving = dist > 0.5

  ctx.imageSmoothingEnabled = false
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(view.groundLayer(e, scale), 0, 0)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  drawWaterShimmer(ctx, world, t)

  const delivering = e.phase === 'playing' && e.mech instanceof DeliverMechanic
  // depth-sorted objects
  const items: [number, () => void][] = []
  for (const loc of world.map.locations) {
    if (loc.kind === 'decor' && loc.icon === 'flowers') items.push([-1, () => drawLocation(ctx, world, loc, t)])
    else items.push([(loc.tile[1] + loc.h) * TILE - (loc.icon === 'trees' && loc.h > 1 ? 0 : 0.5), () => drawLocation(ctx, world, loc, t)])
  }
  for (const npc of world.npcs) {
    const fx = npc.tile[0] * TILE + TILE / 2
    const fy = npc.tile[1] * TILE + TILE
    const bob = Math.floor((t / 650 + (npc.tile[0] % 3)) % 2)
    items.push([fy, () => drawPerson(ctx, fx, fy - bob * 0.5, npcColors(npc), 'down', 0)])
  }
  items.push([view.ay, () => drawRobot(ctx, view.ax, view.ay, e.avatar.facing, moving ? Math.floor(view.walked / 5) % 2 : 0)])
  items.sort((a, b) => a[0] - b[0]).forEach(([, draw]) => draw())

  // carried items
  if (e.mech instanceof DeliverMechanic) {
    e.mech.carrying.forEach((_, i) => {
      px(ctx, WOOD_DARK, view.ax - 6 + i * 7, view.ay - 32, 6, 6)
      px(ctx, '#fff6e0', view.ax - 5 + i * 7, view.ay - 31, 4, 4)
    })
  }

  // labels and quest markers
  for (const level of world.levels) {
    const loc = e.location(level.quest.location_id)
    const npc = e.npc(level.quest.npc_id)
    const q = e.quests[level.id]
    if (loc) {
      const c = locationCenter(loc)
      const ly = c.y - 3 < 8 ? (loc.tile[1] + loc.h) * TILE + 9 : c.y - 3
      drawLabel(ctx, loc.name, c.x, ly, e.W)
      const best = e.best[level.id]
      if (best !== null) drawMarker(ctx, c.x, ly - 9, 'done', t, String(Math.round(best)))
      else if (q === 'active' && !delivering) drawMarker(ctx, c.x, ly - 9, 'active', t)
    }
    if (npc && q === 'available' && e.questsOf(npc.id).find((l) => e.quests[l.id] === 'available') === level) {
      drawMarker(ctx, npc.tile[0] * TILE + TILE / 2, npc.tile[1] * TILE - 6, 'quest', t)
    }
  }
  if (delivering && e.mech instanceof DeliverMechanic) {
    const m = e.mech
    for (const place of m.places) {
      const loc = place.ref as MapLocation
      if (place.kind !== 'spot') continue
      drawLabel(ctx, place.label, (loc.tile[0] + 0.5) * TILE, loc.tile[1] * TILE - 8, e.W)
    }
    const pickup = m.places.find((p) => m.isPickup(p.id) && m.params.orders.some((o) => o.from === p.id && m.status[o.id] === 'waiting'))
    if (pickup) drawMarker(ctx, (pickup.tiles.x + pickup.tiles.w / 2) * TILE, pickup.tiles.y * TILE - 12, 'active', t)
  }

  // "press Enter" prompt next to whatever the avatar can use
  if (e.phase === 'world' || delivering) {
    const f = e.focus()
    if (f) {
      const isNpc = f.startsWith('npc:')
      const label = isNpc ? '⏎ Talk' : delivering ? '⏎ Hand over / pick up' : '⏎ Use'
      ctx.font = '800 6.5px Nunito, system-ui, sans-serif'
      const w = ctx.measureText(label).width + 8
      const bx = Math.max(2, Math.min(e.W - w - 2, view.ax - w / 2))
      roundRect(ctx, { x: bx, y: view.ay - 36, w, h: 10 }, 3, '#fff6e0', WOOD_DARK, 1)
      text(ctx, label, bx + w / 2, view.ay - 28.5, { size: 6.5, weight: 800, align: 'center' })
    }
  }

  // speech bubbles on the map
  const b = e.bubble
  const showBubble = b && e.t <= b.until
  if (showBubble && (e.phase === 'world' || delivering)) {
    const npc = e.npc(b.npcId)
    const ax = npc ? npc.tile[0] * TILE + TILE / 2 : view.ax
    const ay = npc ? npc.tile[1] * TILE - 4 : view.ay - 24
    speechBubble(ctx, e, ax, ay, b.speaker, b.text)
  }

  if (delivering) drawDeliverHud(ctx, e)
  const shake = e.juice.offset()
  ctx.translate(shake.x, shake.y)
  if (e.phase === 'playing') drawLevelPanel(ctx, e, t)
  if (e.phase === 'intro') drawIntro(ctx, e, t)
  if (e.phase === 'result') drawScoreCard(ctx, e, t)
  e.juice.draw(ctx)
  ctx.translate(-shake.x, -shake.y)

  // world hint strip
  if (e.phase === 'world') {
    const quests = world.levels.length
    const done = world.levels.filter((l) => e.quests[l.id] === 'done').length
    const label = `${world.title} · ${done}/${quests} quests`
    ctx.font = '800 7px Nunito, system-ui, sans-serif'
    const w = ctx.measureText(label).width + 12
    roundRect(ctx, { x: 6, y: 6, w, h: 13 }, 3, 'rgba(58,38,20,0.78)')
    text(ctx, label, 12, 15, { size: 7, weight: 800, color: '#fff6e0' })
  }
}
