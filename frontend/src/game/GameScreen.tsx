import { useState, type CSSProperties } from 'react'
import { GameView } from './GameView'
import type { World } from './types'
import './game.css'

interface GameScreenProps {
  world: World
  /** Starts training (POST /api/train). Rejects with a readable message on failure. */
  onTrain: () => Promise<void>
}

/** The human's game screen: the world and one button, "Train agent". */
export function GameScreen({ world, onTrain }: GameScreenProps) {
  const [training, setTraining] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <button type="button" className="train-agent" onClick={train} disabled={training}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 8V4H8" />
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
        </svg>
        {training ? 'Training…' : 'Train agent'}
      </button>
      {error && <p className="game-error">{error}</p>}
    </section>
  )
}
