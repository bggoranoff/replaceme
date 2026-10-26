import { useEffect, useRef, useState } from 'react'
import { Skills } from './Skills'
import { fetchWorld, GameScreen, type World } from './game'
import { Frescoes } from './Frescoes'
import { HalEye } from './HalEye'
import { LoadingScreen } from './LoadingScreen'
import { useDictation } from './voice'
import { RunsViewer } from './training/RunsViewer'

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

const query = new URLSearchParams(window.location.search)

function App() {
  const [job, setJob] = useState<string | null>(() => query.get('slug'))
  const [view, setView] = useState<'game' | 'training' | 'skills'>('game')
  const [worldData, setWorldData] = useState<World | undefined>(undefined)
  const [isResearching, setIsResearching] = useState(() => !!query.get('slug'))
  const [worldError, setWorldError] = useState<string | null>(null)

  // /?slug=<slug> opens an already generated game.
  useEffect(() => {
    const slug = query.get('slug')
    if (!slug) return
    fetchWorld(slug)
      .then((w) => {
        setJob(w.job)
        setWorldData(w)
      })
      .catch((err: Error) => setWorldError(err.message))
      .finally(() => setIsResearching(false))
  }, [])

  const start = async (next: string) => {
    setJob(next)
    setView('game')
    setWorldData(undefined)
    setWorldError(null)
    setIsResearching(true)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.world) {
        setWorldData(data.world)
      } else {
        setWorldError(data.error ?? `Could not build a game for "${next}" (${res.status})`)
      }
    } catch (err) {
      console.warn('Research request failed:', err)
      setWorldError(`Could not build a game for "${next}"`)
    } finally {
      setIsResearching(false)
    }
  }

  // POST /api/train {slug} (game_contract.md section d) and show the runs viewer. Rejects on failure so the game never fakes success.
  const handleTrain = async () => {
    const res = await fetch('/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: worldData?.slug }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `Training failed (${res.status})`)
    setView('training')
  }

  // Home: back to the prompt. Drops ?slug= so a reload stays on the prompt too.
  const goHome = () => {
    setJob(null)
    setView('game')
    setWorldData(undefined)
    setWorldError(null)
    setIsResearching(false)
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }

  const screen = !job ? (
    <PromptHero onSubmit={start} />
  ) : isResearching ? (
    <LoadingScreen job={job} onCancel={() => setJob(null)} />
  ) : view === 'training' ? (
    <RunsViewer onDone={() => setView('skills')} onBack={() => setView('game')} />
  ) : view === 'skills' ? (
    <Skills job={job} onBack={() => setView('game')} />
  ) : worldData ? (
    <GameScreen world={worldData} onTrain={handleTrain} onSkills={() => setView('skills')} />
  ) : (
    <p className="game-error world-error">{worldError ?? `No game for "${job}" yet.`}</p>
  )

  return (
    <main className="page">
      <Frescoes />
      <header className="brand">
        <img className="logo" src="/favicon.svg?v=5" alt="" />
        replaceme
      </header>
      {job && (
        <button type="button" className="home" onClick={goHome} aria-label="Home" title="Home">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11 12 4l9 7" />
            <path d="M5 10v10h5v-6h4v6h5V10" />
          </svg>
        </button>
      )}
      {screen}
    </main>
  )
}

export default App
