/**
 * Audio playback for Uzbek words and phrases.
 *
 * Prefers prebuilt MP3s, looked up in /audio/manifest.json by a hash of the
 * spoken text (see key.ts) and cached CacheFirst by Workbox. Falls back to
 * the Web Speech API, requesting an Uzbek voice where the device has one.
 */
import { audioKey } from './key'
import { audioContext, onAudioContextReset, onAudioRouteChange } from './context'
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
 * How many times anything at all has been spoken, cancelling nothing.
 *
 * `speakGen` says which utterance is allowed to make a sound; this says who
 * asked last, and is what {@link createSpeaker} uses to tell "my word is still
 * the one playing" from "somebody else has taken over since". See there for
 * why the difference matters.
 */
let speakSeq = 0

/**
 * Something currently sounding over the top of the rest, and the two ways it
 * can be brought to an end. See {@link speakUzbekWord}.
 */
interface Sounding {
  /** Let it finish under the word that has just started, then fade it out. */
  tail(): void
  /** Cut it now. */
  silence(): void
}

const ringing = new Set<Sounding>()

/**
 * How long a word may go on ringing once the next word has started, and how
 * much of that is spent fading out.
 *
 * Overlap is what makes a quick run of presses sound like somebody reading a
 * number fast rather than a row of clipped stubs — but a player who knows the
 * price can outrun the clips three and four deep, and that is a pile-up, not a
 * reading. So each word gets the start of the next one and a little after it:
 * long enough to be heard whole, short enough that only two are ever really
 * sounding. It fades out rather than stopping, because a clip cut mid-vowel
 * ends on a click.
 */
const OVERLAP_TAIL_MS = 300
const TAIL_FADE_MS = 120

/** Silences everything: the clip that holds the floor, and any ringing over it. */
export function stopSpeaking(): void {
  speakGen++
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  for (const sounding of [...ringing]) sounding.silence()
  ringing.clear()
  if (currentResolve) {
    currentResolve(false)
    currentResolve = null
  }
}

/**
 * A context that has been closed and replaced — the app following the phone
 * onto headphones, see audio/context.ts — leaves every clip sounding through
 * it playing into nothing, and unable to say so, because a node in a closed
 * context never reports that it ended. Cut the lot and start again on the new
 * one; the decoded buffers themselves carry over untouched.
 */
onAudioContextReset(stopSpeaking)

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

/**
 * A pooled element was opened for the device the phone was playing through
 * then, and an element that has already loaded can stay with it. So when the
 * phone moves its sound — headphones going on, see audio/context.ts — the pool
 * is dropped and the next word opens an element on the device now in use. The
 * files are in the Workbox cache by that point, so re-opening one is cheap.
 */
onAudioRouteChange(() => {
  openClips.clear()
})

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
 * A decoded clip, and where the word inside it actually is.
 *
 * Every recording is topped and tailed with silence — the readings run about a
 * sixth of a second of nothing before the speaker starts, and a quarter of a
 * second of nothing after they stop. Played from the top, that silence is
 * indistinguishable from the app being slow: you press a key, and the word
 * arrives a beat later. Played from `from`, it arrives when you pressed.
 */
interface Clip {
  buffer: AudioBuffer
  /** Seconds into the file where the speech starts. */
  from: number
  /** Seconds into the file where it stops, before the silence at the end. */
  to: number
}

const clips = new Map<string, Clip>()
const decoding = new Map<string, Promise<Clip | null>>()
/** Enough for every number word twice over; a word is ~150KB decoded. */
const CLIP_LIMIT = 24

/**
 * Where the speech is inside a recording.
 *
 * "Silence" is measured against the clip's own peak rather than an absolute
 * level, because the readings are not normalised to each other, and a fixed
 * threshold would trim a quiet word to nothing while leaving a loud one's hiss
 * in place. The window is nudged outwards either side so that the attack of a
 * plosive — the whole of the "t" in "to'rt" — is not mistaken for silence and
 * cut off.
 */
const SILENCE_FRACTION = 0.02
const ONSET_MARGIN_S = 0.02

function speechBounds(buffer: AudioBuffer): { from: number; to: number } {
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  const floor = peak * SILENCE_FRACTION
  let head = 0
  while (head < data.length && Math.abs(data[head]) < floor) head++
  let tail = data.length - 1
  while (tail > head && Math.abs(data[tail]) < floor) tail--
  // A clip that is silent throughout is played as it is, rather than as nothing.
  if (head >= tail) return { from: 0, to: buffer.duration }
  return {
    from: Math.max(0, head / buffer.sampleRate - ONSET_MARGIN_S),
    to: Math.min(buffer.duration, tail / buffer.sampleRate + ONSET_MARGIN_S),
  }
}

/** Fetches and decodes a clip, keeping it and where its word starts. */
function decodeClip(url: string): Promise<Clip | null> {
  const held = clips.get(url)
  if (held) return Promise.resolve(held)
  const already = decoding.get(url)
  if (already) return already
  const ctx = audioContext()
  if (!ctx) return Promise.resolve(null)

  const pending = fetch(url)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('missing'))))
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => {
      const clip: Clip = { buffer, ...speechBounds(buffer) }
      clips.set(url, clip)
      for (const key of clips.keys()) {
        if (clips.size <= CLIP_LIMIT) break
        if (key !== url) clips.delete(key)
      }
      return clip
    })
    .catch(() => null)
    .finally(() => decoding.delete(url))
  decoding.set(url, pending)
  return pending
}

/**
 * Readies the clips for `texts` ahead of time, so playing one later is instant.
 * A word with no recording, or no manifest at all, is simply nothing to do.
 *
 * Decoding up front is what buys the trimmed start: the silence at the head of
 * a recording can only be skipped once the samples are in hand, and doing that
 * work in the moment of the tap would cost more than the silence did. Where
 * there is no Web Audio to decode with, the file is opened as an element
 * instead and plays from the top, silence and all.
 */
export async function primeUzbekAudio(texts: readonly string[]): Promise<void> {
  const manifest = await getAudioManifest()
  if (!manifest) return
  for (const text of texts) {
    const url = clipUrl(text, manifest)
    if (!url) continue
    if (audioContext()) void decodeClip(url)
    else openClip(url)
  }
}

/** Starts `audio` from the top, reporting whether it played all the way out. */
function start(audio: HTMLAudioElement, done: (played: boolean) => void): void {
  audio.onended = () => done(true)
  audio.onerror = () => done(false)
  // Pooled elements come back from a tail-out; never inherit its fade.
  audio.volume = 1
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
 * the floor from it. Words already ringing are given their tail and faded out,
 * so the overlap stays two deep however fast the presses come.
 *
 * A decoded clip is played from the word rather than from the top of the file,
 * which is the difference between hearing it when you pressed and hearing it a
 * beat later; anything not decoded falls back to playing the file whole.
 */
function ringFile(url: string): Promise<boolean> {
  for (const sounding of ringing) sounding.tail()
  const clip = clips.get(url)
  return clip ? ringClip(clip) : ringElement(url)
}

/** Rings a decoded clip, trimmed to the word and gated through its own gain. */
function ringClip(clip: Clip): Promise<boolean> {
  const ctx = audioContext()
  if (!ctx) return Promise.resolve(false)
  return new Promise((resolve) => {
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    source.connect(gain)

    const handle: Sounding = {
      tail() {
        const now = ctx.currentTime
        const from = now + (OVERLAP_TAIL_MS - TAIL_FADE_MS) / 1000
        const until = now + OVERLAP_TAIL_MS / 1000
        // Hold, then ramp down: a source stopped mid-vowel ends on a click.
        gain.gain.setValueAtTime(gain.gain.value, from)
        gain.gain.linearRampToValueAtTime(0, until)
        source.stop(until)
      },
      silence() {
        try {
          source.stop()
        } catch {
          // The context it played in has gone; it is already as stopped as
          // it can be. See the onAudioContextReset above.
        }
      },
    }
    source.onended = () => {
      ringing.delete(handle)
      resolve(true)
    }
    ringing.add(handle)
    // Now, from the word, for as long as the word lasts — the silence either
    // side of it is never played at all.
    source.start(0, clip.from, clip.to - clip.from)
  })
}

/** Rings a whole file through an audio element, for want of a decoded clip. */
function ringElement(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const held = openClip(url)
    // One element can only be in one place at a time, so a word that is still
    // ringing gets a second element to overlap itself with. By then the file is
    // in the browser's cache, so it still starts promptly.
    const audio = held.paused || held.ended ? held : new Audio(url)
    let fading: ReturnType<typeof setInterval> | undefined

    const settle = (played: boolean) => {
      clearInterval(fading)
      ringing.delete(handle)
      audio.pause()
      // Handed back at full volume: the element is pooled and plays again later.
      audio.volume = 1
      resolve(played)
    }
    const handle: Sounding = {
      tail() {
        if (fading) return
        const until = Date.now() + OVERLAP_TAIL_MS
        fading = setInterval(() => {
          const left = until - Date.now()
          // A word that ends inside its tail has simply been heard in full.
          if (audio.ended || left <= 0) settle(true)
          else if (left < TAIL_FADE_MS) audio.volume = Math.max(0, left / TAIL_FADE_MS)
        }, 20)
      },
      silence: () => settle(false),
    }
    ringing.add(handle)
    start(audio, settle)
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
  speakSeq++
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
 * Unlike the rest of these, it does not take the floor: a word rings on over
 * the top of one still sounding. The words run about a second each and a quick
 * player presses faster than that, so cutting the last one off would clip most
 * of them to a stub — a run of words overlapping at the edges is the sound of
 * somebody reading a number quickly, which is what it is. The overlap is capped
 * at `OVERLAP_TAIL_MS` so it stays a reading rather than becoming a pile-up,
 * and `stopSpeaking` still silences the lot.
 */
export function speakUzbekWord(word: string, options: SpeakOptions = {}): Promise<void> {
  noteUzbekViewed(word)
  speakSeq++
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
  speakSeq++
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

/**
 * A caller that can go quiet without silencing whatever spoke after it.
 *
 * {@link stopSpeaking} silences the app entire, which is what a component
 * wants on the way out — nobody wants the last word of a lesson carrying on
 * over the next screen. Called from a teardown hook, though, it also silences
 * the screen that replaced it, because by then that screen has usually already
 * started speaking: Vue runs a pre-flush watcher *before* it patches the DOM,
 * so the incoming question's word is under way while the outgoing question's
 * speaker buttons are still being unmounted, and their `onUnmounted` cuts it
 * off. Every autoplay in the app sat behind that — the word a question asks
 * you to recognise, the sentence a story reads out — and the learner heard
 * nothing at all unless they tapped the speaker themselves.
 *
 * So a speaker remembers whether its own word is still the one being said, and
 * {@link Speaker.stop} does nothing once it is not. Ordering stops mattering:
 * whether the successor starts before or after the teardown, the last word
 * asked for is the one that plays.
 */
export interface Speaker {
  /** Speaks, and takes the floor. See {@link speakUzbek}. */
  speak(text: string, options?: SpeakOptions): Promise<void>
  /** Speaks one word over anything still ringing. See {@link speakUzbekWord}. */
  speakWord(word: string, options?: SpeakOptions): Promise<void>
  /** Speaks a run of words back to back. See {@link speakUzbekWords}. */
  speakWords(words: readonly string[], options?: SpeakOptions): Promise<void>
  /** Whether this speaker was the last to ask for anything to be said. */
  readonly holdsFloor: boolean
  /** Silences the app, unless something else has spoken since. */
  stop(): void
}

export function createSpeaker(): Speaker {
  // Nothing said yet, and never equal to a real turn: a speaker that has not
  // spoken has nothing to stop.
  let mine = -1
  /**
   * Runs `start`, and takes the floor if it really did ask for something —
   * `speakWords([])` says nothing, and saying nothing is no claim on what
   * somebody else is in the middle of saying.
   */
  function took<T>(start: () => T): T {
    const before = speakSeq
    const started = start()
    if (speakSeq !== before) mine = speakSeq
    return started
  }
  return {
    speak: (text, options) => took(() => speakUzbek(text, options)),
    speakWord: (word, options) => took(() => speakUzbekWord(word, options)),
    speakWords: (words, options) => took(() => speakUzbekWords(words, options)),
    get holdsFloor() {
      return mine === speakSeq
    },
    stop() {
      if (mine === speakSeq) stopSpeaking()
    },
  }
}
