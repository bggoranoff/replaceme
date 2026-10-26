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

const STEPS: { id: Phase; title: string }[] = [
  { id: 'research', title: 'Researching the job' },
  { id: 'build', title: 'Building the world' },
  { id: 'check', title: 'Checking the rules' },
  { id: 'commit', title: 'Saving the game' },
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
        const res = await fetch(`/api/research/progress?run=${encodeURIComponent(run)}&job=${encodeURIComponent(job)}`)
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
  }, [run, job])

  const current = STEPS.findIndex((s) => s.id === progress.phase)

  return (
    <section className="loader">
      <header className="loader-head">
        <h2>
          Building a world for <em>{job}</em>
        </h2>
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
            return (
              <li key={step.id} className={`loader-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="loader-marker" aria-hidden>
                  {state === 'done' ? '✓' : ''}
                </span>
                <div className="loader-step-text">
                  <strong>{step.title}</strong>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
