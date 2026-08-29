/**
 * The app's sound effects, synthesised rather than recorded.
 *
 * These are all built out of oscillators and noise on the Web Audio API, which
 * is a deliberate trade: a handful of numbers is smaller than any recording,
 * needs no licence, and — the reason that matters here — cannot be the one
 * thing missing when the app is opened offline. The vocabulary audio is the
 * only thing worth spending a download on.
 */
import { audioContext, onAudioContextReset } from './context'

/** One second of white noise, made once and replayed — the basis of every crash. */
let noise: AudioBuffer | null = null

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const samples = noise.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  }
  return noise
}

// The noise is a second of samples at the old context's rate. A replacement
// context — the app following the phone onto headphones, see context.ts — may
// well run at another, so make it again rather than have every crash resampled.
onAudioContextReset(() => {
  noise = null
})

/**
 * A gain envelope: silent, up to `peak` almost at once, then decaying away
 * across `dur`. Struck and broken things all share this shape — the attack is
 * what makes a sound percussive, and the exponential tail is how the energy
 * actually leaves a bell or a pane of glass.
 */
function envelope(ctx: AudioContext, at: number, dur: number, peak: number): GainNode {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  gain.connect(ctx.destination)
  return gain
}

/** A single decaying tone. */
function tone(
  ctx: AudioContext,
  at: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  osc.connect(envelope(ctx, at, dur, peak))
  osc.start(at)
  osc.stop(at + dur)
}

/** A burst of noise through a high-pass — a crash, a scrape, a knock. */
function crash(ctx: AudioContext, at: number, dur: number, peak: number, cutoff: number): void {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(cutoff, at)
  source.connect(filter)
  filter.connect(envelope(ctx, at, dur, peak))
  source.start(at)
  source.stop(at + dur)
}

/**
 * Partials of a struck bell, as multiples of the note it is heard as.
 *
 * Deliberately not whole numbers: metal rings at ratios like these, and it is
 * the mismatch that makes a bell sound like metal instead of an organ pipe.
 */
const BELL_PARTIALS = [1, 2.76, 5.4, 8.93]

/** One strike on a bell: every partial at once, the high ones dying first. */
function bell(ctx: AudioContext, at: number, freq: number, dur: number, peak: number): void {
  BELL_PARTIALS.forEach((ratio, index) => {
    tone(ctx, at, freq * ratio, dur / (index + 1), peak / (index + 1.5))
  })
}

/** Plays a short ascending three-note chime to signal a correct answer. */
export function playChime(): void {
  const ctx = audioContext()
  if (!ctx) return
  const now = ctx.currentTime
  tone(ctx, now, 1046.5, 0.45, 0.22)
  tone(ctx, now + 0.1, 1318.5, 0.55, 0.22)
  tone(ctx, now + 0.2, 1568.0, 0.65, 0.22)
}

/**
 * The till: a knock, then two bright strikes a tone apart.
 *
 * A cash register is a drawer and a bell, and it is the order that makes it
 * read as one — the clunk of the drawer under the first strike, then the second
 * strike higher and left to ring on. Hence "ker-ching" rather than "ching".
 */
export function playKerching(): void {
  const ctx = audioContext()
  if (!ctx) return
  const now = ctx.currentTime
  // The drawer coming out: a low knock, and a scrape of noise over it.
  tone(ctx, now, 140, 0.16, 0.16, 'triangle')
  crash(ctx, now, 0.05, 0.05, 1200)
  bell(ctx, now, 880, 0.4, 0.14)
  bell(ctx, now + 0.085, 1174.7, 0.85, 0.17)
}

/**
 * Glass going over: the break, then the pieces.
 *
 * Breaking glass is a burst of noise with no pitch to it at all, followed by
 * shards ringing as they scatter — high, short, and tuneless, which is what the
 * jitter is for. Each smash is dealt slightly differently because a run ends on
 * three of these, and three identical ones would sound like a sample.
 */
export function playSmash(): void {
  const ctx = audioContext()
  if (!ctx) return
  const now = ctx.currentTime
  // The pane going: hard, bright, and over almost before it started.
  crash(ctx, now, 0.22, 0.32, 2400)
  // The pieces landing after it, scattered across the moment that follows.
  for (let shard = 0; shard < 5; shard++) {
    const at = now + 0.03 + shard * 0.045 + Math.random() * 0.03
    tone(ctx, at, 1800 + Math.random() * 2400, 0.1, 0.05)
  }
  crash(ctx, now + 0.14, 0.2, 0.1, 1200)
}

/**
 * A taxi horn: two notes at once, leant on and let go.
 *
 * A car horn is a pair of tuned reeds a fourth or so apart sounding together —
 * that beating between them is what makes it read as a horn rather than a
 * beep — and it is square-ish rather than smooth, because the reeds clip. It
 * ends the moment the driver's hand comes off, so there is no tail on it.
 */
export function playHorn(): void {
  const ctx = audioContext()
  if (!ctx) return
  const now = ctx.currentTime
  tone(ctx, now, 392, 0.42, 0.09, 'square')
  tone(ctx, now, 523.25, 0.42, 0.07, 'square')
  // A touch of the same pair underneath, for the body a small horn has.
  tone(ctx, now, 196, 0.4, 0.05, 'triangle')
}
