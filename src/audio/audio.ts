/**
 * Audio playback for Uzbek words and phrases.
 *
 * Prefers prebuilt MP3s, looked up in /audio/manifest.json by a hash of the
 * spoken text (see key.ts) and cached CacheFirst by Workbox. Falls back to
 * the Web Speech API, requesting an Uzbek voice where the device has one.
 */
import { audioKey } from './key'
import { useSettingsStore } from '@/stores/settings'

const base = import.meta.env.BASE_URL

export interface AudioManifestEntry {
  file: string
  reviewed?: boolean
}

/** key -> entry. Legacy manifests used a bare filename string; both are read. */
export type AudioManifest = Record<string, AudioManifestEntry | string>

/** Filename for a manifest entry, tolerating the legacy string form. */
export function audioFile(entry: AudioManifestEntry | string): string {
  return typeof entry === 'string' ? entry : entry.file
}

/** Whether a manifest entry has been reviewed (false for legacy/string form). */
export function isReviewed(entry: AudioManifestEntry | string | undefined): boolean {
  return typeof entry === 'object' && entry !== null ? Boolean(entry.reviewed) : false
}

const manifestCache = new Map<string, Promise<AudioManifest | null>>()

export function getAudioManifest(voice?: string): Promise<AudioManifest | null> {
  const v = voice ?? useSettingsStore().audioVoice
  if (!manifestCache.has(v)) {
    manifestCache.set(
      v,
      fetch(`${base}audio/${v}/manifest.json`)
        .then((res) => (res.ok ? (res.json() as Promise<AudioManifest>) : null))
        .catch(() => null),
    )
  }
  return manifestCache.get(v)!
}

let currentAudio: HTMLAudioElement | null = null
let currentResolve: ((v: boolean) => void) | null = null

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (currentResolve) {
    currentResolve(false)
    currentResolve = null
  }
}

function playFile(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    currentAudio = audio
    currentResolve = resolve
    const done = (v: boolean) => {
      if (currentResolve === resolve) currentResolve = null
      resolve(v)
    }
    audio.onended = () => done(true)
    audio.onerror = () => done(false)
    audio.play().catch(() => done(false))
  })
}

function speakWithSynthesis(text: string): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve()
  return new Promise((resolve) => {
    // Some engines never fire onend/onerror (e.g. no voice for the language),
    // so a watchdog keeps callers like the roleplay auto-advance from hanging.
    const watchdog = setTimeout(done, Math.min(2000 + text.length * 120, 10000))
    function done() {
      clearTimeout(watchdog)
      resolve()
    }
    const utterance = new SpeechSynthesisUtterance(text)
    const uzbekVoice = speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith('uz'))
    if (uzbekVoice) utterance.voice = uzbekVoice
    utterance.lang = 'uz-UZ'
    utterance.rate = 0.85
    utterance.onend = done
    utterance.onerror = done
    speechSynthesis.speak(utterance)
  })
}

/** Plays a short ascending three-note chime to signal a correct answer. */
export function playChime(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [
      { freq: 1046.5, start: 0, dur: 0.45 },
      { freq: 1318.5, start: 0.1, dur: 0.55 },
      { freq: 1568.0, start: 0.2, dur: 0.65 },
    ]
    for (const { freq, start, dur } of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    setTimeout(() => ctx.close(), 1500)
  } catch {
    // audio unavailable
  }
}

/**
 * Speaks Uzbek text aloud. Resolves when playback finishes (or immediately if
 * no audio backend is available), so callers can sequence on it.
 */
export async function speakUzbek(text: string): Promise<void> {
  stopSpeaking()
  const voice = useSettingsStore().audioVoice
  const manifest = await getAudioManifest(voice)
  const entry = manifest?.[audioKey(text)]
  const file = entry ? audioFile(entry) : undefined
  if (file && (await playFile(`${base}audio/${voice}/${file}`))) return
  await speakWithSynthesis(text)
}
