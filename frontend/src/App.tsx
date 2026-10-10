import { useRef, useState } from 'react'
import { SkillView } from './SkillView'
import { Skills } from './Skills'
import { Cafe, type WorldSpec } from './Cafe'
import { Frescoes } from './Frescoes'
import { HalEye } from './HalEye'
import { LoadingScreen } from './LoadingScreen'
import type { Skill } from './skillData'
import { useDictation } from './voice'

function PromptHero({ onSubmit }: { onSubmit: (job: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const dictation = useDictation((text) => {
    setPrompt(text)
    input.current?.focus()
  })
  const listening = dictation.state === 'recording'
  const transcribing = dictation.state === 'transcribing'

  return (
    <section className="hero">
      <HalEye />
      <p className="tagline">replace a human job by training an agent on a cool game</p>

      <form
        className="prompt"
        onSubmit={(e) => {
          e.preventDefault()
          if (prompt.trim()) onSubmit(prompt.trim())
        }}
      >
        <input
          ref={input}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            listening ? 'Listening…' : transcribing ? 'Transcribing…' : 'Who do you want to replace (e.g. barista, florist)?'
          }
          aria-label="Who do you want to replace?"
          autoFocus
        />
        <button
          type="button"
          className={`mic${listening ? ' listening' : ''}${transcribing ? ' transcribing' : ''}`}
          {...dictation.buttonProps}
          disabled={!dictation.available || transcribing}
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          title={dictation.available ? 'Click or hold to speak' : 'Voice input is not available'}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path
              fill="currentColor"
              d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"
            />
          </svg>
        </button>
        <button type="submit" className="send prompt-send" disabled={!prompt.trim()} aria-label="Send">
          ↑
        </button>
      </form>
      {dictation.error && (
        <p className="hint" role="status">
          {dictation.error}
        </p>
      )}
    </section>
  )
}

function App() {
  const [job, setJob] = useState<string | null>(null)
  const [view, setView] = useState<'game' | 'skills'>('game')
  const [skill, setSkill] = useState<Skill | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [researchData, setResearchData] = useState<{ role?: string; levels?: unknown[] } | null>(null)
  const [worldData, setWorldData] = useState<WorldSpec | undefined>(undefined)
  const [isResearching, setIsResearching] = useState(false)

  const start = async (next: string) => {
    setJob(next)
    setView('game')
    setSkill(null)
    setSkills([])
    setResearchData(null)
    setWorldData(undefined)
    setIsResearching(true)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: next }),
      })
      if (res.ok) {
        const data = await res.json()
        setResearchData(data.brief || data)
        setWorldData(data.world || undefined)
      }
    } catch (err) {
      console.warn('Research request failed:', err)
    } finally {
      setIsResearching(false)
    }
  }

  // Rejects when training fails or yields no skills, so the game never reports a fake success.
  const handleTrain = async () => {
    const res = await fetch('/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: job, brief: researchData }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !Array.isArray(data.skills) || data.skills.length === 0) {
      throw new Error(data.error ?? `Training failed (${res.status})`)
    }
    setSkills(data.skills)
  }

  const screen = !job ? (
    <PromptHero onSubmit={start} />
  ) : isResearching ? (
    <LoadingScreen job={job} onCancel={() => setJob(null)} />
  ) : skill ? (
    <SkillView skill={skill} job={job} onBack={() => setSkill(null)} />
  ) : view === 'skills' ? (
    <Skills skills={skills} job={job} onBack={() => setView('game')} onOpen={setSkill} />
  ) : (
    <Cafe
      job={job}
      world={worldData}
      researchData={researchData}
      isResearching={isResearching}
      levelsCount={researchData?.levels?.length ?? worldData?.levels?.length ?? 4}
      onBack={() => setJob(null)}
      onTrain={handleTrain}
      onTrained={() => setView('skills')}
    />
  )

  return (
    <main className="page">
      <Frescoes />
      <header className="brand">
        <img className="logo" src="/favicon.svg?v=5" alt="" />
        replaceme
      </header>
      {screen}
    </main>
  )
}

export default App
