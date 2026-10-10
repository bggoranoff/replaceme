import { useEffect, useState } from 'react'
import { DinoGame } from './DinoGame'
import './LoadingScreen.css'

interface LoadingScreenProps {
  job: string
  onCancel?: () => void
}

// Mirrors frontend/server/api/progress.ts.
type Phase = 'research' | 'build' | 'check' | 'commit'
interface ResearchProgress {
  phase: Phase
  tasks: string[]
}

const STEPS: { id: Phase; title: string; detail: string }[] = [
  { id: 'research', title: 'Researching the job', detail: 'Gemini and Google Search find four real tasks, their controls and what good looks like.' },
  { id: 'build', title: 'Building the world', detail: 'The builder lays out a cozy map with quest-giving neighbours and four levels.' },
  { id: 'check', title: 'Checking the rules', detail: 'Entire Graph checks every level against the platform rules on main.' },
  { id: 'commit', title: 'Saving the game', detail: 'The finished world is committed to its own game branch.' },
]

const POLL_MS = 2000

function newRunToken(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function LoadingScreen({ job }: LoadingScreenProps) {
  const [run] = useState(newRunToken)
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  const [progress, setProgress] = useState<ResearchProgress>({ phase: 'research', tasks: [] })

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch(`/api/research/progress?run=${encodeURIComponent(run)}`)
        if (!res.ok) return
        const data = (await res.json()) as ResearchProgress
        if (alive && STEPS.some((s) => s.id === data.phase)) setProgress(data)
      } catch {
        // keep the last known step; the research request itself reports failures
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [run])

  const current = STEPS.findIndex((s) => s.id === progress.phase)

  return (
    <section className="loader">
      <header className="loader-head">
        <p className="loader-kicker">Generating your game</p>
        <h2>
          Building a world for <em>{job}</em>
        </h2>
        <p className="loader-sub">Our agents are researching the job and building four levels. Play while you wait.</p>
      </header>

      <div className="loader-game">
        <DinoGame />
      </div>

      <div className="loader-progress">
        <div className="loader-progress-head">
          <span aria-live="polite">
            Step {current + 1} of {STEPS.length}
          </span>
          <span className="loader-elapsed">{clock(now - startedAt)}</span>
        </div>
        <ol className="loader-steps">
          {STEPS.map((step, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'pending'
            const found = step.id === 'research' && progress.tasks.length > 0
            return (
              <li key={step.id} className={`loader-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="loader-marker" aria-hidden>
                  {state === 'done' ? '✓' : ''}
                </span>
                <div className="loader-step-text">
                  <strong>{step.title}</strong>
                  <span>{found ? `Found: ${progress.tasks.join(' · ')}` : step.detail}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
