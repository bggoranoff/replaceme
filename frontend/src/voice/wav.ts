/** 16-bit PCM mono WAV, a format Gradium STT accepts directly. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}

/** Decodes a MediaRecorder blob (webm, ogg, mp4, ...) and re-encodes it as 24 kHz mono WAV. */
export async function recordingToWav(recording: Blob, sampleRate = 24_000): Promise<Blob> {
  // decodeAudioData on an OfflineAudioContext resamples to that context's rate.
  const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(await recording.arrayBuffer())
  const mono = new Float32Array(decoded.length)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c)
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels
  }
  return encodeWav(mono, decoded.sampleRate)
}
