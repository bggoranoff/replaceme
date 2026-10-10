// Converse panel: the villager stands behind a counter in a framed portrait with a name plate, talks in a
// speech bubble, and the player's answers are cards to pick from. Pure drawing from the mechanic's state.
import type { GameEngine } from '../engine'
import { converseBubble, conversePortrait } from '../layout'
import type { ConverseMechanic } from '../mechanics/converse'
import type { Rect } from '../types'
import { GOLD, INK, INK_SOFT, PARCHMENT, WOOD_DARK, px, roundRect, shade, text, textBlock, wrap, type Ctx } from './pixel'
import { drawReaction } from './juice'
import { drawPerson, npcColors, paletteOf } from './sprites'

function selectArrow(ctx: Ctx, x: number, y: number, t: number) {
  const o = Math.round(Math.sin(t / 150))
  px(ctx, GOLD, x + o, y - 3, 2, 7)
  px(ctx, GOLD, x + 2 + o, y - 2, 2, 5)
  px(ctx, GOLD, x + 4 + o, y - 1, 2, 3)
}

/** Tiny speech-bubble glyph in front of an answer the player can say. */
function sayGlyph(ctx: Ctx, x: number, y: number) {
  px(ctx, INK_SOFT, x, y - 3, 8, 6)
  px(ctx, '#fffaf0', x + 1, y - 2, 6, 4)
  px(ctx, INK_SOFT, x + 1, y + 3, 2, 2)
  px(ctx, INK_SOFT, x + 2, y - 1, 1, 1)
  px(ctx, INK_SOFT, x + 4, y - 1, 1, 1)
}

function drawPortrait(ctx: Ctx, e: GameEngine, m: ConverseMechanic, pr: Rect, t: number) {
  const npc = m.npc
  const pal = paletteOf(e.world)
  const inner = { x: pr.x + 2, y: pr.y + 2, w: pr.w - 4, h: pr.h - 4 }
  px(ctx, 'rgba(40,24,10,0.28)', pr.x + 2, pr.y + 3, pr.w, pr.h)
  px(ctx, WOOD_DARK, pr.x, pr.y, pr.w, pr.h)
  // back wall with a wainscot, then the villager, then the counter in front
  px(ctx, '#f3e0bc', inner.x, inner.y, inner.w, inner.h)
  px(ctx, '#f8ead0', inner.x, inner.y, inner.w, 3)
  px(ctx, shade(pal.wood, 0.25), inner.x, inner.y + 30, inner.w, inner.h - 30)
  px(ctx, shade(pal.wood, 0.05), inner.x, inner.y + 30, inner.w, 2)
  for (let x = inner.x + 7; x < inner.x + inner.w; x += 12) px(ctx, shade(pal.wood, 0.12), x, inner.y + 33, 1, inner.h - 33)
  const reaction = e.juice.reaction('converse')
  if (npc) {
    // breathing bob; hops when pleased, shakes their head when not
    let ox = 0
    let oy = Math.floor(t / 700) % 2
    if (reaction && reaction.age < 1200) {
      const a = reaction.age
      if (reaction.tier >= 2) oy -= Math.abs(Math.sin(a / 90)) * (reaction.tier === 3 ? 5 : 3) * (1 - a / 1200)
      else if (reaction.tier === 0) ox = Math.sin(a / 45) * 2.2 * (1 - a / 1200)
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(inner.x, inner.y, inner.w, inner.h)
    ctx.clip()
    ctx.translate(Math.round(pr.x + pr.w / 2 + ox), Math.round(pr.y + pr.h + 9 + oy))
    ctx.scale(3, 3)
    drawPerson(ctx, 0, 0, npcColors(npc), 'down', 0)
    ctx.restore()
  }
  const cy = pr.y + pr.h - 13
  px(ctx, WOOD_DARK, inner.x, cy, inner.w, 11)
  px(ctx, '#dca46a', inner.x, cy + 1, inner.w, 3)
  px(ctx, '#b97a43', inner.x, cy + 4, inner.w, 7)
  if (npc) {
    ctx.font = '800 7px Nunito, system-ui, sans-serif'
    const w = Math.min(pr.w + 10, ctx.measureText(npc.name).width + 12)
    const r = { x: Math.round(pr.x + (pr.w - w) / 2), y: pr.y + pr.h - 7, w, h: 12 }
    px(ctx, 'rgba(40,24,10,0.3)', r.x + 1, r.y + 2, r.w, r.h)
    px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
    px(ctx, GOLD, r.x + 1, r.y + 1, r.w - 2, 1)
    text(ctx, npc.name, r.x + r.w / 2, r.y + 9, { size: 7, weight: 800, align: 'center', color: '#fff6e0', maxW: r.w - 6 })
  }
}

function drawBubble(ctx: Ctx, m: ConverseMechanic, br: Rect) {
  px(ctx, 'rgba(40,24,10,0.2)', br.x + 2, br.y + 3, br.w, br.h)
  roundRect(ctx, br, 6, '#ffffff', WOOD_DARK, 1.5)
  // tail toward the villager
  px(ctx, WOOD_DARK, br.x - 6, br.y + 21, 7, 1)
  px(ctx, WOOD_DARK, br.x - 6, br.y + 21, 1, 2)
  px(ctx, WOOD_DARK, br.x - 5, br.y + 23, 2, 1)
  px(ctx, WOOD_DARK, br.x - 3, br.y + 24, 2, 1)
  px(ctx, WOOD_DARK, br.x - 1, br.y + 25, 2, 1)
  px(ctx, '#ffffff', br.x - 5, br.y + 22, 6, 1)
  px(ctx, '#ffffff', br.x - 3, br.y + 23, 4, 1)
  px(ctx, '#ffffff', br.x - 1, br.y + 24, 2, 1)
  let y = br.y + 13
  if (m.lastReply) y += textBlock(ctx, m.lastReply, br.x + 9, y, br.w - 18, { size: 7, weight: 700, italic: true, color: INK_SOFT, maxLines: 1 })
  if (m.turn) textBlock(ctx, m.turn.npc_line, br.x + 9, y + 1, br.w - 18, { size: 8.5, weight: 800, maxLines: m.lastReply ? 2 : 3, lineH: 11 })
  // one pip per turn of the talk
  const n = m.params.turns.length
  const cur = Math.min(m.index, n - 1)
  for (let i = 0; i < n; i++) {
    const x = br.x + br.w - 8 - (n - 1 - i) * 7
    const y0 = br.y + br.h - 8
    px(ctx, i < cur ? INK_SOFT : i === cur ? GOLD : '#e6d6b8', x - 2, y0 - 2, 4, 4)
    if (i === cur) px(ctx, shade(GOLD, -0.35), x - 2, y0 + 1, 4, 1)
  }
}

export function drawConverse(ctx: Ctx, e: GameEngine, m: ConverseMechanic, t: number) {
  const pr = conversePortrait(e.W, e.H)
  drawPortrait(ctx, e, m, pr, t)
  drawBubble(ctx, m, converseBubble(e.W, e.H))
  const reaction = e.juice.reaction('converse')
  if (reaction) drawReaction(ctx, pr.x + pr.w - 3, pr.y + 3, 9, reaction.tier, reaction.k, t)
  const opts = m.turn?.options ?? []
  const rects = m.optionRects()
  const ps = e.juice.scaleOf('converse:options')
  opts.forEach((o, i) => {
    const r0 = rects[i]
    const sel = i === m.selected
    const sq = e.juice.scaleOf(`converse:option:${i}`)
    const s = ps.sx * (sel ? Math.max(sq.sx, sq.sy) : 1)
    const lift = sel ? 1 : 0
    const r = { x: r0.x + (r0.w * (1 - s)) / 2, y: r0.y + (r0.h * (1 - s)) / 2 - lift, w: r0.w * s, h: r0.h * s }
    px(ctx, 'rgba(40,24,10,0.25)', r.x + 1, r.y + (sel ? 3 : 2), r.w, r.h)
    px(ctx, WOOD_DARK, r.x, r.y, r.w, r.h)
    px(ctx, sel ? '#fff1c4' : PARCHMENT, r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    px(ctx, sel ? '#fffaf0' : '#fdf3dc', r.x + 1, r.y + 1, r.w - 2, 1)
    if (sel) {
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.5
      ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2)
      selectArrow(ctx, r.x + 5, r.y + r.h / 2, t)
    } else sayGlyph(ctx, r.x + 4, r.y + r.h / 2)
    // long answers drop to a smaller size before they get cut
    const weight = sel ? 800 : 700
    const tw = r.w - 24
    const fits = (size: number, lh: number) => wrap(ctx, o.text, tw, size, weight).length <= Math.floor((r.h - 4) / lh)
    const [size, lh] = fits(7.5, 9) ? [7.5, 9] : [7, 8]
    const maxLines = Math.max(1, Math.floor((r.h - 4) / lh))
    const lines = Math.min(maxLines, wrap(ctx, o.text, tw, size, weight).length)
    textBlock(ctx, o.text, r.x + 17, r.y + Math.round((r.h - lines * lh) / 2) + lh - 2, tw, { size, weight, maxLines, lineH: lh, color: INK })
  })
}
