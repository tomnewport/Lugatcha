/**
 * The page's one Web Audio context.
 *
 * Browsers cap how many a page may open, and closing one takes a moment it
 * cannot be reopened in, so the sound effects and the trimmed word clips share
 * a single context rather than each making their own.
 *
 * It starts life suspended: a page may not make a sound until the person using
 * it has touched something. Every accessor asks it to resume, so the first call
 * that happens to land inside a tap is the one that wakes it — and
 * {@link resumeAudio} exists for a caller that knows which tap that will be.
 */

let context: AudioContext | null = null

export function audioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    context ??= new Ctx()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    // audio unavailable
    return null
  }
}

/**
 * Wakes the audio out of a gesture that is not itself making a sound — the
 * button that starts a game, say, so the first word of it is not the one that
 * pays for waking up.
 */
export function resumeAudio(): void {
  audioContext()
}
