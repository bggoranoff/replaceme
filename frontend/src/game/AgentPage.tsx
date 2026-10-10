import { useEffect, useState } from 'react'
import { GameView } from './GameView'
import { fetchWorld } from './api'
import type { World } from './types'
import './game.css'

/** Agent mode (/?slug=&level=&run=&agent=1): only the game, loaded from GET /api/world. */
export function AgentPage({ slug, levelId }: { slug: string; levelId: string | null }) {
  const [world, setWorld] = useState<World | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchWorld(slug).then(
      (w) => live && setWorld(w),
      (err: Error) => live && setError(err.message),
    )
    return () => {
      live = false
    }
  }, [slug])

  if (error) return <p className="game-error">{error}</p>
  if (!world) return null
  return (
    <main className="agent-page">
      <GameView world={world} mode="agent" levelId={levelId} />
    </main>
  )
}
