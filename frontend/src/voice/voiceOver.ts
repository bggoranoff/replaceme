import type { DialogueEventDetail } from '../contract'

// Voices NPC speech bubbles with Gradium TTS (via POST /api/tts) while a human plays.
// shared/game_contract.md section g: the game dispatches 'replaceme:dialogue' and never imports this module.

/** Gradium flagship English voices (docs.gradium.ai/guides/voices/flagship-voices), handed out per speaker. */
const SPEAKER_VOICES = [
  'NbpkqMVS3CJeq2j8', // Zoey
  'r2sIQdqqoqgRJuXw', // Marcus
  '4rdlkbxRv4m3UQTW', // Tilly
  'dME3IWyZBvmh1n1q', // Toby
  'gqn4ytOULe-TQfjl', // Saoirse
  'I7GYfpcKbafFrYUv', // Declan
  'YVzbrdWnnu9FgRn5', // Sunnie
  'POBHtemksfWQbng0', // Garrett
  '6PWnV0Nq4wu7RVBT', // Maeve
  'CF0NgaMwHMMrHZn0', // Reuben
]
const VOICE_ID = /^[A-Za-z0-9_-]{1,64}$/

const assigned = new Map<string, string>()

/** The world's voice for the NPC if it names one, else a distinct pool voice per speaker. */
export function voiceFor(detail: Pick<DialogueEventDetail, 'voice' | 'npcId' | 'speaker'>): string | undefined {
  if (detail.voice && VOICE_ID.test(detail.voice)) return detail.voice
  const who = detail.npcId || detail.speaker
  if (!who) return undefined
  let voice = assigned.get(who)
  if (!voice) {
    voice = SPEAKER_VOICES[assigned.size % SPEAKER_VOICES.length]
    assigned.set(who, voice)
  }
  return voice
}

// One line at a time: a new bubble interrupts the line being spoken and supersedes any line still loading.
const player = typeof Audio === 'undefined' ? null : new Audio()
let latest = 0
let loading: AbortController | null = null
let clipUrl: string | null = null
let blocked = false
/** Set when the server says voice is not configured (503); later lines stay silent without a request. */
let unavailable = false

function release(): void {
  if (clipUrl) URL.revokeObjectURL(clipUrl)
  clipUrl = null
}

async function play(): Promise<void> {
  if (!player) return
  try {
    await player.play()
    blocked = false
  } catch (err) {
    // Autoplay policy: keep the clip and retry on the next user gesture.
    if ((err as DOMException).name === 'NotAllowedError') blocked = true
  }
}

async function speak(detail: DialogueEventDetail): Promise<void> {
  if (!player) return
  const id = ++latest
  loading?.abort()
  player.pause()
  blocked = false

  const controller = new AbortController()
  loading = controller
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: detail.text, voice: voiceFor(detail) }),
      signal: controller.signal,
    })
    if (res.status === 503) unavailable = true
    if (!res.ok) return
    const audio = await res.blob()
    if (id !== latest) return
    release()
    clipUrl = URL.createObjectURL(audio)
    player.src = clipUrl
    await play()
  } catch {
    // Voice-over is optional: aborted or failed lines stay silent, the bubble is still on screen.
  } finally {
    if (loading === controller) loading = null
  }
}

function onDialogue(event: Event): void {
  const detail = (event as CustomEvent<DialogueEventDetail>).detail
  if (unavailable || detail?.manual !== true || typeof detail.text !== 'string' || !detail.text.trim()) return
  void speak(detail)
}

function onGesture(): void {
  if (blocked) void play()
}

let installed = false

/** Call once at the app root. */
export function installVoiceOver(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('replaceme:dialogue', onDialogue)
  window.addEventListener('pointerdown', onGesture, true)
  window.addEventListener('keydown', onGesture, true)
  player?.addEventListener('ended', release)
}
