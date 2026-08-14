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

/**
 * The default voice's manifest once it has arrived, for callers that cannot
 * afford to wait on the promise.
 *
 * Awaiting a promise costs a turn of the event loop even when it settled long
 * ago. That is invisible behind a speaker button and very visible in the bazar,
 * where a word has to sound *as* the key goes down — see {@link speakUzbekWord}.
 */
let loadedManifest: AudioManifest | null = null

export function getAudioManifest(voice?: string): Promise<AudioManifest | null> {
  const v = voice ?? AUDIO_VOICE
  if (!manifestCache.has(v)) {
    const pending = fetch(`${base}audio/${v}/manifest.json`)
      .then((res) => (res.ok ? (res.json() as Promise<AudioManifest>) : null))
      .catch(() => null)
    if (v === AUDIO_VOICE) void pending.then((manifest) => (loadedManifest = manifest))
    manifestCache.set(v, pending)
  }
  return manifestCache.get(v)!
}

/** The file a spoken string is recorded in, or undefined if it is not. */
function clipUrl(text: string, manifest: AudioManifest | null): string | undefined {
  const entry = manifest?.[audioKey(text)]
  return entry ? `${base}audio/${AUDIO_VOICE}/${audioFile(entry)}` : undefined
}

let currentAudio: HTMLAudioElement | null = null
let currentResolve: ((v: boolean) => void) | null = null
let speakGen = 0

/**
 * Clips that were started to ring over the top of whatever else is sounding,
 * against the callback that settles each one. See {@link speakUzbekWord}.
 */
const ringing = new Map<HTMLAudioElement, (played: boolean) => void>()

/** Silences everything: the clip that holds the floor, and any ringing over it. */
export function stopSpeaking(): void {
  speakGen++
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  for (const [audio, done] of ringing) {
    audio.pause()
    done(false)
  }
  ringing.clear()
  if (currentResolve) {
    currentResolve(false)
    currentResolve = null
  }
}

/**
 * Audio elements that have already been opened, least recently used first.
 *
 * A fresh `new Audio(url)` cannot make a sound until the file is open — off the
 * network the first time, out of the Workbox cache after that — and that wait
 * lands squarely between the tap and the word. Holding the element lets the
 * next play start at once, and {@link primeUzbekAudio} opens clips through the
 * same cache *before* anything asks for them. The cap keeps a long session from
 * holding on to every clip it has ever played.
 */
const openClips = new Map<string, HTMLAudioElement>()
const OPEN_CLIP_LIMIT = 32

function openClip(url: string): HTMLAudioElement {
  const cached = openClips.get(url)
  if (cached) {
    // Re-inserting moves it to the end of the map, so eviction drops the least
    // recently used clip rather than whichever happened to be opened first.
    openClips.delete(url)
    openClips.set(url, cached)
    return cached
  }
  const audio = new Audio(url)
  audio.preload = 'auto'
  audio.load()
  openClips.set(url, audio)
  for (const key of openClips.keys()) {
    if (openClips.size <= OPEN_CLIP_LIMIT) break
    openClips.delete(key)
  }
  return audio
}

/**
 * Opens the clips for `texts` ahead of time, so playing one later is instant.
 * A word with no recording, or no manifest at all, is simply nothing to do.
 */
export async function primeUzbekAudio(texts: readonly string[]): Promise<void> {
  const manifest = await getAudioManifest()
  if (!manifest) return
  for (const text of texts) {
    const url = clipUrl(text, manifest)
    if (url) openClip(url)
  }
}

/** Starts `audio` from the top, reporting whether it played all the way out. */
function start(audio: HTMLAudioElement, done: (played: boolean) => void): void {
  audio.onended = () => done(true)
  audio.onerror = () => done(false)
  try {
    // A reused element is wherever it last stopped; a brand new one has
    // nothing to seek yet and starts at the top regardless.
    audio.currentTime = 0
  } catch {
    // not seekable
  }
  audio.play().catch(() => done(false))
}

/** Plays a clip on its own, cutting off whatever held the floor before it. */
function playFile(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = openClip(url)
    currentAudio = audio
    currentResolve = resolve
    start(audio, (v) => {
      if (currentResolve === resolve) currentResolve = null
      resolve(v)
    })
  })
}

/**
 * Plays a clip over the top of anything already sounding, rather than taking
 * the floor from it. Only `stopSpeaking` silences one early.
 */
function ringFile(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const held = openClip(url)
    // One element can only be in one place at a time, so a word that is still
    // ringing gets a second element to overlap itself with. By then the file is
    // in the browser's cache, so it still starts promptly.
    const audio = held.paused || held.ended ? held : new Audio(url)
    const done = (v: boolean) => {
      ringing.delete(audio)
      resolve(v)
    }
    ringing.set(audio, done)
    start(audio, done)
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

/**
 * Speaks a single Uzbek word by the shortest path to sound there is.
 *
 * `speakUzbek` has to wait on the manifest promise before it can even look a
 * clip up, and that wait is a turn of the event loop the caller may not have:
 * the bazar reads each number word out as its key goes down, and a word that
 * arrives a beat late is a word the player has already moved past. Once the
 * manifest is in and the clip has been primed — see {@link primeUzbekAudio} —
 * this starts playback synchronously, inside the tap that asked for it, which
 * is also what keeps mobile browsers from treating it as unprompted audio.
 *
 * Unlike the rest of these, it does not take the floor: a word rings until it
 * is finished, over the top of one still sounding. The words run about a second
 * each and a quick player presses faster than that, so cutting the last one off
 * would clip most of them to a stub — a run of words overlapping at the edges
 * is the sound of somebody reading a number quickly, which is what it is.
 * `stopSpeaking` still silences the lot.
 */
export function speakUzbekWord(word: string, options: SpeakOptions = {}): Promise<void> {
  noteUzbekViewed(word)
  const gen = speakGen
  const url = clipUrl(word, loadedManifest)
  if (url === undefined) return speakWordOnceLoaded(word, options, gen)
  return ringFile(url).then((played) => {
    if (played || gen !== speakGen) return
    return speakWithSynthesis(word, options)
  })
}

/** The same word, for the first press of a session: manifest first, then sound. */
async function speakWordOnceLoaded(word: string, options: SpeakOptions, gen: number): Promise<void> {
  const manifest = await getAudioManifest()
  if (gen !== speakGen) return
  const url = clipUrl(word, manifest)
  if (url && (await ringFile(url))) return
  if (gen !== speakGen) return
  await speakWithSynthesis(word, options)
}

/** A pause between stitched words — enough to hear the seam as a word break. */
const STITCH_GAP_MS = 60

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Speaks a run of Uzbek words back to back, one clip each.
 *
 * This is how a price like "ikki yuz o'ttiz ming" is read in one go: there is
 * no recording of that number, and there never could be — the bazar reaches
 * into the tens of millions — but there *is* a recording of every word it is
 * made of, because every Uzbek word in the app is individually tappable and so
 * individually recorded (see scripts/generate_audio.py).
 *
 * Stitching at word boundaries is a compromise and sounds like one: the
 * prosody is flat, with none of the run-on a native speaker gives a long
 * number, and every seam is a fixed pause rather than a spoken one. The bazar
 * therefore says each word as its key goes down instead — one
 * {@link speakUzbekWord} per press, paced by the player — and the bonus round,
 * which asks the learner to recognise a number by ear alone, uses whole
 * prebuilt clips. This is the fallback for reading a price nobody is typing.
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
    const url = clipUrl(word, manifest)
    if (url && (await playFile(url))) continue
    if (gen !== speakGen) return
    await speakWithSynthesis(word, options)
  }
}
