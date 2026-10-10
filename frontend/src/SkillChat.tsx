import { useEffect, useRef, useState } from 'react'
import { SECTIONS, type Citation, type LearnedSkill, type SectionKey, type SkillChatResponse } from './skillData'

export type ChatMessage = { role: 'user' | 'model'; text: string; citations?: Citation[]; updated?: SectionKey[] }

interface SkillChatProps {
  skill: LearnedSkill
  messages: ChatMessage[]
  onMessages: (messages: ChatMessage[]) => void
  onSkill: (skill: LearnedSkill) => SectionKey[]
}

export function SkillChat({ skill, messages, onMessages, onSkill }: SkillChatProps) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const send = async () => {
    const message = draft.trim()
    if (!message || pending) return
    const history = messages.map(({ role, text }) => ({ role, text }))
    const next: ChatMessage[] = [...messages, { role: 'user', text: message }]
    onMessages(next)
    setDraft('')
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.id)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      })
      const data = (await res.json().catch(() => ({}))) as Partial<SkillChatResponse> & { error?: string }
      if (!res.ok || !data.reply) throw new Error(data.error ?? `Request failed (${res.status})`)
      const updated = data.skill_updated && data.skill ? onSkill(data.skill) : []
      onMessages([...next, { role: 'model', text: data.reply, citations: data.citations ?? [], updated }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <aside className="sk-chat" aria-label={`Chat about ${skill.name}`}>
      <div className="sk-chat-head">
        <strong>Ask about this skill</strong>
        <span>Answers use my {skill.trained_attempts} attempts and a live web search.</span>
      </div>
      <div className="sk-chat-log" ref={log} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`sk-bubble ${m.role}`}>
            <p>{m.text}</p>
            {m.updated && m.updated.length > 0 && <span className="sk-updated-tag">Skill updated: {m.updated.map((k) => SECTIONS[k]).join(', ')}</span>}
            {m.citations && m.citations.length > 0 && (
              <ul className="sk-cites" aria-label="Web sources">
                {m.citations.map((c, j) => (
                  <li key={c.url}>
                    <a href={c.url} target="_blank" rel="noreferrer" title={c.title || c.url}>
                      [{j + 1}] {c.title || c.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {pending && (
          <div className="sk-bubble model sk-typing" aria-label="Agent is typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && <div className="sk-chat-error">{error}</div>}
      </div>
      <form
        className="sk-chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={pending ? 'Thinking…' : 'Ask why, or tell me about your setup'}
          aria-label={`Message about ${skill.name}`}
        />
      </form>
    </aside>
  )
}
