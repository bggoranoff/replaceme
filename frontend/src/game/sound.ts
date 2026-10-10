// Tiny procedural WebAudio sounds (no files). Pure feedback: never touches game state.
//
//   playSfx(name, { pitch?, volume? })   one-shot: 'tap' | 'pop' | 'pour' | 'ding' | 'success' | 'fail' | 'tick' | 'whoosh' | 'snap'
//   startLoop(name) -> stop()            continuous: 'pour' (liquid trickle), 'hum' (machine / blender)
//   setMuted(bool) / isMuted()           global switch (there is no UI toggle; agent and spectator
//                                        engines never call in here, see Juice.sfx in render/juice.ts)
//
// The AudioContext is created lazily on the first sound, which in play mode always follows a
// key press or click, so browsers allow it. Every call is a safe no-op when audio is unavailable.

export type SfxName = 'tap' | 'pop' | 'pour' | 'ding' | 'success' | 'fail' | 'tick' | 'whoosh' | 'snap'
export type LoopName = 'pour' | 'hum'

let ac: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let noiseBuf: AudioBuffer | null = null

export function setMuted(m: boolean) {
  muted = m
  if (master) master.gain.value = m ? 0 : 0.5
}

export function isMuted() {
  return muted
}

function audio(): AudioContext | null {
  if (muted) return null
  try {
    if (!ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ac = new AC()
      master = ac.createGain()
      master.gain.value = 0.5
      master.connect(ac.destination)
    }
    if (ac.state === 'suspended') void ac.resume()
    return ac
  } catch {
    return null
  }
}

function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== a.sampleRate) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

function tone(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(master!)
  o.start(at)
  o.stop(at + dur + 0.02)
}

function hiss(a: AudioContext, at: number, dur: number, vol: number, from: number, to: number, q = 1.2) {
  const s = a.createBufferSource()
  s.buffer = noise(a)
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = q
  f.frequency.setValueAtTime(from, at)
  f.frequency.exponentialRampToValueAtTime(to, at + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(vol, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  s.connect(f).connect(g).connect(master!)
  s.start(at, Math.random() * 0.5)
  s.stop(at + dur + 0.02)
}

export function playSfx(name: SfxName, opts: { pitch?: number; volume?: number } = {}) {
  const a = audio()
  if (!a || !master) return
  const p = opts.pitch ?? 1
  const v = opts.volume ?? 1
  const t = a.currentTime + 0.005
  try {
    switch (name) {
      case 'tap':
        tone(a, 660 * p, t, 0.06, 'square', 0.06 * v)
        break
      case 'tick':
        tone(a, 1200 * p, t, 0.03, 'triangle', 0.07 * v)
        break
      case 'snap':
        tone(a, 300 * p, t, 0.05, 'square', 0.08 * v, 140 * p)
        hiss(a, t, 0.05, 0.12 * v, 3000, 1500, 0.8)
        break
      case 'pop':
        tone(a, 380 * p, t, 0.11, 'sine', 0.22 * v, 900 * p)
        break
      case 'whoosh':
        hiss(a, t, 0.22, 0.12 * v, 600 * p, 2600 * p, 0.9)
        break
      case 'pour':
        hiss(a, t, 0.35, 0.1 * v, 900 * p, 1800 * p, 2.5)
        for (let i = 0; i < 4; i++) tone(a, (500 + Math.random() * 500) * p, t + i * 0.07, 0.05, 'sine', 0.04 * v, 1100 * p)
        break
      case 'ding':
        tone(a, 1318 * p, t, 0.9, 'sine', 0.22 * v)
        tone(a, 2637 * p, t, 0.5, 'sine', 0.06 * v)
        break
      case 'success':
        ;[523, 659, 784, 1047].forEach((f, i) => tone(a, f * p, t + i * 0.09, i === 3 ? 0.5 : 0.16, 'triangle', 0.16 * v))
        break
      case 'fail':
        ;[392, 370, 349, 311].forEach((f, i) => tone(a, f * p, t + i * 0.16, i === 3 ? 0.55 : 0.18, 'sawtooth', 0.05 * v, i === 3 ? 260 * p : undefined))
        break
    }
  } catch {
    // audio is optional
  }
}

/** Starts a continuous sound; returns a function that fades it out. */
export function startLoop(name: LoopName, opts: { pitch?: number; volume?: number } = {}): () => void {
  const a = audio()
  if (!a || !master) return () => {}
  const p = opts.pitch ?? 1
  const v = opts.volume ?? 1
  try {
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, a.currentTime)
    g.gain.exponentialRampToValueAtTime((name === 'pour' ? 0.09 : 0.05) * v, a.currentTime + 0.06)
    g.connect(master)
    const nodes: AudioScheduledSourceNode[] = []
    if (name === 'pour') {
      const s = a.createBufferSource()
      s.buffer = noise(a)
      s.loop = true
      const f = a.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1300 * p
      f.Q.value = 3
      const lfo = a.createOscillator()
      const lg = a.createGain()
      lfo.frequency.value = 7
      lg.gain.value = 350 * p
      lfo.connect(lg).connect(f.frequency)
      s.connect(f).connect(g)
      nodes.push(s, lfo)
    } else {
      const o = a.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 95 * p
      const f = a.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 500
      const lfo = a.createOscillator()
      const lg = a.createGain()
      lfo.frequency.value = 11
      lg.gain.value = 6
      lfo.connect(lg).connect(o.frequency)
      o.connect(f).connect(g)
      nodes.push(o, lfo)
    }
    nodes.forEach((n) => n.start())
    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      try {
        const now = a.currentTime
        g.gain.cancelScheduledValues(now)
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
        nodes.forEach((n) => n.stop(now + 0.1))
      } catch {
        // already gone
      }
    }
  } catch {
    return () => {}
  }
}
