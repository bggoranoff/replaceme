import type { Observation, RunEvent, RunSummary } from '../contract'

/**
 * Spectator view of one run. This is the single swap point: the integrator replaces this placeholder
 * with the world renderer (<GameView mode="spectate">), which replays the run's `action` events
 * (shared/game_contract.md section c). Props stay the same.
 */
export interface SpectatorProps {
  run: RunSummary | null
  events: RunEvent[]
}

function latestObservation(events: RunEvent[]): Observation | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.type === 'action') return ev.result.observation
  }
  return null
}

function actionLabel(events: RunEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.type !== 'action') continue
    const p = ev.action.params ?? {}
    const steps = p.hold_ms ? ` ×${1 + Math.floor(p.hold_ms / 100)}` : ''
    const target = p.target_id ? ` ${p.target_id}` : p.ms ? ` ${p.ms} ms` : ''
    return `${ev.action.action.replace('_', ' ')}${steps}${target}`
  }
  return null
}

type Num = { id: string; label: string; unit?: string; min: number; max: number; value: number }

function Bar({ v, active }: { v: Num; active?: boolean }) {
  const pct = v.max > v.min ? ((v.value - v.min) / (v.max - v.min)) * 100 : 0
  return (
    <div className={`spec-var${active ? ' active' : ''}`}>
      <div className="spec-var-label">
        <span>{v.label}</span>
        <b>
          {Math.round(v.value * 100) / 100} {v.unit}
        </b>
      </div>
      <div className="spec-track">
        <div className="spec-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

function MechanicView({ obs }: { obs: Observation }) {
  const ms = obs.mechanic_state as Record<string, any>
  switch (obs.mechanic) {
    case 'mix':
      return (
        <div className="spec-vars">
          {(ms.variables ?? []).map((v: Num, i: number) => (
            <Bar key={v.id} v={v} active={i === ms.selected_index} />
          ))}
        </div>
      )
    case 'timing':
      return (
        <div className="spec-vars">
          {ms.meter && <Bar v={ms.meter} active />}
          {(ms.results ?? []).map((r: { id: string; value: number }) => (
            <p key={r.id} className="spec-muted">
              {r.id}: {Math.round(r.value * 100) / 100}
            </p>
          ))}
        </div>
      )
    case 'sort':
      return (
        <div className="spec-sort">
          <div className="spec-card">{ms.current_item?.label ?? 'All placed'}</div>
          <div className="spec-bins">
            {(ms.bins ?? []).map((b: { id: string; label: string }, i: number) => (
              <div key={b.id} className={`spec-bin${i === ms.selected_bin || b.id === ms.selected_bin ? ' active' : ''}`}>
                {b.label}
                <small>{(ms.placed ?? []).filter((p: { bin_id: string }) => p.bin_id === b.id).length}</small>
              </div>
            ))}
          </div>
        </div>
      )
    case 'converse':
      return (
        <div className="spec-talk">
          {ms.line && <p className="spec-bubble">{ms.npc?.name ? <b>{ms.npc.name}: </b> : null}{ms.line}</p>}
          <ol className="spec-options">
            {(ms.options ?? []).map((o: { id: string; text: string }, i: number) => (
              <li key={o.id} className={i === ms.selected_index ? 'active' : ''}>
                {o.text}
              </li>
            ))}
          </ol>
        </div>
      )
    case 'deliver': {
      const { cols, rows, blocked } = obs.grid
      const tile = obs.viewport.w / Math.max(1, cols)
      return (
        <div className="spec-map" style={{ aspectRatio: `${cols} / ${rows}` }}>
          {blocked.map(([c, r]) => (
            <i key={`${c},${r}`} className="spec-solid" style={{ left: `${(c / cols) * 100}%`, top: `${(r / rows) * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%` }} />
          ))}
          {obs.targets.map((t) => (
            <span key={t.id} className="spec-target" style={{ left: `${(t.x / tile / cols) * 100}%`, top: `${(t.y / tile / rows) * 100}%` }}>
              {t.label}
            </span>
          ))}
          <i className="spec-avatar" style={{ left: `${(obs.avatar.tile[0] / cols) * 100}%`, top: `${(obs.avatar.tile[1] / rows) * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%` }} />
        </div>
      )
    }
    default:
      return null
  }
}

export function RunSpectator({ run, events }: SpectatorProps) {
  const obs = latestObservation(events)
  const started = events.find((e) => e.type === 'run_started')
  const notes = events.filter((e): e is Extract<RunEvent, { type: 'note' }> => e.type === 'note')
  const last = actionLabel(events)
  if (!run) return <div className="spectator spec-empty">Waiting for the agent to start…</div>
  return (
    <div className="spectator">
      {obs ? (
        <>
          <p className="spec-aim">{obs.aim}</p>
          <MechanicView obs={obs} />
          {obs.last_result && (
            <div className={`spec-result${obs.last_result.passed ? ' passed' : ''}`}>
              <strong>{obs.last_result.score}</strong>
              <span>{obs.last_result.passed ? 'Passed' : 'Not yet'}</span>
              <ul>
                {obs.last_result.feedback.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="spec-empty">Thinking about the next attempt…</p>
      )}
      <div className="spec-thought">
        {last && <span className="spec-last">{last}</span>}
        {started && started.type === 'run_started' && started.hypothesis && <p>{started.hypothesis}</p>}
        {notes.length > 0 && <p className="spec-muted">{notes[notes.length - 1].text}</p>}
      </div>
    </div>
  )
}
