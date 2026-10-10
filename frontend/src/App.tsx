import { useEffect, useRef, useState } from 'react'
import { SkillView } from './SkillView'
import { Skills } from './Skills'
import { Cafe } from './Cafe'
import { Frescoes } from './Frescoes'
import { HalEye } from './HalEye'
import type { Skill } from './skillData'

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type RecognitionCtor = new () => Recognition

const SpeechRecognition: RecognitionCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition

function PromptHero({ onSubmit }: { onSubmit: (job: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [listening, setListening] = useState(false)
  const recognition = useRef<Recognition | null>(null)

  useEffect(() => () => recognition.current?.stop(), [])

  const toggleVoice = () => {
    if (!SpeechRecognition) return
    if (listening) {
      recognition.current?.stop()
      return
    }
    const r = new SpeechRecognition()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = false
    r.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')
      setPrompt(text)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recognition.current = r
    r.start()
    setListening(true)
  }

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
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={listening ? 'Listening…' : 'Who do you want to replace?'}
          aria-label="Who do you want to replace?"
          autoFocus
        />
        <button
          type="button"
          className={`mic${listening ? ' listening' : ''}`}
          onClick={toggleVoice}
          disabled={!SpeechRecognition}
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          title={SpeechRecognition ? 'Speak your answer' : 'Voice input is not supported in this browser'}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path
              fill="currentColor"
              d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"
            />
          </svg>
        </button>
      </form>
    </section>
  )
}

function App() {
  const [job, setJob] = useState<string | null>(null)
  const [view, setView] = useState<'game' | 'skills'>('game')
  const [skill, setSkill] = useState<Skill | null>(null)

  const start = (next: string) => {
    setJob(next)
    setView('game')
    setSkill(null)
  }

  const screen = !job ? (
    <PromptHero onSubmit={start} />
  ) : skill ? (
    <SkillView skill={skill} job={job} onBack={() => setSkill(null)} />
  ) : view === 'skills' ? (
    <Skills onBack={() => setView('game')} onOpen={setSkill} />
  ) : (
    <Cafe onBack={() => setJob(null)} onTrain={() => setView('skills')} />
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
