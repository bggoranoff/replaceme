import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Action, RunEvent, RunSummary } from '../contract'
import { fetchWorld, GameView, type GameEngine, type World } from '../game'
import { TILE } from '../game/layout'
import { HalEye } from '../HalEye'

/** Used until the world has loaded (matches the game stage's default). */
const DEFAULT_ASPECT = 1.625

/**
 * Spectator view of one run: the real world renderer replaying the run's `action` events
 * (shared/game_contract.md section c), with the HAL eye in the centre following the bot.
 */
export interface SpectatorProps {
  slug: string | null
  run: RunSummary | null
  events: RunEvent[]
  /** The level has finished all its training attempts: the eye turns into a tick. */
  levelDone?: boolean
}

export function RunSpectator({ slug, run, events, levelDone = false }: SpectatorProps) {
  const [world, setWorld] = useState<World | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [botAt, setBotAt] = useState<{ x: number; y: number }>()

  useEffect(() => {
    if (!slug) return
    let live = true
    fetchWorld(slug).then(
      (w) => live && setWorld(w),
      (err: Error) => live && setError(err.message),
    )
    return () => {
      live = false
    }
  }, [slug])

  const actions = useMemo(
    () => events.flatMap((e): Action[] => (e.type === 'action' ? [e.action] : [])),
    [events],
  )

  // Viewport position of the bot, so the eye can look at it.
  const follow = useCallback((engine: GameEngine, canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect()
    const x = r.left + ((engine.avatar.col * TILE + TILE / 2) / engine.W) * r.width
    const y = r.top + ((engine.avatar.row * TILE + TILE / 2) / engine.H) * r.height
    setBotAt((p) => (p && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5 ? p : { x, y }))
  }, [])

  // The box keeps the world's aspect ratio in every state, so it never resizes when a run starts.
  const aspect = world ? world.map.cols / world.map.rows : DEFAULT_ASPECT
  return (
    <div className="spectator" style={{ '--aspect': aspect } as CSSProperties}>
      {run && world ? (
        <>
          <GameView key={run.id} world={world} mode="spectate" levelId={run.level_id} actions={actions} onFrame={follow} />
          <HalEye className="watcher spec-eye" target={botAt} reach={18} done={levelDone} />
        </>
      ) : (
        <div className="spec-empty">{error ?? 'Cooking…'}</div>
      )}
    </div>
  )
}
