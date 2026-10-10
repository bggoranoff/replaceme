import { useEffect, useMemo, useRef } from 'react'
import type { Action, DialogueEventDetail } from '../contract'
import { installBridge } from './bridge'
import { ActionError, GameEngine, type EngineMode, type Plan } from './engine'
import { hit, STEP_MS } from './layout'
import type { Dir } from './mechanics/base'
import { drawFrame, RenderView } from './render'
import type { World } from './types'
import './game.css'

export interface GameViewProps {
  world: World
  /** play = human, agent = actor via window.__replaceme (virtual time), spectate = replay of `actions`. */
  mode?: EngineMode
  /** agent/spectate: open this level directly in the playing phase. */
  levelId?: string | null
  /** spectate: the run's actions in order; may grow while the run is live. */
  actions?: Action[]
  /** spectate: replay speed multiplier. */
  speed?: number
  className?: string
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
}

/** Runs a plan against real time: in virtual mode it also advances the engine. */
class PlanRunner {
  private wait = 0
  private plan: Plan
  private virtual: boolean
  done = false

  constructor(plan: Plan, virtual: boolean) {
    this.plan = plan
    this.virtual = virtual
  }

  /** Spends up to `ms` of real time; returns what is left once the plan has finished. */
  step(engine: GameEngine, ms: number): number {
    let left = ms
    while (!this.done) {
      if (this.wait > 0) {
        const use = Math.min(this.wait, left)
        if (this.virtual) engine.advance(use)
        this.wait -= use
        left -= use
        if (this.wait > 0) return 0
        continue
      }
      try {
        const r = this.plan.next()
        if (r.done) this.done = true
        else this.wait = r.value
      } catch (err) {
        if (!(err instanceof ActionError)) throw err
        this.done = true
      }
    }
    return left
  }
}

/** Minimum on-screen time per replayed action, so instant actions stay visible. */
const REPLAY_BEAT_MS = 90

function typingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Space is the timing minigame's big button (same as Up: hold to fill, press to stop). */
function keyDir(engine: GameEngine, key: string): Dir | undefined {
  if (KEYS[key]) return KEYS[key]
  if (key === ' ' && engine.phase === 'playing' && engine.mech?.kind === 'timing') return 'up'
  return undefined
}

function repeatable(engine: GameEngine, dir: Dir): boolean {
  if (engine.phase === 'world') return true
  if (engine.phase !== 'playing' || !engine.mech) return false
  switch (engine.mech.kind) {
    case 'deliver':
    case 'mix':
      return true
    case 'sort':
      return dir === 'left' || dir === 'right'
    case 'converse':
      return dir === 'up' || dir === 'down'
    default:
      return false
  }
}

/** The game renderer. One engine per mounted view; key it by run/world to reset. */
export function GameView({ world, mode = 'play', levelId = null, actions, speed = 1, className }: GameViewProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useMemo(() => new GameEngine(world, mode), [world, mode])
  const actionsRef = useRef<Action[]>(actions ?? [])
  const speedRef = useRef(speed)
  useEffect(() => {
    actionsRef.current = actions ?? []
    speedRef.current = speed
  }, [actions, speed])

  // Level opened directly (agent mode and replays start fresh in the playing phase).
  useEffect(() => {
    if (levelId && (mode === 'agent' || mode === 'spectate')) engine.resetLevel(levelId)
  }, [engine, levelId, mode])

  // Dialogue bubbles -> voice module (game_contract.md section g).
  useEffect(
    () =>
      engine.onEvent((e) => {
        if (e.type !== 'dialogue') return
        const detail: DialogueEventDetail = {
          text: String(e.text ?? ''),
          speaker: String(e.speaker ?? ''),
          npcId: (e.npc_id as string | null) ?? null,
          ...(e.voice ? { voice: String(e.voice) } : {}),
          manual: mode === 'play',
        }
        window.dispatchEvent(new CustomEvent('replaceme:dialogue', { detail }))
      }),
    [engine, mode],
  )

  useEffect(() => (mode === 'spectate' ? undefined : installBridge(engine)), [engine, mode])

  useEffect(() => {
    const cv = canvas.current
    const box = wrap.current
    if (!cv || !box) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const view = new RenderView()
    let scale = 1
    const resize = () => {
      const cssW = box.clientWidth || engine.W
      scale = Math.max(1, Math.ceil((cssW / engine.W) * (window.devicePixelRatio || 1)))
      cv.width = engine.W * scale
      cv.height = engine.H * scale
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(box)

    // --- input (human play only) -----------------------------------------
    const held: Dir[] = []
    const lastStep: Partial<Record<Dir, number>> = {}
    let keyHold = false
    let runner: PlanRunner | null = null
    let replayIndex = 0
    let beat = 0
    let pointer: { x: number; y: number; t: number; moved: boolean } | null = null

    const toLogical = (ev: { clientX: number; clientY: number }) => {
      const r = cv.getBoundingClientRect()
      return { x: ((ev.clientX - r.left) / r.width) * engine.W, y: ((ev.clientY - r.top) / r.height) * engine.H }
    }
    const safe = (fn: () => void) => {
      try {
        fn()
      } catch (err) {
        if (!(err instanceof ActionError)) throw err
      }
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (typingInField(ev.target)) return
      const dir = keyDir(engine, ev.key)
      if (dir) {
        ev.preventDefault()
        if (ev.repeat) return
        runner = null
        if (!held.includes(dir)) held.unshift(dir)
        lastStep[dir] = performance.now()
        if (dir === 'up' && engine.holdStart()) {
          keyHold = true
          return
        }
        safe(() => engine.pressDir(dir))
        return
      }
      if (ev.key === 'Enter' || ev.key === 'e' || ev.key === 'E') {
        ev.preventDefault()
        if (ev.repeat) return
        runner = null
        safe(() => engine.interact())
      }
    }
    const onKeyUp = (ev: KeyboardEvent) => {
      const dir = keyDir(engine, ev.key) ?? (ev.key === ' ' && keyHold ? 'up' : undefined)
      if (!dir) return
      const i = held.indexOf(dir)
      if (i !== -1) held.splice(i, 1)
      if (dir === 'up' && keyHold) {
        keyHold = false
        engine.holdEnd()
      }
    }
    const onBlur = () => {
      held.length = 0
      if (keyHold) {
        keyHold = false
        engine.holdEnd()
      }
    }
    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      ev.preventDefault()
      cv.setPointerCapture(ev.pointerId)
      const p = toLogical(ev)
      pointer = { ...p, t: performance.now(), moved: false }
      safe(() => engine.pointerDown(p.x, p.y))
    }
    const onPointerMove = (ev: PointerEvent) => {
      const p = toLogical(ev)
      if (pointer) {
        if (Math.hypot(p.x - pointer.x, p.y - pointer.y) > 4) pointer.moved = true
        safe(() => engine.pointerMove(p.x, p.y))
      }
      const over = engine.targets().some((t) => t.enabled && hit(t, p.x, p.y))
      cv.style.cursor = over ? 'pointer' : 'default'
    }
    const onPointerUp = (ev: PointerEvent) => {
      if (!pointer) return
      const p = toLogical(ev)
      const wasClick = !pointer.moved
      pointer = null
      safe(() => engine.pointerUp(p.x, p.y))
      if (wasClick) runner = new PlanRunner(engine.clickPlan(p.x, p.y), false)
    }

    if (mode === 'play') {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onBlur)
      cv.addEventListener('pointerdown', onPointerDown)
      cv.addEventListener('pointermove', onPointerMove)
      cv.addEventListener('pointerup', onPointerUp)
      cv.addEventListener('pointercancel', onPointerUp)
    }

    // --- loop ----------------------------------------------------------------
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(100, now - last)
      last = now
      if (mode === 'play') {
        engine.advance(dt)
        const dir = held[0]
        if (dir && repeatable(engine, dir) && !keyHold) {
          while (now - (lastStep[dir] ?? now) >= STEP_MS) {
            lastStep[dir] = (lastStep[dir] ?? now) + STEP_MS
            safe(() => engine.pressDir(dir))
          }
        } else if (dir) lastStep[dir] = now
        if (runner) {
          runner.step(engine, dt)
          if (runner.done) runner = null
        }
      } else if (mode === 'spectate') {
        const queue = actionsRef.current
        const backlog = queue.length - replayIndex
        let budget = dt * speedRef.current * (1 + Math.max(0, backlog - 3) * 0.5)
        while (budget > 0) {
          if (beat > 0) {
            const use = Math.min(beat, budget)
            beat -= use
            budget -= use
            continue
          }
          if (!runner) {
            if (replayIndex >= queue.length) break
            const action = queue[replayIndex++]
            try {
              runner = new PlanRunner(engine.plan(action), true)
            } catch (err) {
              if (!(err instanceof ActionError)) throw err
              continue
            }
          }
          budget = runner.step(engine, budget)
          if (runner.done) {
            runner = null
            beat = REPLAY_BEAT_MS
          }
        }
      }
      drawFrame(ctx, engine, view, scale, now)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      cv.removeEventListener('pointerdown', onPointerDown)
      cv.removeEventListener('pointermove', onPointerMove)
      cv.removeEventListener('pointerup', onPointerUp)
      cv.removeEventListener('pointercancel', onPointerUp)
    }
  }, [engine, mode])

  return (
    <div ref={wrap} className={`game-view${className ? ` ${className}` : ''}`} style={{ aspectRatio: `${engine.W} / ${engine.H}` }} data-mode={mode}>
      <canvas ref={canvas} aria-label={`${world.title}: walk with the arrow keys, Enter to talk or use, or click`} tabIndex={mode === 'play' ? 0 : -1} />
    </div>
  )
}
