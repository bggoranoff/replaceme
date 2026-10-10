import { useEffect, useRef, useState } from 'react'
import { type Skill, toMarkdown } from './skillData'

type Message = { role: 'user' | 'model'; text: string }


export function SkillView({ skill, job, onBack }: { skill: Skill; job: string; onBack: () => void }) {
  const markdown = toMarkdown(skill, job)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const ask = async (text: string) => {
    const question = text.trim()
    if (!question || pending) return
    const next: Message[] = [...messages, { role: 'user', text: question }]
    setMessages(next)
    setDraft('')
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: markdown, messages: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string }
      if (!res.ok || !data.reply) throw new Error(data.error ?? `Request failed (${res.status})`)
      setMessages([...next, { role: 'model', text: data.reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="skill-view">
      <div className="game-top">
        <button type="button" className="back" onClick={onBack}>
          ← All skills
        </button>
      </div>

      <div className="skill-layout">
        <article className="skill-doc">
          <header>
            <span className="level-badge large">L{skill.level}</span>
            <div>
              <span className="skill-file">{skill.id}/SKILL.md</span>
              <h2>{skill.title}</h2>
            </div>
          </header>
          <p className="skill-desc">{skill.description}</p>
          <div className="goal">
            <span>Learned from</span>
            <strong>
              {skill.clears} clears of level {skill.level} · {skill.goal}
            </strong>
          </div>

          <h3>Learned procedure</h3>
          <ol className="steps">
            {skill.steps.map((step, i) => (
              <li key={i}>
                <span className="step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <h3>Success checks</h3>
          <ul className="checks">
            {skill.checks.map((check) => (
              <li key={check}>✓ {check}</li>
            ))}
          </ul>

          <h3>Game actions</h3>
          <div className="action-chips">
            {skill.actions.map((a) => (
              <code key={a}>{a}</code>
            ))}
          </div>

        </article>

        <aside className="chat">
          <div className="chat-head">
            <strong>Ask about this skill</strong>
            <span>Answers come from the agent, based on this SKILL.md</span>
          </div>
          <div className="chat-log" ref={log} aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.text}
              </div>
            ))}
            {pending && (
              <div className="bubble model typing" aria-label="Agent is typing">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && <div className="chat-error">{error}</div>}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault()
              ask(draft)
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a question…" aria-label="Ask a question about this skill" />
            <button type="submit" className="send" disabled={!draft.trim() || pending} aria-label="Send">
              ↑
            </button>
          </form>
        </aside>
      </div>
    </section>
  )
}
