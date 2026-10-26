import { useEffect, useState, type CSSProperties } from 'react'
import type { TrainStatus } from '../contract'
import { GameView } from './GameView'
import type { World } from './types'
import './game.css'

interface GameScreenProps {
  world: World
  /** Starts training (POST /api/train). Rejects with a readable message on failure. */
  onTrain: () => Promise<void>
  /** Opens the trained skills; offered once a training of this world has its skills ready. */
  onSkills: () => void
}

const STATUS_POLL_MS = 3000

/** The human's game screen: the world, "Train agent", and "See skills" once this world's skills are trained. */
export function GameScreen({ world, onTrain, onSkills }: GameScreenProps) {
  const [training, setTraining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skillsReady, setSkillsReady] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const s = (await (await fetch('/api/train/status')).json()) as TrainStatus
        if (alive) setSkillsReady(Boolean(s.skills_ready && s.slug === world.slug && s.status !== 'running'))
      } catch {
        // keep the last known state; the next tick retries
      }
    }
    void tick()
    const id = setInterval(tick, STATUS_POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [world.slug])

  const train = async () => {
    setTraining(true)
    setError(null)
    try {
      await onTrain()
    } catch (err) {
      setTraining(false)
      setError(err instanceof Error ? err.message : 'Training failed')
    }
  }

  return (
    <section className="game-screen">
      <div className="game-stage" style={{ '--aspect': world.map.cols / world.map.rows } as CSSProperties}>
        <GameView key={world.slug} world={world} mode="play" />
      </div>
      <div className="game-actions">
        <button type="button" className="train-agent" onClick={train} disabled={training}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 8V4H8" />
            <rect x="4" y="8" width="16" height="12" rx="2" />
            <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
          </svg>
          {training ? 'Training…' : 'Train agent'}
        </button>
        {skillsReady && (
          <button type="button" className="train-agent see-skills" onClick={onSkills}>
            See skills ›
          </button>
        )}
      </div>
      {error && <p className="game-error">{error}</p>}
    </section>
  )
}
