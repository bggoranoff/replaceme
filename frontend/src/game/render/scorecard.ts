// Result card: count-up score, Stardew-style quality star, the quest NPC reacting
// (Cooking Mama) with a 4-tier emoji (Moonlighter), the feedback lines and the breakdown.
// Animation state lives here per result object; sounds and particles go through e.juice.
import type { LevelResult } from '../../contract'
import type { GameEngine } from '../engine'
import { cardRect } from '../layout'
import { fmtNum } from './panels'
import { drawQualityStar, drawReaction, QUALITY_NAMES, qualityOf, TIER_WORDS, tierOfScore } from './juice'
import { GOLD, INK, INK_SOFT, PARCHMENT_DARK, WOOD_DARK, px, roundRect, shade, text, textBlock, woodPanel, wrap, type Ctx } from './pixel'
import { drawPerson, npcColors } from './sprites'

interface CardAnim {
  at: number
  lastShown: number
  bumpAt: number
  doneAt: number | null
}

const anims = new WeakMap<LevelResult, CardAnim>()

function anim(res: LevelResult, t: number): CardAnim {
  let a = anims.get(res)
  if (!a) {
    a = { at: t, lastShown: 0, bumpAt: 0, doneAt: null }
    anims.set(res, a)
  }
  return a
}

export function drawScoreCard(ctx: Ctx, e: GameEngine, t: number) {
  const res = e.result
  const level = e.level
  if (!res || !level) return
  const fx = e.juice
  const a = anim(res, t)
  const score = Math.max(0, Math.min(100, res.score))
  const countMs = 350 + score * 9
  const k = Math.min(1, (t - a.at) / countMs)
  const eased = 1 - Math.pow(1 - k, 3)
  const shown = k >= 1 ? score : Math.floor(score * eased)
  const tier = tierOfScore(score)
  const quality = qualityOf(score, res.passed)

  ctx.fillStyle = 'rgba(30,22,12,0.5)'
  ctx.fillRect(0, 0, e.W, e.H)
  const r = cardRect(e.W, e.H)
  // the card drops in
  const drop = Math.min(1, (t - a.at) / 220)
  const dy = Math.round((1 - (1 - Math.pow(1 - drop, 3))) * -16)
  ctx.save()
  ctx.translate(0, dy)
  woodPanel(ctx, r)

  // ribbon
  const color = res.passed ? '#8cc265' : '#f0a35d'
  const ribbon = { x: r.x + 20, y: r.y + 10, w: r.w - 40, h: 18 }
  px(ctx, WOOD_DARK, ribbon.x - 1, ribbon.y - 1, ribbon.w + 2, ribbon.h + 2)
  px(ctx, color, ribbon.x, ribbon.y, ribbon.w, ribbon.h)
  px(ctx, shade(color, 0.3), ribbon.x, ribbon.y, ribbon.w, 2)
  px(ctx, WOOD_DARK, ribbon.x - 8, ribbon.y + 4, 8, ribbon.h - 2)
  px(ctx, shade(color, -0.2), ribbon.x - 7, ribbon.y + 5, 7, ribbon.h - 4)
  px(ctx, WOOD_DARK, ribbon.x + ribbon.w, ribbon.y + 4, 8, ribbon.h - 2)
  px(ctx, shade(color, -0.2), ribbon.x + ribbon.w, ribbon.y + 5, 7, ribbon.h - 4)
  text(ctx, res.passed ? 'Quest complete!' : 'Not quite yet', r.x + r.w / 2, ribbon.y + 13, { size: 9.5, weight: 800, align: 'center' })

  // --- left: the NPC reacting ---------------------------------------------------
  const line = level.dialogue?.find((d) => d.at === (res.passed ? 'pass' : 'fail'))
  const npc = e.npc(line?.npc_id) ?? e.npc(level.quest.npc_id)
  const pr = { x: r.x + 16, y: r.y + 40, w: 54, h: 54 }
  px(ctx, WOOD_DARK, pr.x, pr.y, pr.w, pr.h)
  px(ctx, res.passed ? '#cdeaf7' : '#e9dcc8', pr.x + 2, pr.y + 2, pr.w - 4, pr.h - 4)
  px(ctx, res.passed ? '#8cc265' : '#b9a27c', pr.x + 2, pr.y + pr.h - 12, pr.w - 4, 10)
  const done = a.doneAt !== null
  const since = done ? t - (a.doneAt as number) : 0
  if (npc) {
    // happy hops, so-so sways, bad shakes its head
    let ox = 0
    let oy = 0
    if (done && since < 1400) {
      if (tier >= 2) oy = -Math.abs(Math.sin(since / 90)) * (tier === 3 ? 4 : 2.5)
      else if (tier === 0) ox = Math.sin(since / 45) * 1.6 * (1 - since / 1400)
      else ox = Math.sin(since / 160) * 0.8
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(pr.x + 2, pr.y + 2, pr.w - 4, pr.h - 4)
    ctx.clip()
    ctx.translate(pr.x + pr.w / 2 + ox, pr.y + pr.h - 1 + oy)
    ctx.scale(2, 2)
    drawPerson(ctx, 0, 0, npcColors(npc), 'down', 0)
    ctx.restore()
    text(ctx, npc.name, pr.x + pr.w / 2, pr.y + pr.h + 9, { size: 7, weight: 800, align: 'center', maxW: pr.w + 12 })
  }
  if (done && since > 120) {
    const rk = Math.min(0.5, (since - 120) / 2200)
    drawReaction(ctx, pr.x + pr.w - 2, pr.y + 2, 9, tier, rk, t, false)
  }

  // --- right: score, star, reaction line ----------------------------------------------
  const sx = r.x + 84
  const bump = Math.max(0, 1 - (t - a.bumpAt) / 120)
  const numColor = res.passed ? '#3f6f2a' : '#9a4a1e'
  const num = k >= 1 ? fmtNum(res.score) : String(shown)
  ctx.save()
  ctx.translate(sx, r.y + 64)
  const ns = 1 + bump * 0.08 + (done && since < 260 ? Math.sin((since / 260) * Math.PI) * 0.18 : 0)
  ctx.scale(ns, ns)
  text(ctx, num, 0, 0, { size: 28, weight: 800, color: numColor })
  ctx.restore()
  ctx.font = '800 28px Nunito, system-ui, sans-serif'
  const nw = ctx.measureText(num).width * ns
  text(ctx, '/100', sx + nw + 2, r.y + 64, { size: 9, weight: 800, color: INK_SOFT })
  text(ctx, level.metric.name, sx, r.y + 76, { size: 7, weight: 800, color: INK_SOFT, maxW: r.w - 160 })

  const starX = r.x + r.w - 46
  const starY = r.y + 56
  if (done) {
    drawQualityStar(ctx, starX, starY, 15, quality, t, Math.min(1, since / 380))
    text(ctx, `${QUALITY_NAMES[quality]} quality`, starX, starY + 26, { size: 7, weight: 800, align: 'center', color: quality === 3 ? '#6a3aa8' : INK })
  } else {
    drawQualityStar(ctx, starX, starY, 15, 0, t, 1)
    ctx.fillStyle = 'rgba(251,236,200,0.75)'
    ctx.beginPath()
    ctx.arc(starX, starY, 19, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, '?', starX, starY + 4, { size: 11, weight: 800, align: 'center', color: INK_SOFT })
  }

  // NPC line as a speech bubble pointing at the portrait
  let y = r.y + 90
  if (line) {
    const bx = r.x + 80
    const bw = r.w - 96
    const lines = wrap(ctx, `“${line.text}”`, bw - 12, 7, 700, true).slice(0, 2)
    const bh = 8 + lines.length * 9
    roundRect(ctx, { x: bx, y: y - 4, w: bw, h: bh }, 4, '#ffffff', WOOD_DARK, 1)
    px(ctx, '#ffffff', bx - 4, y + 1, 5, 5)
    px(ctx, WOOD_DARK, bx - 5, y, 1, 7)
    lines.forEach((l, i) => text(ctx, l, bx + 6, y + 5 + i * 9, { size: 7, weight: 700, italic: true, color: INK }))
    y += bh + 2
  }
  y = Math.max(y, r.y + 110)

  // feedback lines
  const terms = Object.values(res.breakdown).slice(0, 6)
  const cols = terms.length > 3 ? 2 : 1
  const barsH = Math.ceil(terms.length / cols) * 11
  const barsTop = r.y + r.h - 26 - barsH
  for (const f of res.feedback.slice(0, 3)) {
    const room = Math.floor((barsTop - 3 - y) / 9)
    if (room < 1) break
    y += textBlock(ctx, `• ${f}`, r.x + 18, y + 6, r.w - 36, { size: 7.5, weight: 800, maxLines: Math.min(2, room), lineH: 9 }) + 1
  }

  // breakdown bars fill with the count-up
  const bw = (r.w - 36 - (cols - 1) * 10) / cols
  const top = Math.max(y + 3, barsTop)
  terms.forEach((b, i) => {
    const bx = r.x + 18 + (i % cols) * (bw + 10)
    const by = top + Math.floor(i / cols) * 11
    text(ctx, b.label, bx, by + 6, { size: 6.5, weight: 800, maxW: bw * 0.5 })
    const barX = bx + bw * 0.52
    const barW = bw * 0.48 - 16
    px(ctx, WOOD_DARK, barX, by, barW, 7)
    px(ctx, PARCHMENT_DARK, barX + 1, by + 1, barW - 2, 5)
    px(ctx, b.score >= 80 ? '#8cc265' : b.score >= 50 ? GOLD : '#f08a5d', barX + 1, by + 1, ((barW - 2) * b.score * eased) / 100, 5)
    text(ctx, String(Math.round(b.score * eased)), bx + bw, by + 6, { size: 6.5, weight: 800, align: 'right' })
  })
  const blink = Math.floor(t / 600) % 2 === 0
  text(ctx, 'Enter or click to continue', r.x + r.w / 2, r.y + r.h - 12, { size: 7.5, weight: 800, align: 'center', color: done && blink ? '#7a3f12' : INK_SOFT })
  ctx.restore()

  // --- sounds and particles --------------------------------------------------------
  if (k < 1) {
    if (Math.floor(shown / 5) > Math.floor(a.lastShown / 5)) {
      fx.sfx('tick', { pitch: 0.8 + shown / 110, volume: 0.7 })
      a.bumpAt = t
    }
    a.lastShown = shown
  } else if (!done) {
    a.doneAt = t
    const cx = sx + 20
    const cy = r.y + 54 + dy
    if (score >= 100) {
      fx.sfx('ding')
      fx.later(180, () => fx.sfx('success', { pitch: 1.5, volume: 0.6 }))
      fx.confetti(starX, starY + dy, 36)
      fx.confetti(cx, cy, 20)
      fx.flash('#fff3c4', 260, 0.45)
    } else if (res.passed) {
      fx.sfx('success')
      fx.burst(starX, starY + dy, { colors: quality >= 2 ? ['#f2c14e', '#fff0a8', '#ffffff'] : ['#e9eef2', '#ffffff'], count: 18, speed: 80, shape: 'star', gravity: 60, size: 2.6 })
      if (quality === 3) fx.confetti(starX, starY + dy, 24)
    } else {
      fx.sfx('fail')
      fx.shake(2, 260)
      fx.burst(cx, cy, { colors: ['#c9b393', '#a58a68'], count: 10, speed: 40, gravity: 120, shape: 'drop' })
    }
    const tierColors = ['#f08a5d', '#fff6e0', '#bfe89a', '#ffe27a']
    fx.later(140, () => fx.popText(pr.x + pr.w / 2, pr.y + 12 + dy, TIER_WORDS[tier], { color: tierColors[tier], size: 9, rise: 12, ms: 1200 }))
  }
}
