/**
 * Audio playback for Uzbek words and phrases.
 *
 * Prefers prebuilt MP3s, looked up in /audio/manifest.json by a hash of the
 * spoken text (see key.ts) and cached CacheFirst by Workbox. Falls back to
 * the Web Speech API, requesting an Uzbek voice where the device has one.
 */
import { audioKey } from './key'
import { noteUzbekViewed } from '@/feedback/activityContext'

const base = import.meta.env.BASE_URL

const AUDIO_VOICE = 'yandex'

export interface AudioManifestEntry {
  file: string
  reviewed?: boolean
  slowFile?: string
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
  const v = voice ?? AUDIO_VOICE
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
let speakGen = 0

export function stopSpeaking(): void {
  speakGen++
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

/**
 * Voices to try after Uzbek itself, best first — an opt-in, because a caller
 * that would rather say nothing recognisable than say it in the wrong accent
 * should not get one by surprise.
 *
 * Almost no device ships an Uzbek voice, and the default English one mangles
 * Uzbek badly. Russian is the one nearly every device does have, and it reads
 * Uzbek's vowels and its Russian-era loanwords more or less correctly. Turkish
 * is a closer relative where it exists, and Arabic a distant third that at
 * least keeps the consonants honest.
 */
export const NEIGHBOUR_VOICE_LANGS = ['ru', 'tr', 'ar']

function pickVoice(langs: readonly string[]): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices()
  for (const lang of langs) {
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang))
    if (voice) return voice
  }
  return undefined
}

function speakWithSynthesis(
  text: string,
  { slow = false, langs = [] as readonly string[] } = {},
): Promise<void> {
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
    const voice = pickVoice(['uz', ...langs])
    if (voice) {
      utterance.voice = voice
      // Only follow a substitute voice's own locale; an Uzbek voice keeps uz-UZ.
      if (!voice.lang.toLowerCase().startsWith('uz')) utterance.lang = voice.lang
      else utterance.lang = 'uz-UZ'
    } else {
      utterance.lang = 'uz-UZ'
    }
    utterance.rate = slow ? 0.65 : 0.85
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

export interface SpeakOptions {
  /** Play the 0.75× prebuilt clip — the second tap on a speaker button. */
  slow?: boolean
  /**
   * Substitute voice languages to accept when there is no prebuilt clip and no
   * Uzbek voice, best first. See `NEIGHBOUR_VOICE_LANGS`.
   */
  langs?: readonly string[]
}

/**
 * Speaks Uzbek text aloud. Resolves when playback finishes (or immediately if
 * no audio backend is available), so callers can sequence on it.
 *
 * Pass `{ slow: true }` to play the 0.75× pre-built version (second click on
 * the speaker). Falls back to the normal-speed clip or Web Speech if no slow
 * file is available.
 */
export async function speakUzbek(text: string, { slow = false, langs }: SpeakOptions = {}): Promise<void> {
  // Record the word/phrase in view so the "Raise an issue" form can attach it.
  noteUzbekViewed(text)
  stopSpeaking()
  const gen = speakGen
  const manifest = await getAudioManifest()
  if (gen !== speakGen) return
  const entry = manifest?.[audioKey(text)]
  const file = slow
    ? (entry && typeof entry === 'object' && entry.slowFile ? entry.slowFile : (entry ? audioFile(entry) : undefined))
    : (entry ? audioFile(entry) : undefined)
  if (file && (await playFile(`${base}audio/${AUDIO_VOICE}/${file}`))) return
  if (gen !== speakGen) return
  await speakWithSynthesis(text, { slow, langs })
}

/** A pause between stitched words — enough to hear the seam as a word break. */
const STITCH_GAP_MS = 60

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Speaks a run of Uzbek words back to back, one clip each.
 *
 * This is how the bazar reads a price like "ikki yuz o'ttiz ming" aloud:
 * there is no recording of that number, and there never could be — the game
 * reaches into the tens of millions — but there *is* a recording of every word
 * it is made of, because every Uzbek word in the app is individually tappable
 * and so individually recorded (see scripts/generate_audio.py).
 *
 * Stitching at word boundaries is a compromise and sounds like one: the
 * prosody is flat, with none of the run-on a native speaker gives a long
 * number. That is the right trade for *reading* a price you can see. The bonus
 * round, which asks the learner to recognise a number by ear alone, needs the
 * real thing and uses whole prebuilt clips instead.
 *
 * Any word without a clip falls through to speech synthesis on its own, so a
 * partial audio download degrades word by word rather than all at once. A new
 * `speakUzbek`/`stopSpeaking` call cancels the rest of the sequence.
 */
export async function speakUzbekWords(words: readonly string[], options: SpeakOptions = {}): Promise<void> {
  if (!words.length) return
  noteUzbekViewed(words.join(' '))
  stopSpeaking()
  const gen = speakGen
  const manifest = await getAudioManifest()

  for (const [index, word] of words.entries()) {
    if (gen !== speakGen) return
    if (index > 0) {
      await wait(STITCH_GAP_MS)
      if (gen !== speakGen) return
    }
    const entry = manifest?.[audioKey(word)]
    const file = entry ? audioFile(entry) : undefined
    if (file && (await playFile(`${base}audio/${AUDIO_VOICE}/${file}`))) continue
    if (gen !== speakGen) return
    await speakWithSynthesis(word, options)
  }
}
