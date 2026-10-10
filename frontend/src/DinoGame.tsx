import { useEffect, useRef } from 'react'

// Chrome-offline-style runner shown while the researcher and builder work.
// Everything is drawn from 1-bit bitmaps on a canvas; React only mounts it.

const H = 170 // logical height; logical width adapts to the container (MIN_W..MAX_W)
const MIN_W = 420
const MAX_W = 600
const GROUND = 150
const P = 2 // logical px per bitmap block
const DINO_X = 24

const START_SPEED = 360 // px/s
const MAX_SPEED = 780
const ACCEL = 3.6 // px/s^2
const JUMP_V = 600
const GRAVITY = 2160
const BIRD_SPEED = 510 // pterodactyls appear once the run is this fast
const RESTART_DELAY = 0.4
const HI_KEY = 'replaceme.dino.hi'

type Sprite = { w: number; h: number; bits: boolean[][]; img: HTMLCanvasElement | null }

function sprite(rows: string[]): Sprite {
  const w = Math.max(...rows.map((r) => r.length))
  return { w, h: rows.length, bits: rows.map((r) => Array.from(r.padEnd(w, '.'), (c) => c === '#')), img: null }
}

/** Places sprites side by side, bottom-aligned, with a one-block gap (cactus clusters). */
function hcat(parts: Sprite[]): Sprite {
  const h = Math.max(...parts.map((s) => s.h))
  const rows: string[] = Array.from({ length: h }, () => '')
  parts.forEach((s, i) => {
    for (let y = 0; y < h; y++) {
      const src = s.bits[y - (h - s.h)]
      rows[y] += (i ? '.' : '') + (src ? src.map((b) => (b ? '#' : '.')).join('') : '.'.repeat(s.w))
    }
  })
  return sprite(rows)
}

const DINO_HEAD = [
  '............########..',
  '...........##.#######.',
  '...........##########.',
  '...........##########.',
  '...........##########.',
  '...........#####......',
  '...........########...',
  '#.........#####.......',
  '#........######.......',
  '##.....########.......',
  '###..##########.......',
  '###########..#........',
  '###########...........',
  '.#########............',
  '..########............',
  '...######.............',
]
const DINO_STAND = sprite([...DINO_HEAD, '....###.##............', '....##...#............', '....#....#............', '....##...##...........'])
const DINO_RUN_1 = sprite([...DINO_HEAD, '....###.##............', '....##...#............', '.........#............', '.........##...........'])
const DINO_RUN_2 = sprite([...DINO_HEAD, '....###.##............', '....#.................', '....#.................', '....##................'])
const DUCK_BODY = [
  '......................########',
  '#.....########.......##.######',
  '##..###########......#########',
  '##############################',
  '.#########################....',
  '..#################..######...',
  '...###############............',
  '....###########.#.............',
]
const DINO_DUCK_1 = sprite([...DUCK_BODY, '.....###.##...................', '.....##...#...................', '.....#....##..................', '.....##.......................'])
const DINO_DUCK_2 = sprite([...DUCK_BODY, '.....###.##...................', '......#..##...................', '......##.#....................', '.........##...................'])

const CACTUS_S = sprite([
  '...##...',
  '..####..',
  '..####..',
  '..####.#',
  '#.####.#',
  '#.####.#',
  '#.######',
  '#.#####.',
  '######..',
  '.#####..',
  '..####..',
  '..####..',
  '..####..',
  '..####..',
  '..####..',
  '..####..',
  '..####..',
])
const CACTUS_L = sprite([
  '.....##.....',
  '....####....',
  '....####....',
  '....####..#.',
  '.#..####.###',
  '###.####.###',
  '###.####.###',
  '###.####.###',
  '###.####.###',
  '###.########',
  '###.#######.',
  '###.####....',
  '########....',
  '.#######....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
])
const BIRD_BODY = ['....################..', '.....################.', '.......##########.....']
const BIRD_1 = sprite([
  '.........#............',
  '.........##...........',
  '.........###..........',
  '....##...####.........',
  '...###...#####........',
  '..####....#####.......',
  '######....######......',
  ...BIRD_BODY,
  '........########......',
  '......................',
  '......................',
  '......................',
  '......................',
])
const BIRD_2 = sprite([
  '......................',
  '......................',
  '......................',
  '....##................',
  '...###................',
  '..####................',
  '######................',
  ...BIRD_BODY,
  '.........#####........',
  '.........####.........',
  '.........###..........',
  '.........##...........',
  '.........#............',
])
const CLOUD = sprite([
  '..........######........',
  '........###....###......',
  '...######........##.....',
  '..##...............###..',
  '.##..................##.',
  '########################',
])
const RESTART = sprite([
  '......#......',
  '.....###.....',
  '...######....',
  '..######.....',
  '.####.#......',
  '.###.........',
  '###.......###',
  '###.......###',
  '###.......###',
  '.###.....###.',
  '.####...####.',
  '..#########..',
  '...#######...',
  '.....###.....',
])

// 3x5 bitmap font (M, N, W wider) for the HUD.
const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'], ' ': ['..', '..', '..', '..', '..'],
}
const FONT: Record<string, Sprite> = Object.fromEntries(Object.entries(GLYPHS).map(([k, rows]) => [k, sprite(rows)]))

type Obstacle = { x: number; y: number; frames: Sprite[]; frame: number }
type Cloud = { x: number; y: number }
type Pebble = { x: number; y: number; w: number }

const PEBBLE_SPAN = 1200
const PEBBLES: Pebble[] = Array.from({ length: 42 }, (_, i) => ({
  x: (i * 2731) % PEBBLE_SPAN,
  y: GROUND + 4 + ((i * 7) % 4) * 3,
  w: 2 + ((i * 5) % 3) * 2,
}))

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function readHi(): number {
  try {
    return Number(localStorage.getItem(HI_KEY)) || 0
  } catch {
    return 0
  }
}

function writeHi(score: number) {
  try {
    localStorage.setItem(HI_KEY, String(score))
  } catch {
    // storage blocked (private mode, previews) - the hi-score just won't persist
  }
}

function render(s: Sprite, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = s.w
  c.height = s.h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color
  s.bits.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(x, y, 1, 1)))
  return c
}

function solidAt(o: { x: number; y: number; s: Sprite }, px: number, py: number): boolean {
  return o.s.bits[Math.floor((py - o.y) / P)]?.[Math.floor((px - o.x) / P)] ?? false
}

/** Pixel-exact overlap test between two placed sprites. */
function collides(a: { x: number; y: number; s: Sprite }, b: { x: number; y: number; s: Sprite }): boolean {
  const x0 = Math.max(a.x, b.x)
  const x1 = Math.min(a.x + a.s.w * P, b.x + b.s.w * P)
  const y0 = Math.max(a.y, b.y)
  const y1 = Math.min(a.y + a.s.h * P, b.y + b.s.h * P)
  for (let y = y0 + 0.5; y < y1; y += 1) {
    for (let x = x0 + 0.5; x < x1; x += 1) {
      if (solidAt(a, x, y) && solidAt(b, x, y)) return true
    }
  }
  return false
}

function textWidth(text: string, scale: number): number {
  return [...text].reduce((w, ch) => w + ((FONT[ch]?.w ?? 3) + 1) * scale, -scale)
}

export function DinoGame() {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    const box = wrap.current
    if (!el || !box) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    const css = getComputedStyle(document.documentElement)
    const ink = css.getPropertyValue('--ink').trim() || '#5a4636'
    const soft = css.getPropertyValue('--ink-soft').trim() || '#8a7360'
    const bg = css.getPropertyValue('--cream').trim() || '#fff8e8'
    const cloudInk = '#d8c6a8'
    for (const s of [DINO_STAND, DINO_RUN_1, DINO_RUN_2, DINO_DUCK_1, DINO_DUCK_2, CACTUS_S, CACTUS_L, BIRD_1, BIRD_2, RESTART, ...Object.values(FONT)]) {
      s.img ??= render(s, ink)
    }
    const cloudImg = render(CLOUD, cloudInk)

    let W = MAX_W
    let scale = 1
    const resize = () => {
      const cssW = box.clientWidth || MAX_W
      W = Math.round(Math.min(MAX_W, Math.max(MIN_W, cssW)))
      const dpr = window.devicePixelRatio || 1
      const width = Math.round(cssW * dpr)
      const height = Math.round(((cssW * H) / W) * dpr)
      el.style.aspectRatio = `${W} / ${H}`
      if (el.width !== width) el.width = width
      if (el.height !== height) el.height = height
      scale = width / W
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(box)

    const g = {
      state: 'ready' as 'ready' | 'running' | 'over',
      speed: START_SPEED,
      distance: 0,
      score: 0,
      hi: readHi(),
      flashUntil: 0,
      lift: 0, // dino height above ground
      vy: 0,
      airborne: false,
      downHeld: false,
      runClock: 0,
      clock: 0,
      overAt: 0,
      ground: 0,
      obstacles: [] as Obstacle[],
      clouds: [{ x: 70, y: 40 }, { x: 330, y: 84 }] as Cloud[],
      nextGap: 0,
    }

    const sync = () => {
      const d = el.dataset
      const airborne = String(g.airborne)
      const ducking = String(g.downHeld && !g.airborne && g.state === 'running')
      const score = String(g.score)
      if (d.state !== g.state) d.state = g.state
      if (d.airborne !== airborne) d.airborne = airborne
      if (d.ducking !== ducking) d.ducking = ducking
      if (d.score !== score) d.score = score
    }

    const reset = () => {
      g.speed = START_SPEED
      g.distance = 0
      g.score = 0
      g.flashUntil = 0
      g.lift = 0
      g.vy = 0
      g.airborne = false
      g.obstacles = []
      g.nextGap = 0.9 * START_SPEED // first obstacle after ~1s
    }

    const jump = () => {
      if (g.state === 'over') {
        if (g.clock - g.overAt < RESTART_DELAY) return
        reset()
        g.state = 'running'
      } else if (g.state === 'ready') {
        reset()
        g.state = 'running'
      }
      if (!g.airborne) {
        g.airborne = true
        g.vy = JUMP_V
      }
    }

    const dinoSprite = (): Sprite => {
      if (g.state !== 'running' || g.airborne) return DINO_STAND
      const odd = Math.floor(g.runClock / 0.1) % 2 === 1
      if (g.downHeld) return odd ? DINO_DUCK_2 : DINO_DUCK_1
      return odd ? DINO_RUN_2 : DINO_RUN_1
    }
    const dinoBody = () => {
      const s = dinoSprite()
      return { s, x: DINO_X, y: GROUND + 2 - s.h * P - g.lift }
    }

    const spawn = () => {
      const fast = g.speed > 450
      if (g.speed > BIRD_SPEED && Math.random() < 0.28) {
        // low: must jump; mid: duck (or jump); high: clears a standing dino
        const clearance = [2, 28, 52][Math.floor(Math.random() * 3)]
        g.obstacles.push({ x: W + 10, y: GROUND - BIRD_1.h * P - clearance, frames: [BIRD_1, BIRD_2], frame: 0 })
      } else {
        const large = Math.random() < 0.5
        const maxCount = fast ? 3 : large ? 1 : 2
        const count = 1 + Math.floor(Math.random() * maxCount)
        const s = hcat(Array.from({ length: count }, () => (large ? CACTUS_L : CACTUS_S)))
        s.img = render(s, ink)
        g.obstacles.push({ x: W + 10, y: GROUND + 2 - s.h * P, frames: [s], frame: 0 })
      }
      g.nextGap = g.speed * rand(0.8, 1.5) + 90
    }

    const update = (dt: number) => {
      g.clock += dt
      if (g.state !== 'running') return
      g.speed = Math.min(MAX_SPEED, g.speed + ACCEL * dt)
      g.distance += g.speed * dt
      const score = Math.floor(g.distance * 0.025)
      if (Math.floor(score / 100) > Math.floor(g.score / 100)) g.flashUntil = g.clock + 0.8
      g.score = score
      g.runClock += dt
      g.ground = (g.ground + g.speed * dt) % PEBBLE_SPAN

      if (g.airborne) {
        g.vy -= GRAVITY * (g.downHeld ? 3 : 1) * dt
        g.lift += g.vy * dt
        if (g.lift <= 0) {
          g.lift = 0
          g.vy = 0
          g.airborne = false
        }
      }

      for (const o of g.obstacles) {
        o.x -= g.speed * dt
        if (o.frames.length > 1) o.frame = Math.floor(g.clock / 0.17) % o.frames.length
      }
      g.obstacles = g.obstacles.filter((o) => o.x + o.frames[0].w * P > -10)
      const last = g.obstacles[g.obstacles.length - 1]
      if (last) {
        if (W - last.x - last.frames[0].w * P > g.nextGap) spawn()
      } else if ((g.nextGap -= g.speed * dt) <= 0) {
        spawn()
      }

      for (const c of g.clouds) c.x -= g.speed * 0.2 * dt
      g.clouds = g.clouds.filter((c) => c.x > -CLOUD.w * P)
      if (g.clouds.length < 3 && (g.clouds.length === 0 || g.clouds[g.clouds.length - 1].x < W - rand(160, 320))) {
        g.clouds.push({ x: W + rand(0, 60), y: rand(32, 72) })
      }

      const dino = dinoBody()
      if (g.obstacles.some((o) => collides(dino, { x: o.x, y: o.y, s: o.frames[o.frame] }))) {
        g.state = 'over'
        g.overAt = g.clock
        g.airborne = false
        if (g.score > g.hi) {
          g.hi = g.score
          writeHi(g.hi)
        }
      }
    }

    const blit = (s: Sprite, x: number, y: number) => {
      if (s.img) ctx.drawImage(s.img, Math.round(x), Math.round(y), s.w * P, s.h * P)
    }

    const text = (str: string, x: number, y: number, size: number, align: 'left' | 'center' | 'right' = 'left') => {
      let cx = align === 'center' ? x - textWidth(str, size) / 2 : align === 'right' ? x - textWidth(str, size) : x
      for (const ch of str) {
        const glyph = FONT[ch] ?? FONT[' ']
        if (glyph.img) ctx.drawImage(glyph.img, Math.round(cx), Math.round(y), glyph.w * size, glyph.h * size)
        cx += (glyph.w + 1) * size
      }
    }

    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      for (const c of g.clouds) ctx.drawImage(cloudImg, Math.round(c.x), Math.round(c.y), CLOUD.w * P, CLOUD.h * P)

      ctx.fillStyle = ink
      ctx.fillRect(0, GROUND, W, 2)
      ctx.fillStyle = soft
      for (const p of PEBBLES) {
        const x = (((p.x - g.ground) % PEBBLE_SPAN) + PEBBLE_SPAN) % PEBBLE_SPAN
        if (x < W) ctx.fillRect(Math.round(x), p.y, p.w, 2)
      }

      for (const o of g.obstacles) blit(o.frames[o.frame], o.x, o.y)
      const dino = dinoBody()
      blit(dino.s, dino.x, dino.y)
      if (g.state === 'over') {
        // wide-open eye on crash
        ctx.fillStyle = bg
        ctx.fillRect(dino.x + 13 * P - 1, dino.y + 1 * P - 1, P + 2, P + 2)
        ctx.fillStyle = ink
        ctx.fillRect(dino.x + 13 * P, dino.y + 1 * P, P, P)
      }

      const pad = (n: number) => String(n).padStart(5, '0')
      const flashing = g.clock < g.flashUntil && Math.floor(g.clock / 0.1) % 2 === 0
      text(flashing ? '' : pad(g.score), W - 12, 12, 2, 'right')
      if (g.hi > 0) {
        ctx.globalAlpha = 0.6
        text(`HI ${pad(g.hi)}`, W - 12 - textWidth('00000', 2) - 20, 12, 2, 'right')
        ctx.globalAlpha = 1
      }

      if (g.state === 'ready') {
        text('PRESS SPACE OR TAP TO PLAY', W / 2, 62, 2, 'center')
      } else if (g.state === 'over') {
        text('GAME OVER', W / 2, 40, 3, 'center')
        blit(RESTART, W / 2 - (RESTART.w * P) / 2, 66)
        text('SPACE OR TAP TO RETRY', W / 2, 102, 2, 'center')
      }
    }

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      update(Math.min(0.05, (now - last) / 1000))
      last = now
      draw()
      sync()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const isJump = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp'
    const onKeyDown = (e: KeyboardEvent) => {
      if (isJump(e)) {
        e.preventDefault()
        if (!e.repeat) jump()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        g.downHeld = true
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') g.downHeld = false
    }
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      jump()
    }
    const onBlur = () => {
      g.downHeld = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    el.addEventListener('pointerdown', onPointerDown)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      el.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  return (
    <div className="dino" ref={wrap}>
      <canvas
        ref={canvas}
        className="dino-canvas"
        data-state="ready"
        aria-label="Dinosaur runner. Space, Up arrow or tap to jump; Down arrow to duck."
      />
      <p className="dino-hint">
        <span>
          <kbd>Space</kbd> / <kbd>↑</kbd> / tap to jump ·
        </span>{' '}
        <span>
          <kbd>↓</kbd> to duck
        </span>
      </p>
    </div>
  )
}
