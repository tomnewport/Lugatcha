/**
 * The page's one Web Audio context, and the device its sound comes out of.
 *
 * Browsers cap how many a page may open, and closing one takes a moment it
 * cannot be reopened in, so the sound effects and the trimmed word clips share
 * a single context rather than each making their own.
 *
 * It starts life suspended: a page may not make a sound until the person using
 * it has touched something. Every accessor asks it to resume, so the first call
 * that happens to land inside a tap is the one that wakes it — and
 * {@link resumeAudio} exists for a caller that knows which tap that will be.
 *
 * ## Following the headphones
 *
 * A context chooses its output device when it opens and then stays on it, even
 * once the phone has moved on. Connect Bluetooth headphones mid-session and the
 * platform routes everything else across while the context carries on playing
 * out of the phone's own speaker — a long-standing Android behaviour, and very
 * reliably reproducible on Samsung's phones.
 *
 * It shows up unevenly, because only some of the app's sound goes through the
 * context. Word and phrase clips play through `<audio>` elements, and elements
 * do follow the phone: so the words arrive in the headphones while the chimes,
 * the till, the breaking glass and the bazar's numbers stay behind on the
 * speaker. That is the "it plays on the wrong device, but not always" of it.
 *
 * {@link refreshAudioRoute} puts it right by opening the output stream again,
 * which is the only way to ask the platform a second time where sound should
 * go. It runs when the set of audio devices changes and when the app comes back
 * to the foreground — between them, the two moments headphones are connected in.
 * It also announces the change to {@link onAudioRouteChange}, so that anything
 * else holding an output open — the pool of `<audio>` elements in audio.ts —
 * can let go of it and be opened again on the device now in use.
 *
 * Speech synthesis is the one part of the app none of this reaches: where a
 * word has no recording the platform's own voice speaks it, out of whichever
 * device that engine decides on.
 */

/** Whatever the phone is playing through at the moment it is asked. */
const DEFAULT_SINK = ''

/** A sink that runs the context but plays it nowhere. Chrome 110+. */
const SILENT_SINK = { type: 'none' } as const

type SinkTarget = string | { readonly type: 'none' }

/** `setSinkId` is Chrome 110 and up; older engines get rebuilt instead. */
interface RoutableContext extends AudioContext {
  setSinkId?: (target: SinkTarget) => Promise<void>
}

let context: AudioContext | null = null
let listening = false

export function audioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    if (!context) {
      context = new Ctx()
      watchForRouteChanges()
    }
    // A context that cannot be resumed yet stays suspended and the next caller
    // tries again; the rejection is not a fault worth reporting.
    if (context.state === 'suspended') void context.resume().catch(() => {})
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

const resetListeners = new Set<() => void>()

/**
 * Registers `listener` to hear that the context has been closed and replaced.
 * Anything holding nodes from the old one is holding something that will never
 * sound again, and this is the moment to let go of it.
 */
export function onAudioContextReset(listener: () => void): void {
  resetListeners.add(listener)
}

const routeListeners = new Set<() => void>()

/**
 * Registers `listener` to hear that the phone may have moved its sound to
 * another device. Unlike a reset this says nothing about the context — it fires
 * whether or not one is even open — only that anything opened for the old
 * device is now worth opening again.
 */
export function onAudioRouteChange(listener: () => void): void {
  routeListeners.add(listener)
}

let refreshing: Promise<void> | null = null
let refreshAgain = false

/**
 * Re-asks the platform where sound should go, and moves the context there.
 *
 * Safe to call at any time: with nothing open there is nothing to correct, and
 * a context opened later opens on the device in use then. Overlapping calls
 * collapse into one, with a single repeat afterwards for anything that changed
 * while it was working.
 */
export function refreshAudioRoute(): Promise<void> {
  if (refreshing) {
    refreshAgain = true
    return refreshing
  }
  // Told first and synchronously, so that anything started while the output is
  // being re-opened is already started on the new device rather than the old.
  for (const listener of routeListeners) listener()
  refreshing = reopenOutput()
    .catch(() => {
      // A route we could not correct is still a route; leave the sound where
      // it is rather than surfacing an error at somebody mid-lesson.
    })
    .finally(() => {
      refreshing = null
      if (refreshAgain) {
        refreshAgain = false
        void refreshAudioRoute()
      }
    })
  return refreshing
}

async function reopenOutput(): Promise<void> {
  const open = context
  // Nothing open: a context opened later opens on the device in use then, so
  // there is nothing here to correct.
  if (!open) return
  const routable = open as RoutableContext
  if (typeof routable.setSinkId === 'function') {
    try {
      // Selecting the sink a context is already on is defined to do nothing at
      // all — and "the default device" is the sink it is already on, stale or
      // not. So the way to ask for the *current* default is to leave and come
      // back. The silence in between lasts a few milliseconds and costs at
      // most the tail of whatever was sounding as the headphones went on.
      await routable.setSinkId(SILENT_SINK)
      await routable.setSinkId(DEFAULT_SINK)
      return
    } catch {
      // Some engines take a device id but not the silent sink, which can leave
      // the context pointing at nothing. Rebuilding is the way out either way.
    }
  }
  await rebuildContext(open)
}

/** Closes the context and opens another, which picks the device afresh. */
async function rebuildContext(dead: AudioContext): Promise<void> {
  if (context === dead) context = null
  for (const listener of resetListeners) listener()
  try {
    await dead.close()
  } catch {
    // already closing, or an engine that will not close one at all
  }
  // Open the replacement now rather than under the next tap: a context opened
  // in the moment of a press is a press that waits for it.
  audioContext()
}

/**
 * Starts watching for the phone changing its mind about where sound goes.
 *
 * Only worth doing once a context exists — before that there is nothing on the
 * wrong device — so this hangs off opening one rather than off module load.
 */
function watchForRouteChanges(): void {
  if (listening) return
  listening = true

  // Headphones connecting or disconnecting changes the device list, which is
  // the platform saying the route it hands out has moved.
  if (typeof navigator !== 'undefined') {
    navigator.mediaDevices?.addEventListener?.('devicechange', () => void refreshAudioRoute())
  }

  // Not every engine fires devicechange for an audio route change, and pairing
  // headphones means leaving the app for a moment anyway. Coming back is the
  // other moment worth re-checking.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refreshAudioRoute()
    })
  }
}
