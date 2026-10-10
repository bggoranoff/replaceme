import { useEffect, useRef, useState, useMemo } from 'react'
import { HalEye } from './HalEye'

const T = 16
const COLS = 20
const ROWS = 13
const W = COLS * T
const H = ROWS * T
const SPEED = 75 // world px per second
const TRAIN_MS = 8_000
const DONE_MS = 1_200

type Dir = 'down' | 'up' | 'left' | 'right'
type Box = { x: number; y: number; w: number; h: number }

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
}

export interface StationSpec {
  id: string
  name: string
  icon: string
  tile: [number, number]
  w: number
  h: number
  color?: string
  accent?: string
  description?: string
}

export interface LevelSpec {
  id: string
  level: number
  title: string
  goal: string
  instruction?: string
  targetStationId?: string
  actions?: string[]
  controls?: Array<{
    id: string
    label: string
    type: 'slider' | 'toggle' | 'choice'
    min?: number
    max?: number
    step?: number
    default?: any
    unit?: string
    targetMin?: number
    targetMax?: number
    options?: string[]
  }>
  successConditions?: string[]
}

export interface WorldSpec {
  role: string
  title: string
  theme?: {
    name: string
    floorType: 'planks' | 'garden' | 'tile' | 'stone'
    floorColor1: string
    floorColor2: string
    wallColor: string
    wallpaperColor: string
    trimColor: string
    accentColor: string
  }
  stations: StationSpec[]
  levels: LevelSpec[]
  solids?: Box[]
}

const px = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function drawFloor(ctx: CanvasRenderingContext2D, theme: WorldSpec['theme']) {
  const floorType = theme?.floorType || 'planks'
  const c1 = theme?.floorColor1 || '#c99b6d'
  const c2 = theme?.floorColor2 || '#bf9063'
  const cDark = theme?.trimColor || '#a97d55'

  for (let y = 2; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (floorType === 'garden') {
        const isAlternate = (x + y) % 2 === 0
        px(ctx, isAlternate ? c1 : c2, x * T, y * T, T, T)
        if ((x * 7 + y * 13) % 5 === 0) {
          px(ctx, '#7aa874', x * T + 4, y * T + 4, 3, 3)
        }
      } else if (floorType === 'tile') {
        const isCheck = (x + y) % 2 === 0
        px(ctx, isCheck ? c1 : c2, x * T, y * T, T, T)
        px(ctx, '#d0c2b2', x * T, y * T, T, 1)
        px(ctx, '#d0c2b2', x * T, y * T, 1, T)
      } else {
        // Planks
        px(ctx, (y + (x >> 1)) % 2 ? c1 : c2, x * T, y * T, T, T)
        px(ctx, cDark, x * T, y * T + T - 1, T, 1)
      }
    }
  }

  // Back wall with wallpaper stripes
  const wallBg = theme?.wallColor || '#f3e2c7'
  const wallStripe = theme?.wallpaperColor || '#ead2b0'
  px(ctx, wallBg, 0, 0, W, 2 * T)
  for (let x = 0; x < W; x += 8) {
    px(ctx, wallStripe, x, 0, 3, 2 * T - 4)
  }
  px(ctx, cDark, 0, 2 * T - 4, W, 4)

  // Side and front boundary walls
  px(ctx, wallBg, 0, 2 * T, T, H - 2 * T)
  px(ctx, wallBg, W - T, 2 * T, T, H - 2 * T)
  px(ctx, wallBg, 0, H - T, W, T)
  px(ctx, cDark, T - 2, 2 * T, 2, H - 3 * T)
  px(ctx, cDark, W - T, 2 * T, 2, H - 3 * T)
  px(ctx, cDark, T, H - T, W - 2 * T, 2)

  // Entrance mat
  px(ctx, theme?.accentColor || '#b86a7a', 9 * T, H - T - 6, 2 * T, 6)
}

function drawStationSprite(ctx: CanvasRenderingContext2D, s: StationSpec, isHighlighted: boolean) {
  const [tx, ty] = s.tile
  const x = tx * T
  const y = ty * T
  const w = s.w * T
  const h = s.h * T
  const baseColor = s.color || '#8a6d52'
  const accentColor = s.accent || '#ffd877'

  // Countertop shadow & base
  px(ctx, 'rgba(50, 40, 30, 0.25)', x + 2, y + h - 2, w - 4, 3)
  px(ctx, baseColor, x, y + 4, w, h - 4)
  px(ctx, accentColor, x, y, w, 4)

  // Equipment specific icons & props
  const cx = x + w / 2
  const cy = y + h / 2

  if (s.icon === 'steamer') {
    // Steam wand and pitcher
    px(ctx, '#7a8a9e', cx - 10, y - 6, 12, 10)
    px(ctx, '#c9ced6', cx - 8, y - 4, 8, 4)
    px(ctx, '#3a3046', cx + 4, y - 5, 8, 8)
    px(ctx, '#9fdfc4', cx + 10, y - 7, 2, 6)
  } else if (s.icon === 'espresso') {
    // Dual boiler machine
    px(ctx, '#8e96a3', x + 2, y - 10, w - 4, 14)
    px(ctx, '#c9ced6', x + 4, y - 8, w - 8, 6)
    px(ctx, '#ff4a3a', cx - 3, y - 6, 6, 3)
    px(ctx, '#3a3046', cx - 6, y - 1, 12, 3)
  } else if (s.icon === 'grinder') {
    // Coffee bean hopper
    px(ctx, '#c9ced6', cx - 5, y - 12, 10, 6)
    px(ctx, '#4a3424', cx - 4, y - 6, 8, 10)
    px(ctx, '#ffd877', cx - 2, y - 2, 4, 2)
  } else if (s.icon === 'flowers') {
    // Floral buckets
    for (let i = 0; i < 3; i++) {
      const bx = x + 4 + i * 12
      px(ctx, '#6b7a66', bx, y - 2, 9, 8)
      px(ctx, ['#ff8da1', '#ffd877', '#c092db'][i % 3], bx + 1, y - 7, 7, 6)
      px(ctx, '#5f9e5f', bx + 3, y - 4, 3, 3)
    }
  } else if (s.icon === 'knife') {
    // Cutting bench shears and stem
    px(ctx, '#a8714b', x + 4, y + 2, w - 8, 6)
    px(ctx, '#5f9e5f', cx - 8, y - 2, 16, 2)
    px(ctx, '#c9ced6', cx - 2, y - 5, 5, 5)
  } else if (s.icon === 'water' || s.icon === 'vases') {
    // Clear glass vases with water
    px(ctx, '#8fc6ee', cx - 8, y - 6, 7, 9)
    px(ctx, '#8fc6ee', cx + 2, y - 6, 7, 9)
    px(ctx, '#ffffff', cx - 6, y - 4, 2, 5)
    px(ctx, '#ffffff', cx + 4, y - 4, 2, 5)
  } else if (s.icon === 'dish') {
    // Kitchen pass plates
    px(ctx, '#ffffff', cx - 10, y - 3, 9, 5)
    px(ctx, '#e2b84a', cx - 8, y - 5, 5, 2)
    px(ctx, '#ffffff', cx + 2, y - 3, 9, 5)
    px(ctx, '#b86a7a', cx + 4, y - 5, 5, 2)
  } else if (s.icon === 'table') {
    // Dining table with chairs
    px(ctx, '#c48b5f', x + 2, y, w - 4, h)
    px(ctx, '#ffffff', x + 6, y + 2, w - 12, h - 4)
  } else if (s.icon === 'fridge') {
    // Tall refrigerator door
    px(ctx, '#8fc6ee', x + 2, y - 8, w - 4, h + 8)
    px(ctx, '#c9ced6', x + 4, y - 6, w - 8, h + 4)
    px(ctx, '#3a3046', x + w - 5, cy, 2, 6)
  } else {
    // Default register or desk
    px(ctx, '#6f8fc9', cx - 6, y - 6, 12, 8)
    px(ctx, '#a9d4f0', cx - 4, y - 4, 8, 4)
  }

  // Draw nameplate badge above station
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  const textY = y - 10
  const tw = ctx.measureText(s.name).width + 6

  px(ctx, isHighlighted ? '#ffd877' : 'rgba(30, 25, 20, 0.75)', cx - tw / 2, textY - 8, tw, 10)
  ctx.fillStyle = isHighlighted ? '#201810' : '#ffffff'
  ctx.fillText(s.name, cx, textY)
}

function drawRobot(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir, step: number) {
  const left = x - 6
  const top = y - 26
  const legShift = step ? 1 : 0

  px(ctx, 'rgba(74, 52, 36, 0.25)', x - 6, y - 2, 12, 3)

  // Legs
  px(ctx, '#3a3046', left + 2, top + 21, 3, 5 - legShift)
  px(ctx, '#3a3046', left + 7, top + 21, 3, 4 + legShift)
  px(ctx, '#8e96a3', left + 2, top + 25 - legShift, 3, 1)
  px(ctx, '#8e96a3', left + 7, top + 24 + legShift, 3, 1)

  // Body
  px(ctx, '#3a3046', left + 1, top + 13, 10, 9)
  px(ctx, '#c9ced6', left - 1, top + 15 + legShift, 2, 5)
  px(ctx, '#c9ced6', left + 11, top + 16 - legShift, 2, 5)
  if (dir !== 'up') px(ctx, '#ff4a3a', left + 5, top + 15, 2, 2)

  // Boxy head
  px(ctx, '#8e96a3', left + 5, top + 11, 2, 2)
  px(ctx, '#c9ced6', left, top + 2, 12, 10)
  px(ctx, '#8e96a3', left + 10, top + 2, 2, 10)
  px(ctx, '#8e96a3', left, top + 11, 12, 1)
  px(ctx, '#ffffff', left + 1, top + 3, 3, 1)

  // Visor
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

  // Halo & antenna
  px(ctx, '#8e96a3', left + 5, top - 2, 1, 4)
  px(ctx, '#ff4a3a', left + 4, top - 4, 3, 2)
  px(ctx, '#e2b84a', left - 1, top - 6, 14, 1)
  px(ctx, '#e2b84a', left - 2, top - 5, 1, 2)
  px(ctx, '#e2b84a', left + 13, top - 5, 1, 2)
}

interface CafeProps {
  job: string
  world?: WorldSpec
  researchData?: any
  isResearching?: boolean
  levelsCount?: number
  onBack: () => void
  onTrain: () => Promise<void>
  onTrained: () => void
}

export function Cafe({
  job,
  world,
  isResearching,
  levelsCount = 4,
  onBack,
  onTrain,
  onTrained,
}: CafeProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [activeLevelIdx, setActiveLevelIdx] = useState(0)
  const [training, setTraining] = useState(false)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [botAt, setBotAt] = useState<{ x: number; y: number }>()
  const [nearStation, setNearStation] = useState<StationSpec | null>(null)
  const [openModalStation, setOpenModalStation] = useState<StationSpec | null>(null)
  const [levelScores, setLevelScores] = useState<Record<number, number>>({})
  const [controlValues, setControlValues] = useState<Record<string, any>>({})
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const trainingRef = useRef(false)

  // Fallback environment if world is loading or not generated yet
  const activeWorld: WorldSpec = useMemo(() => {
    if (world && world.stations && world.levels) return world
    return {
      role: job,
      title: `${job.charAt(0).toUpperCase() + job.slice(1)} Environment`,
      theme: {
        name: 'Workplace',
        floorType: 'planks',
        floorColor1: '#c99b6d',
        floorColor2: '#bf9063',
        wallColor: '#f3e2c7',
        wallpaperColor: '#ead2b0',
        trimColor: '#a97d55',
        accentColor: '#6b4a33',
      },
      stations: [
        { id: 'station-main', name: 'Work Station', icon: 'tool', tile: [4, 2], w: 3, h: 1, color: '#7a8a9e', accent: '#ffd877' },
        { id: 'station-secondary', name: 'Tool Bench', icon: 'knife', tile: [8, 2], w: 2, h: 1, color: '#8a6d52', accent: '#9fdfc4' },
        { id: 'station-supply', name: 'Supply Storage', icon: 'fridge', tile: [1, 7], w: 2, h: 2, color: '#6f8fc9', accent: '#fbf6ea' },
        { id: 'station-pickup', name: 'Handover Counter', icon: 'register', tile: [6, 4], w: 3, h: 1, color: '#a8714b', accent: '#ffd877' },
      ],
      levels: [
        {
          id: 'level-1',
          level: 1,
          title: 'Foundational Procedure',
          goal: `Master core ${job} procedures and equipment handling`,
          instruction: 'Walk to the Work Station and press [SPACE] to configure operating controls.',
          targetStationId: 'station-main',
          controls: [
            { id: 'param_target', label: 'Calibration Setting', type: 'slider', min: 0, max: 100, default: 50, targetMin: 45, targetMax: 55 },
            { id: 'safety_check', label: 'Safety Protocol Active', type: 'toggle', default: true },
          ],
        },
      ],
      solids: [
        { x: 0, y: 0, w: COLS, h: 2 },
        { x: 0, y: 0, w: 1, h: ROWS },
        { x: COLS - 1, y: 0, w: 1, h: ROWS },
        { x: 0, y: ROWS - 1, w: COLS, h: 1 },
        { x: 4, y: 2, w: 3, h: 1 },
        { x: 8, y: 2, w: 2, h: 1 },
        { x: 1, y: 7, w: 2, h: 2 },
        { x: 6, y: 4, w: 3, h: 1 },
      ],
    }
  }, [world, job])

  const currentLevel = activeWorld.levels[activeLevelIdx] || activeWorld.levels[0]

  // Initialize control values when level changes
  useEffect(() => {
    if (currentLevel?.controls) {
      const initial: Record<string, any> = {}
      for (const c of currentLevel.controls) {
        initial[c.id] = c.default ?? (c.type === 'slider' ? (c.min ?? 0) : true)
      }
      setControlValues(initial)
      setActionFeedback(null)
    }
  }, [currentLevel])

  const solids = useMemo<Box[]>(() => {
    if (activeWorld.solids && activeWorld.solids.length > 0) return activeWorld.solids
    const bounds: Box[] = [
      { x: 0, y: 0, w: COLS, h: 2 },
      { x: 0, y: 0, w: 1, h: ROWS },
      { x: COLS - 1, y: 0, w: 1, h: ROWS },
      { x: 0, y: ROWS - 1, w: COLS, h: 1 },
    ]
    for (const s of activeWorld.stations) {
      bounds.push({ x: s.tile[0], y: s.tile[1], w: s.w, h: s.h })
    }
    return bounds
  }, [activeWorld])

  const solidTile = (tx: number, ty: number) =>
    solids.some((s) => tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h)

  const openTiles = useMemo(() => {
    return Array.from({ length: COLS * ROWS }, (_, i) => [i % COLS, Math.floor(i / COLS)] as [number, number]).filter(
      ([x, y]) => !solidTile(x, y),
    )
  }, [solids])

  const startTraining = () => {
    if (trainingRef.current) return
    trainingRef.current = true
    setFailed(null)
    setTraining(true)
  }

  const onTrainRef = useRef(onTrain)
  onTrainRef.current = onTrain
  const onTrainedRef = useRef(onTrained)
  onTrainedRef.current = onTrained

  // Actor training walk loop
  useEffect(() => {
    if (!training) return
    let cancelled = false
    let leave: ReturnType<typeof setTimeout>
    const walk = new Promise((resolve) => setTimeout(resolve, TRAIN_MS))
    Promise.all([walk, onTrainRef.current()]).then(
      () => {
        if (cancelled) return
        trainingRef.current = false
        setDone(true)
        leave = setTimeout(() => onTrainedRef.current(), DONE_MS)
      },
      (err: unknown) => {
        if (cancelled) return
        trainingRef.current = false
        setTraining(false)
        setFailed(err instanceof Error ? err.message : 'Training failed')
      },
    )
    return () => {
      cancelled = true
      clearTimeout(leave)
    }
  }, [training])

  // Canvas game loop: human keyboard movement & station proximity
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const held: Dir[] = []
    const bot = { x: 5 * T + 8, y: 5 * T + 8, dir: 'down' as Dir, walked: 0 }
    let path: [number, number][] = []
    let last = performance.now()
    let frame = 0

    const blocked = (x: number, y: number) => {
      const box = { x: x - 5, y: y - 4, w: 10, h: 4 }
      return solids.some(
        (s) => box.x < (s.x + s.w) * T && box.x + box.w > s.x * T && box.y < (s.y + s.h) * T && box.y + box.h > s.y * T,
      )
    }

    const onDown = (e: KeyboardEvent) => {
      // Space key opens station interaction
      if (e.code === 'Space' && !openModalStation) {
        e.preventDefault()
        // Check near station
        const nearby = activeWorld.stations.find((s) => {
          const cx = (s.tile[0] + s.w / 2) * T
          const cy = (s.tile[1] + s.h / 2) * T
          return Math.hypot(bot.x - cx, bot.y - cy) < 36
        })
        if (nearby) {
          setOpenModalStation(nearby)
        }
        return
      }

      const dir = KEYS[e.key]
      if (dir && !held.includes(dir)) {
        e.preventDefault()
        held.unshift(dir)
      }
    }

    const onUp = (e: KeyboardEvent) => {
      const dir = KEYS[e.key]
      const i = held.indexOf(dir)
      if (i !== -1) held.splice(i, 1)
    }

    const onBlur = () => {
      held.length = 0
    }

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      let dx = 0
      let dy = 0

      if (trainingRef.current) {
        // Autopilot
        if (!path.length && openTiles.length > 0) {
          const dest = openTiles[Math.floor(Math.random() * openTiles.length)]
          path = [dest]
        }
        if (path.length) {
          const [tx, ty] = path[0]
          const targetX = tx * T + T / 2
          const targetY = ty * T + T / 2
          const dist = Math.hypot(targetX - bot.x, targetY - bot.y)
          if (dist < 4) {
            path.shift()
          } else {
            dx = (targetX - bot.x) / dist
            dy = (targetY - bot.y) / dist
            bot.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
          }
        }
      } else if (held.length > 0 && !openModalStation) {
        bot.dir = held[0]
        if (bot.dir === 'up') dy = -1
        else if (bot.dir === 'down') dy = 1
        else if (bot.dir === 'left') dx = -1
        else if (bot.dir === 'right') dx = 1
      }

      if (dx || dy) {
        const stepDist = SPEED * dt
        const nx = bot.x + dx * stepDist
        const ny = bot.y + dy * stepDist
        if (!blocked(nx, bot.y)) bot.x = nx
        if (!blocked(bot.x, ny)) bot.y = ny
        bot.walked += stepDist
      }

      // Check proximity to any station
      const foundStation = activeWorld.stations.find((s) => {
        const cx = (s.tile[0] + s.w / 2) * T
        const cy = (s.tile[1] + s.h / 2) * T
        return Math.hypot(bot.x - cx, bot.y - cy) < 32
      })
      setNearStation(foundStation || null)

      // Draw canvas
      ctx.clearRect(0, 0, W, H)
      drawFloor(ctx, activeWorld.theme)

      // Sort sprites by Y depth
      const targetStationId = currentLevel?.targetStationId
      const sprites: [number, () => void][] = []

      for (const st of activeWorld.stations) {
        const isTarget = st.id === targetStationId
        sprites.push([
          (st.tile[1] + st.h) * T,
          () => drawStationSprite(ctx, st, isTarget),
        ])
      }

      sprites.push([
        bot.y,
        () => drawRobot(ctx, bot.x, bot.y, bot.dir, Math.floor(bot.walked / 8) % 2),
      ])

      sprites.sort((a, b) => a[0] - b[0]).forEach(([, draw]) => draw())

      // Draw floating prompt if near station
      if (foundStation && !openModalStation && !trainingRef.current) {
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        const promptText = `[SPACE] ${foundStation.name}`
        const pw = ctx.measureText(promptText).width + 8
        px(ctx, '#ffd877', bot.x - pw / 2, bot.y - 38, pw, 12)
        ctx.fillStyle = '#201810'
        ctx.fillText(promptText, bot.x, bot.y - 29)
      }

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
  }, [solids, openTiles, activeWorld, currentLevel, openModalStation])

  const handleExecuteAction = () => {
    if (!currentLevel) return
    const controls = currentLevel.controls || []
    let passed = true
    let feedback = 'Objective verified!'

    for (const c of controls) {
      const val = controlValues[c.id]
      if (c.type === 'slider') {
        if (c.targetMin !== undefined && val < c.targetMin) {
          passed = false
          feedback = `${c.label} is too low (${val}${c.unit || ''}). Target: ${c.targetMin}–${c.targetMax}${c.unit || ''}`
          break
        }
        if (c.targetMax !== undefined && val > c.targetMax) {
          passed = false
          feedback = `${c.label} is too high (${val}${c.unit || ''}). Target: ${c.targetMin}–${c.targetMax}${c.unit || ''}`
          break
        }
      }
    }

    if (passed) {
      setLevelScores((prev) => ({ ...prev, [activeLevelIdx]: 100 }))
      setActionFeedback(`🎉 Objective Complete! Score: 100. ${currentLevel.goal}`)
    } else {
      setActionFeedback(`⚠️ ${feedback}`)
    }
  }

  const isLevelCompleted = levelScores[activeLevelIdx] === 100

  return (
    <section className="game">
      {/* Top Bar with Navigation & Badges */}
      <div className="game-top">
        <button type="button" className="back" onClick={onBack}>
          ← New prompt
        </button>
        <div className="job-badge">
          <span>Role:</span>
          <strong>{job}</strong>
          {isResearching ? (
            <span className="agent-status-tag pulsing">Researcher active…</span>
          ) : (
            <span className="agent-status-tag">{activeWorld.levels.length || levelsCount} levels ready</span>
          )}
        </div>
      </div>

      {/* Level Selector Tabs */}
      <div className="level-tabs">
        {activeWorld.levels.map((lvl, idx) => {
          const isCurrent = idx === activeLevelIdx
          const isDone = levelScores[idx] === 100
          return (
            <button
              key={lvl.id}
              type="button"
              className={`level-tab ${isCurrent ? 'active' : ''} ${isDone ? 'done' : ''}`}
              onClick={() => {
                setActiveLevelIdx(idx)
                setActionFeedback(null)
              }}
            >
              <span className="level-num">L{lvl.level}</span>
              <span className="level-name">{lvl.title}</span>
              {isDone && <span className="check-mark">✓</span>}
            </button>
          )
        })}
      </div>

      {/* Mission Objective HUD */}
      <div className="objective-hud">
        <div className="hud-header">
          <span className="hud-badge">Level {currentLevel?.level} Objective</span>
          <span className="hud-score">
            Score: {levelScores[activeLevelIdx] ?? 0}/100 {isLevelCompleted ? '✓ Passed' : ''}
          </span>
        </div>
        <h3 className="hud-goal">{currentLevel?.goal}</h3>
        <p className="hud-instruction">
          <strong>Guidance:</strong> {currentLevel?.instruction || 'Move to the highlighted station and press [SPACE] to interact.'}
        </p>
      </div>

      {/* Mode Action Buttons */}
      <div className="modes">
        <button
          type="button"
          className="mode-btn active-play"
          onClick={() => {
            if (nearStation) setOpenModalStation(nearStation)
          }}
        >
          🎮 Play (Arrow keys / WASD)
        </button>

        <button type="button" onClick={startTraining} disabled={training || isResearching}>
          <BotIcon /> {done ? 'Trained' : training ? 'Actor Training…' : 'Train agent'}
        </button>
      </div>

      {/* 2D Pixel Arena */}
      <div className="arena">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          onClick={(e) => {
            if (canvas.current) {
              const rect = canvas.current.getBoundingClientRect()
              const cx = (e.clientX - rect.left) / (rect.width / COLS)
              const cy = (e.clientY - rect.top) / (rect.height / ROWS)
              const clickedStation = activeWorld.stations.find(
                (s) => cx >= s.tile[0] && cx < s.tile[0] + s.w && cy >= s.tile[1] && cy < s.tile[1] + s.h,
              )
              if (clickedStation) setOpenModalStation(clickedStation)
            }
          }}
          aria-label="Playable game world; move with arrow keys or WASD"
        />
        {training && <HalEye className="watcher" target={botAt} reach={26} done={done} />}
      </div>

      <p className="hint">
        {done
          ? 'Training complete'
          : training
          ? 'The Actor Agent is running headless simulation rollouts'
          : failed
          ? `${failed}. Try again.`
          : 'Move near a station and press [SPACE] or click it to perform the scenario objective.'}
      </p>

      {/* Interactive Station Modal */}
      {openModalStation && (
        <div className="station-modal-overlay" onClick={() => setOpenModalStation(null)}>
          <div className="station-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="station-icon-tag">{openModalStation.icon}</span>
              <h3>{openModalStation.name}</h3>
              <button type="button" className="close-btn" onClick={() => setOpenModalStation(null)}>
                ✕
              </button>
            </div>

            <p className="modal-desc">{openModalStation.description}</p>

            <div className="modal-goal-callout">
              <strong>Scenario Objective:</strong> {currentLevel?.goal}
            </div>

            {/* Dynamic Controls generated by Builder */}
            <div className="modal-controls">
              {currentLevel?.controls && currentLevel.controls.length > 0 ? (
                currentLevel.controls.map((ctrl) => (
                  <div key={ctrl.id} className="control-row">
                    <label>
                      <span>{ctrl.label}:</span>
                      {ctrl.type === 'slider' && (
                        <strong>
                          {controlValues[ctrl.id]}
                          {ctrl.unit || ''}
                        </strong>
                      )}
                    </label>

                    {ctrl.type === 'slider' && (
                      <input
                        type="range"
                        min={ctrl.min ?? 0}
                        max={ctrl.max ?? 100}
                        step={ctrl.step ?? 1}
                        value={controlValues[ctrl.id] ?? ctrl.default ?? 50}
                        onChange={(e) =>
                          setControlValues((prev) => ({ ...prev, [ctrl.id]: parseFloat(e.target.value) }))
                        }
                      />
                    )}

                    {ctrl.type === 'toggle' && (
                      <button
                        type="button"
                        className={`toggle-btn ${controlValues[ctrl.id] ? 'checked' : ''}`}
                        onClick={() =>
                          setControlValues((prev) => ({ ...prev, [ctrl.id]: !prev[ctrl.id] }))
                        }
                      >
                        {controlValues[ctrl.id] ? '✓ Active / Verified' : '○ Disabled'}
                      </button>
                    )}

                    {ctrl.type === 'choice' && (
                      <div className="choice-group">
                        {(ctrl.options || []).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`choice-btn ${controlValues[ctrl.id] === opt ? 'active' : ''}`}
                            onClick={() => setControlValues((prev) => ({ ...prev, [ctrl.id]: opt }))}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="no-controls">Press execute to complete this station step.</p>
              )}
            </div>

            {actionFeedback && <div className="action-feedback">{actionFeedback}</div>}

            <div className="modal-footer">
              <button type="button" className="execute-btn" onClick={handleExecuteAction}>
                Perform Action & Check Objective
              </button>
              {isLevelCompleted && activeLevelIdx < activeWorld.levels.length - 1 && (
                <button
                  type="button"
                  className="next-level-btn"
                  onClick={() => {
                    setActiveLevelIdx((prev) => prev + 1)
                    setOpenModalStation(null)
                    setActionFeedback(null)
                  }}
                >
                  Next Level →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
