import { useEffect, useRef, useState } from 'react'
import { SkillChat, type ChatMessage } from './SkillChat'
import { SkillView } from './SkillView'
import { changedSections, type LearnedSkill, type SectionKey } from './skillData'
import './Skills.css'

const HIGHLIGHT_MS = 4000

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

export function Skills({ job }: { job?: string }) {
  const [skills, setSkills] = useState<LearnedSkill[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({})
  const [updated, setUpdated] = useState<Record<string, SectionKey[]>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    let live = true
    fetch('/api/skills')
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { skills?: LearnedSkill[]; error?: string }
        if (!res.ok || !Array.isArray(data.skills)) throw new Error(data.error ?? `Could not load skills (${res.status})`)
        if (live) setSkills(data.skills)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    const pending = timers.current
    return () => {
      live = false
      Object.values(pending).forEach(clearTimeout)
    }
  }, [])

  const count = skills?.length ?? 0
  useEffect(() => {
    if (count < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setSelected((i) => (i + 1) % count)
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setSelected((i) => (i - 1 + count) % count)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count])

  if (error) return <p className="sk-status">{error}</p>
  if (!skills) return <p className="sk-status">Loading skills…</p>
  if (skills.length === 0) return <p className="sk-status">No skills yet. Train the agent first.</p>

  const skill = skills[Math.min(selected, skills.length - 1)]

  /** Swaps in the updated skill and highlights the sections that changed. */
  const applySkill = (next: LearnedSkill): SectionKey[] => {
    const prev = skills.find((s) => s.id === next.id)
    const changed = prev ? changedSections(prev, next) : []
    setSkills((list) => list?.map((s) => (s.id === next.id ? next : s)) ?? list)
    setUpdated((u) => ({ ...u, [next.id]: changed }))
    clearTimeout(timers.current[next.id])
    timers.current[next.id] = setTimeout(() => setUpdated((u) => ({ ...u, [next.id]: [] })), HIGHLIGHT_MS)
    return changed
  }

  return (
    <section className="sk-screen">
      <h1 className="sk-title">Skills learned for {job || skill.job}</h1>

      <div className="sk-layout">
        <nav className="sk-list" aria-label="Learned skills">
          {skills.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`sk-card${s.id === skill.id ? ' active' : ''}`}
              aria-current={s.id === skill.id}
              onClick={() => setSelected(i)}
            >
              <span className="sk-badge">L{s.level_index}</span>
              <span className="sk-card-body">
                <strong>{s.name}</strong>
                <span>best {s.best_score}</span>
              </span>
            </button>
          ))}
        </nav>

        <SkillView skill={skill} updated={new Set(updated[skill.id] ?? [])} />

        <SkillChat
          key={skill.id}
          skill={skill}
          messages={chats[skill.id] ?? []}
          onMessages={(m) => setChats((c) => ({ ...c, [skill.id]: m }))}
          onSkill={applySkill}
        />
      </div>
    </section>
  )
}
