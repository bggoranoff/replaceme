import { useEffect, useRef, useState } from 'react'
import type { RunEvent, RunSummary, TrainStatus } from '../contract'
import { RunSpectator } from './RunSpectator'
import './runs.css'

const POLL_MS = 1000

/**
 * Training screen (shared/game_contract.md section d): one run on screen at a time. Each level trains
 * in its own browser, so "Run i/N" walks the N concurrently trained levels, each showing its latest
 * attempt. Left/Right arrow keys or the two on-screen arrows switch runs. Calls onDone when skills are ready.
 */
export function RunsViewer({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<TrainStatus | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [lane, setLane] = useState(0)
  const [stream, setStream] = useState<{ id: string | null; events: RunEvent[] }>({ id: null, events: [] })

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const s = (await (await fetch('/api/train/status')).json()) as TrainStatus
        if (!alive) return
        setStatus(s)
        if (!s.training_id) return
        const r = (await (await fetch(`/api/runs?training_id=${encodeURIComponent(s.training_id)}`)).json()) as { runs?: RunSummary[] }
        if (alive) setRuns(r.runs ?? [])
      } catch {
        // keep the last known state; the next tick retries
      }
    }
    void tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })
  const ready = Boolean(status?.skills_ready && status.status !== 'running')
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => doneRef.current(), 1500)
    return () => clearTimeout(t)
  }, [ready])

  const lanes = status?.levels ?? []
  const n = lanes.length
  const index = n ? ((lane % n) + n) % n : 0
  const current = lanes[index]
  const laneRuns = runs.filter((r) => r.level_id === current?.level_id)
  const run = laneRuns.reduce<RunSummary | null>((a, r) => (!a || r.attempt > a.attempt ? r : a), null)
  const runId = run?.id ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setLane((i) => i - 1)
      else if (e.key === 'ArrowRight') setLane((i) => i + 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!runId) return
    const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`)
    es.addEventListener('run_event', (m) => {
      const ev = JSON.parse((m as MessageEvent<string>).data) as RunEvent
      setStream((prev) => {
        const events = prev.id === runId ? prev.events : []
        return events.some((p) => p.seq === ev.seq) ? prev : { id: runId, events: [...events, ev] }
      })
    })
    return () => es.close()
  }, [runId])

  const events = stream.id === runId ? stream.events : []
  const ended = [...events].reverse().find((e) => e.type === 'run_finished' || (e.type === 'action' && e.result.done))
  const score = run?.score ?? (ended?.type === 'run_finished' ? ended.score : ended?.type === 'action' ? ended.result.score : null)
  const failed = status?.status === 'error' && !status.skills_ready

  return (
    <section className="runs" aria-label="Agent training runs">
      <p className="runs-indicator" aria-live="polite">
        {n ? (
          <>
            Run {index + 1}/{n} · {current.level_title} · attempt {run?.attempt ?? 0}/{current.attempts_total} · score{' '}
            {score ?? '…'}
          </>
        ) : (
          'Starting the agent…'
        )}
      </p>
      <div className="runs-stage">
        <button type="button" className="runs-arrow" onClick={() => setLane((i) => i - 1)} disabled={n < 2} aria-label="Previous run">
          ‹
        </button>
        <RunSpectator slug={status?.slug ?? null} run={run} events={events} />
        <button type="button" className="runs-arrow" onClick={() => setLane((i) => i + 1)} disabled={n < 2} aria-label="Next run">
          ›
        </button>
      </div>
      {failed && <p className="runs-error">Training stopped: {status?.error ?? 'unknown error'}</p>}
    </section>
  )
}
