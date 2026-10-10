import { useEffect, useRef, useState } from 'react'
import { HalEye } from './HalEye'

const T = 16
const COLS = 20
const ROWS = 13
const W = COLS * T
const H = ROWS * T
const SPEED = 70 // world px per second
const TRAIN_MS = 10_000
const DONE_MS = 1_400 // tick animation before leaving

type Dir = 'down' | 'up' | 'left' | 'right'
type Box = { x: number; y: number; w: number; h: number }

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
}

// Solid furniture in tile units.
const SOLIDS: Box[] = [
  { x: 0, y: 0, w: COLS, h: 2 }, // back wall
  { x: 0, y: 0, w: 1, h: ROWS }, // left wall
  { x: COLS - 1, y: 0, w: 1, h: ROWS }, // right wall
  { x: 0, y: ROWS - 1, w: COLS, h: 1 }, // front wall
  { x: 1, y: 2, w: 7, h: 1 }, // back counter
  { x: 1, y: 4, w: 7, h: 1 }, // front counter
  { x: 18, y: 2, w: 1, h: 1 }, // plants
  { x: 1, y: 10, w: 1, h: 1 },
  { x: 18, y: 10, w: 1, h: 1 },
  ...[
    [12, 5],
    [16, 5],
    [12, 9],
    [16, 9],
  ].flatMap(([x, y]) => [
    { x, y, w: 1, h: 1 }, // table
    { x: x - 1, y, w: 1, h: 1 }, // chairs
    { x: x + 1, y, w: 1, h: 1 },
  ]),
]

const px = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function drawRoom(ctx: CanvasRenderingContext2D) {
  // Wooden floor planks
  for (let y = 2; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      px(ctx, (y + (x >> 1)) % 2 ? '#c99b6d' : '#bf9063', x * T, y * T, T, T)
      px(ctx, '#a97d55', x * T, y * T + T - 1, T, 1)
    }

  // Back wall with wallpaper stripes and trim
  px(ctx, '#f3e2c7', 0, 0, W, 2 * T)
  for (let x = 0; x < W; x += 8) px(ctx, '#ead2b0', x, 0, 3, 2 * T - 4)
  px(ctx, '#a97d55', 0, 2 * T - 4, W, 4)

  // Menu board
  px(ctx, '#6b4a33', 2 * T - 2, 4, 4 * T + 4, 20)
  px(ctx, '#3d5a4a', 2 * T, 6, 4 * T, 16)
  for (let i = 0; i < 3; i++) px(ctx, '#fbf6ea', 2 * T + 6, 10 + i * 4, 20 + ((i * 13) % 24), 1)
  px(ctx, '#ffd877', 5 * T, 10, 6, 6)

  // Windows
  for (const wx of [11, 15]) {
    px(ctx, '#fbf6ea', wx * T - 2, 3, 3 * T + 4, 22)
    px(ctx, '#a9d4f0', wx * T, 5, 3 * T, 18)
    px(ctx, '#fbf6ea', wx * T + 23, 5, 2, 18)
    px(ctx, '#ffffff', wx * T + 4, 8, 6, 2)
  }

  // Side and front walls
  px(ctx, '#d9b48a', 0, 2 * T, T, H - 2 * T)
  px(ctx, '#d9b48a', W - T, 2 * T, T, H - 2 * T)
  px(ctx, '#d9b48a', 0, H - T, W, T)
  px(ctx, '#a97d55', T - 2, 2 * T, 2, H - 3 * T)
  px(ctx, '#a97d55', W - T, 2 * T, 2, H - 3 * T)
  px(ctx, '#a97d55', T, H - T, W - 2 * T, 2)

  // Door mat
  px(ctx, '#b86a7a', 9 * T, H - T - 6, 2 * T, 6)

  // Rug
  px(ctx, '#b86a7a', 6 * T, 7 * T, 4 * T, 4 * T)
  px(ctx, '#d99a9a', 6 * T + 3, 7 * T + 3, 4 * T - 6, 4 * T - 6)
  for (let i = 0; i < 3; i++) px(ctx, '#f2c7c7', 6 * T + 8, 7 * T + 12 + i * 16, 4 * T - 16, 2)
}

function drawCounter(ctx: CanvasRenderingContext2D, ty: number) {
  px(ctx, '#7a4f33', T, ty * T + 4, 7 * T, T - 4)
  px(ctx, '#a8714b', T, ty * T, 7 * T, 6)
  px(ctx, '#c48b5f', T, ty * T, 7 * T, 2)
  for (let x = 1; x < 8; x++) px(ctx, '#6b4a33', x * T, ty * T + 8, 1, T - 8)
}

function drawBackCounter(ctx: CanvasRenderingContext2D) {
  drawCounter(ctx, 2)
  // Espresso machine
  px(ctx, '#8e96a3', 2 * T, 2 * T - 10, 20, 14)
  px(ctx, '#c9ced6', 2 * T + 2, 2 * T - 8, 16, 6)
  px(ctx, '#3a3046', 2 * T + 6, 2 * T - 1, 8, 3)
  px(ctx, '#ff4a3a', 2 * T + 15, 2 * T - 6, 2, 2)
  // Grinder and jars
  px(ctx, '#4a3424', 4 * T, 2 * T - 8, 8, 12)
  px(ctx, '#c9ced6', 4 * T + 1, 2 * T - 12, 6, 4)
  for (let i = 0; i < 3; i++) {
    px(ctx, '#fbf6ea', 5 * T + i * 8, 2 * T - 4, 6, 6)
    px(ctx, ['#d9a441', '#6b4a33', '#b86a7a'][i], 5 * T + i * 8 + 1, 2 * T - 1, 4, 2)
  }
}

function drawFrontCounter(ctx: CanvasRenderingContext2D) {
  drawCounter(ctx, 4)
  // Register
  px(ctx, '#6f8fc9', 6 * T, 4 * T - 6, 12, 8)
  px(ctx, '#a9d4f0', 6 * T + 2, 4 * T - 4, 8, 3)
  // Cups and pastries
  for (let i = 0; i < 2; i++) {
    px(ctx, '#ffffff', 2 * T + i * 10, 4 * T - 4, 6, 6)
    px(ctx, '#8a5a3b', 2 * T + i * 10 + 1, 4 * T - 3, 4, 2)
  }
  px(ctx, '#fbf6ea', 4 * T, 4 * T - 3, 14, 5)
  px(ctx, '#e2b84a', 4 * T + 2, 4 * T - 5, 4, 3)
  px(ctx, '#d99a9a', 4 * T + 8, 4 * T - 5, 4, 3)
}

function drawTable(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  for (const cx of [tx - 1, tx + 1]) {
    px(ctx, '#7a4f33', cx * T + 3, ty * T - 2, 10, 8)
    px(ctx, '#a8714b', cx * T + 3, ty * T + 4, 10, 6)
    px(ctx, '#6b4a33', cx * T + 4, ty * T + 10, 2, 5)
    px(ctx, '#6b4a33', cx * T + 10, ty * T + 10, 2, 5)
  }
  px(ctx, '#6b4a33', tx * T + 6, ty * T + 8, 4, 8)
  px(ctx, '#c48b5f', tx * T - 1, ty * T, T + 2, 9)
  px(ctx, '#fbf6ea', tx * T + 1, ty * T + 1, T - 2, 6)
  px(ctx, '#ffffff', tx * T + 5, ty * T + 1, 5, 4)
  px(ctx, '#8a5a3b', tx * T + 6, ty * T + 2, 3, 2)
}

function drawPlant(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  px(ctx, '#b5653a', tx * T + 3, ty * T + 8, 10, 8)
  px(ctx, '#a8553a', tx * T + 3, ty * T + 8, 10, 2)
  px(ctx, '#5f9e5f', tx * T + 1, ty * T - 4, 14, 12)
  px(ctx, '#7cc47f', tx * T + 3, ty * T - 6, 6, 8)
  px(ctx, '#7cc47f', tx * T + 9, ty * T - 2, 5, 6)
}

function drawRobot(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir, step: number) {
  // (x, y) is the centre of the robot's feet.
  const left = x - 6
  const top = y - 26
  const legShift = step ? 1 : 0

  px(ctx, 'rgba(74, 52, 36, 0.25)', x - 6, y - 2, 12, 3)

  // Legs
  px(ctx, '#3a3046', left + 2, top + 21, 3, 5 - legShift)
  px(ctx, '#3a3046', left + 7, top + 21, 3, 4 + legShift)
  px(ctx, '#8e96a3', left + 2, top + 25 - legShift, 3, 1)
  px(ctx, '#8e96a3', left + 7, top + 24 + legShift, 3, 1)

  // Body and arms
  px(ctx, '#3a3046', left + 1, top + 13, 10, 9)
  px(ctx, '#c9ced6', left - 1, top + 15 + legShift, 2, 5)
  px(ctx, '#c9ced6', left + 11, top + 16 - legShift, 2, 5)
  if (dir !== 'up') px(ctx, '#ff4a3a', left + 5, top + 15, 2, 2)

  // Neck and boxy chrome head
  px(ctx, '#8e96a3', left + 5, top + 11, 2, 2)
  px(ctx, '#c9ced6', left, top + 2, 12, 10)
  px(ctx, '#8e96a3', left + 10, top + 2, 2, 10)
  px(ctx, '#8e96a3', left, top + 11, 12, 1)
  px(ctx, '#ffffff', left + 1, top + 3, 3, 1)

  // Visor and eyes by facing
  if (dir === 'down') {
    px(ctx, '#14101c', left + 1, top + 5, 10, 3)
    px(ctx, '#ff4a3a', left + 3, top + 6, 2, 1)
    px(ctx, '#ff4a3a', left + 7, top + 6, 2, 1)
  } else if (dir === 'left') {
    px(ctx, '#14101c', left, top + 5, 6, 3)
    px(ctx, '#ff4a3a', left + 1, top + 6, 2, 1)
  } else if (dir === 'right') {
    px(ctx, '#14101c', left + 6, top + 5, 6, 3)
    px(ctx, '#ff4a3a', left + 9, top + 6, 2, 1)
  } else {
    px(ctx, '#8e96a3', left + 3, top + 6, 6, 1)
  }

  // Antenna and halo
  px(ctx, '#8e96a3', left + 5, top - 2, 1, 4)
  px(ctx, '#ff4a3a', left + 4, top - 4, 3, 2)
  px(ctx, '#e2b84a', left - 1, top - 6, 14, 1)
  px(ctx, '#e2b84a', left - 2, top - 5, 1, 2)
  px(ctx, '#e2b84a', left + 13, top - 5, 1, 2)
}

const solidTile = (tx: number, ty: number) => SOLIDS.some((s) => tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h)

// Tile path (excluding the start) from one open tile to another, or [] if unreachable.
function route(from: [number, number], to: [number, number]): [number, number][] {
  const key = (x: number, y: number) => y * COLS + x
  const prev = new Map<number, number>([[key(...from), -1]])
  const queue = [from]
  while (queue.length) {
    const [x, y] = queue.shift()!
    if (x === to[0] && y === to[1]) break
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (solidTile(nx, ny) || prev.has(key(nx, ny))) continue
      prev.set(key(nx, ny), key(x, y))
      queue.push([nx, ny])
    }
  }
  const path: [number, number][] = []
  for (let k = key(...to); prev.has(k) && prev.get(k) !== -1; k = prev.get(k)!) path.unshift([k % COLS, Math.floor(k / COLS)])
  return path
}

const OPEN_TILES = Array.from({ length: COLS * ROWS }, (_, i) => [i % COLS, Math.floor(i / COLS)] as [number, number]).filter(
  ([x, y]) => !solidTile(x, y),
)

function blocked(x: number, y: number) {
  const box = { x: x - 5, y: y - 4, w: 10, h: 4 }
  return SOLIDS.some(
    (s) => box.x < (s.x + s.w) * T && box.x + box.w > s.x * T && box.y < (s.y + s.h) * T && box.y + box.h > s.y * T,
  )
}

export function Cafe({ onBack, onTrain }: { onBack: () => void; onTrain: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [training, setTraining] = useState(false)
  const [done, setDone] = useState(false)
  const [botAt, setBotAt] = useState<{ x: number; y: number }>()
  const trainingRef = useRef(false)

  const startTraining = () => {
    if (trainingRef.current) return
    trainingRef.current = true
    setTraining(true)
  }

  const onTrainRef = useRef(onTrain)
  onTrainRef.current = onTrain

  useEffect(() => {
    if (!training) return
    const finish = setTimeout(() => {
      trainingRef.current = false
      setDone(true)
    }, TRAIN_MS)
    const leave = setTimeout(() => onTrainRef.current(), TRAIN_MS + DONE_MS)
    return () => {
      clearTimeout(finish)
      clearTimeout(leave)
    }
  }, [training])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const held: Dir[] = []
    const bot = { x: 4 * T + 8, y: 3 * T + 14, dir: 'down' as Dir, walked: 0 }
    // Autopilot while training: walk tile paths to random spots around the room.
    let path: [number, number][] = []
    let last = performance.now()
    let frame = 0

    const onDown = (e: KeyboardEvent) => {
      const dir = KEYS[e.key]
      if (!dir) return
      e.preventDefault()
      if (!held.includes(dir)) held.push(dir)
    }
    const onUp = (e: KeyboardEvent) => {
      const dir = KEYS[e.key]
      if (dir) held.splice(held.indexOf(dir) >>> 0, 1)
    }
    const onBlur = () => (held.length = 0)

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let dir: Dir | undefined = held[held.length - 1]
      if (trainingRef.current) {
        const here: [number, number] = [Math.floor(bot.x / T), Math.floor((bot.y - 4) / T)]
        if (!path.length) path = [here, ...route(here, OPEN_TILES[Math.floor(Math.random() * OPEN_TILES.length)])]
        const next = path[0]
        if (next) {
          const tx = next[0] * T + 8
          const ty = next[1] * T + 12
          const dist = SPEED * dt
          if (Math.abs(tx - bot.x) > 0.5) {
            bot.dir = tx > bot.x ? 'right' : 'left'
            bot.x += Math.sign(tx - bot.x) * Math.min(dist, Math.abs(tx - bot.x))
          } else if (Math.abs(ty - bot.y) > 0.5) {
            bot.dir = ty > bot.y ? 'down' : 'up'
            bot.y += Math.sign(ty - bot.y) * Math.min(dist, Math.abs(ty - bot.y))
          } else {
            path.shift()
          }
          bot.walked += dist
        }
        dir = bot.dir
      } else if (dir) {
        bot.dir = dir
        const dist = SPEED * dt
        const dx = dir === 'left' ? -dist : dir === 'right' ? dist : 0
        const dy = dir === 'up' ? -dist : dir === 'down' ? dist : 0
        if (!blocked(bot.x + dx, bot.y)) bot.x += dx
        if (!blocked(bot.x, bot.y + dy)) bot.y += dy
        bot.walked += dist
      } else {
        bot.walked = 0
      }
      const step = dir ? Math.floor(bot.walked / 6) % 2 : 0

      ctx.clearRect(0, 0, W, H)
      drawRoom(ctx)
      // Draw back to front so the robot passes behind and in front of furniture.
      const sprites: [number, () => void][] = [
        [3 * T, () => drawBackCounter(ctx)],
        [5 * T, () => drawFrontCounter(ctx)],
        [3 * T, () => drawPlant(ctx, 18, 2)],
        [11 * T, () => drawPlant(ctx, 1, 10)],
        [11 * T, () => drawPlant(ctx, 18, 10)],
        ...[
          [12, 5],
          [16, 5],
          [12, 9],
          [16, 9],
        ].map(([x, y]) => [(y + 1) * T, () => drawTable(ctx, x, y)] as [number, () => void]),
        [bot.y, () => drawRobot(ctx, bot.x, bot.y, bot.dir, step)],
      ]
      sprites.sort((a, b) => a[0] - b[0]).forEach(([, draw]) => draw())
      if (trainingRef.current && canvas.current) {
        const box = canvas.current.getBoundingClientRect()
        setBotAt({ x: box.left + (bot.x / W) * box.width, y: box.top + ((bot.y - 14) / H) * box.height })
      }
      frame = requestAnimationFrame(tick)
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return (
    <section className="game">
      <div className="game-top">
        <button type="button" className="back" onClick={onBack}>
          ← New prompt
        </button>
      </div>

      <div className="modes">
        <button type="button" onClick={startTraining} disabled={training}>
          <BotIcon /> {done ? 'Trained' : training ? 'Training…' : 'Train agent'}
        </button>
      </div>

      <div className="arena">
        <canvas ref={canvas} width={W} height={H} aria-label="Café; walk the robot with arrow keys or WASD" />
        {training && <HalEye className="watcher" target={botAt} reach={26} done={done} />}
      </div>
      <p className="hint">{done ? 'Training complete' : training ? 'The agent is exploring the café' : 'Arrow keys / WASD'}</p>
    </section>
  )
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
    </svg>
  )
}
