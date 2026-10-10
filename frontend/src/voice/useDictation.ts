import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { recordingToWav } from './wav'

// Speech-to-text for a text input: records the mic, sends it to POST /api/stt (Gradium) and hands back the text.
// Click to start and click again to stop, or hold to talk and release to stop.

export type DictationState = 'idle' | 'recording' | 'transcribing'

/** A press held at least this long is push-to-talk: releasing it stops the recording. */
const HOLD_MS = 350
const MAX_RECORDING_MS = 30_000

interface Session {
  stream?: MediaStream
  recorder?: MediaRecorder
  chunks: Blob[]
  pressedAt: number
  /** performance.now() when recording began; 0 while waiting for the microphone. */
  startedAt: number
  timer?: number
  cancelled: boolean
}

const canRecord = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

function micError(err: unknown): string {
  const name = (err as DOMException)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access is blocked. You can type instead.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found. You can type instead.'
  return 'The microphone could not start. You can type instead.'
}

export function useDictation(onTranscript: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState(canRecord)
  const session = useRef<Session | null>(null)
  const deliver = useRef(onTranscript)

  useEffect(() => {
    deliver.current = onTranscript
  }, [onTranscript])

  useEffect(
    () => () => {
      const s = session.current
      if (!s) return
      s.cancelled = true
      if (s.recorder?.state === 'recording') s.recorder.stop()
      else s.stream?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  const transcribe = async (recording: Blob) => {
    setState('transcribing')
    try {
      let body = recording
      try {
        body = await recordingToWav(recording)
      } catch {
        // Send the original recording; the server converts it.
      }
      const res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': body.type || 'application/octet-stream' },
        body,
      })
      const data = (await res.json().catch(() => ({}))) as { text?: unknown }
      if (res.status === 503) {
        setAvailable(false)
        setError("Voice input isn't set up here. You can type instead.")
      } else if (!res.ok) {
        setError("Couldn't transcribe that. Try again or type it.")
      } else if (typeof data.text !== 'string' || !data.text.trim()) {
        setError("Didn't catch that. Try again or type it.")
      } else {
        deliver.current(data.text.trim())
      }
    } catch {
      setError("Couldn't transcribe that. Try again or type it.")
    } finally {
      setState('idle')
    }
  }

  const finish = (s: Session) => {
    s.stream?.getTracks().forEach((t) => t.stop())
    window.clearTimeout(s.timer)
    if (session.current === s) session.current = null
    if (s.cancelled) return
    void transcribe(new Blob(s.chunks, { type: s.recorder?.mimeType || 'audio/webm' }))
  }

  const start = async (pressedAt: number) => {
    if (session.current || state === 'transcribing') return
    setError(null)
    const s: Session = { chunks: [], pressedAt, startedAt: 0, cancelled: false }
    session.current = s
    try {
      s.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      if (s.cancelled) return finish(s)
      s.recorder = new MediaRecorder(s.stream)
    } catch (err) {
      s.stream?.getTracks().forEach((t) => t.stop())
      session.current = null
      setError(micError(err))
      return
    }
    const recorder = s.recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) s.chunks.push(e.data)
    }
    recorder.onstop = () => finish(s)
    recorder.start()
    s.startedAt = performance.now()
    s.timer = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_RECORDING_MS)
    setState('recording')
  }

  const stop = () => {
    const s = session.current
    if (!s) return
    if (s.recorder?.state === 'recording') s.recorder.stop()
    // Pressed again while still waiting for the microphone: cancel instead of starting to record.
    else if (!s.recorder) s.cancelled = true
  }

  const buttonProps = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      if (session.current) stop()
      else void start(performance.now())
    },
    onPointerUp: () => {
      const s = session.current
      if (s && s.startedAt > 0 && performance.now() - s.pressedAt >= HOLD_MS) stop()
    },
    // Keyboard activation (Enter/Space) arrives as a click with detail 0; pointer clicks are handled above.
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      if (e.detail !== 0) return
      if (session.current) stop()
      else void start(performance.now())
    },
  }

  return { state, error, available, buttonProps }
}
