/**
 * Offline audio download with progress, pause/resume, and resume-on-error.
 *
 * Warms the Workbox CacheFirst audio cache by fetching every clip in the
 * manifest. Too much to auto-download on load, so this is driven from a button
 * in Settings.
 *
 * Progress is remembered in localStorage so a resumed or reloaded session
 * skips what is already done — but localStorage is only ever a shortcut, never
 * the truth. What counts is what is actually sitting in the Workbox cache: the
 * browser evicts under storage pressure, an entry cap set too low evicts as the
 * download runs, and a fetch that never reached a service worker caches
 * nothing at all. In each case the note in localStorage would say "downloaded"
 * while offline playback fell through to the device's own voice reading Uzbek
 * as English. So the cache itself is read back — see {@link cachedClips} — and
 * that reading is what the progress bar and the "ready" flag report.
 */
import { ref, computed } from 'vue'
import { getAudioManifest, audioFile } from './audio'

const base = import.meta.env.BASE_URL

const AUDIO_VOICE = 'yandex'
const AUDIO_DONE_KEY = `lugatcha.audioDone.${AUDIO_VOICE}`
const DOWNLOADED_KEY = `lugatcha.audioDownloaded.${AUDIO_VOICE}`

/** Must match the runtimeCaching cacheName for audio in vite.config.ts. */
const AUDIO_CACHE = 'audio-cache'

export type DownloadStatus = 'idle' | 'running' | 'paused' | 'done' | 'error'

/** True once all clips have been downloaded and cached. Reactive. */
export function useAudioReady() {
  const _tick = ref(0)
  function recheck() { _tick.value++ }
  return {
    ready: computed(() => {
      void _tick.value
      return localStorage.getItem(AUDIO_DONE_KEY) === 'true'
    }),
    recheck,
  }
}

/**
 * The clip filenames the browser is really holding, or null where the Cache
 * API cannot be reached (an older browser, a private window, a test).
 *
 * Filenames rather than URLs: the same clip cached under a different origin or
 * base path — a preview deploy, a renamed repo — is the same audio.
 */
async function cachedClips(): Promise<Set<string> | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(AUDIO_CACHE)
    const names = new Set<string>()
    for (const request of await cache.keys()) {
      const name = new URL(request.url).pathname.split('/').pop()
      if (name) names.add(name)
    }
    return names
  } catch {
    return null
  }
}

/** Every clip file the manifest names, normal speed and slow, without repeats. */
function manifestFiles(manifest: Awaited<ReturnType<typeof getAudioManifest>>): string[] {
  const files = new Set<string>()
  for (const entry of Object.values(manifest ?? {})) {
    files.add(audioFile(entry))
    // The slow clip is what the second tap on a speaker button plays; leaving
    // it out of the download meant that tap went to speech synthesis offline.
    if (typeof entry === 'object' && entry?.slowFile) files.add(entry.slowFile)
  }
  return [...files]
}

export function useAudioDownload() {
  const total = ref(0)
  const done = ref(0)
  const status = ref<DownloadStatus>('idle')
  const error = ref('')
  const { recheck: recheckReady } = useAudioReady()

  let files: string[] = []
  let paused = false

  function loadDone(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(DOWNLOADED_KEY) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  }

  function saveDone(downloaded: Set<string>): void {
    try {
      localStorage.setItem(DOWNLOADED_KEY, JSON.stringify([...downloaded]))
    } catch {
      // private mode etc. — progress just won't survive a reload
    }
  }

  /**
   * What is genuinely available offline: the note we kept, narrowed to what the
   * cache still holds. Where the cache cannot be read the note stands on its
   * own, which is the old behaviour and the best that can be done there.
   */
  async function verified(): Promise<Set<string>> {
    const noted = loadDone()
    const cached = await cachedClips()
    if (!cached) return noted
    return new Set(files.filter((f) => cached.has(f)))
  }

  /**
   * Records what is really downloaded, and whether that is all of it. Clearing
   * the flag matters as much as setting it: a learner whose cache was evicted
   * is shown the download prompt again rather than being told they are ready.
   */
  function settle(have: Set<string>): boolean {
    saveDone(have)
    done.value = have.size
    const complete = total.value > 0 && have.size >= total.value
    if (complete) localStorage.setItem(AUDIO_DONE_KEY, 'true')
    else localStorage.removeItem(AUDIO_DONE_KEY)
    recheckReady()
    return complete
  }

  /** Load the manifest and reflect how much is really cached. Call on mount. */
  async function prepare(): Promise<void> {
    files = manifestFiles(await getAudioManifest())
    total.value = files.length
    if (settle(await verified())) status.value = 'done'
  }

  async function run(): Promise<void> {
    if (!files.length) await prepare()
    status.value = 'running'
    error.value = ''
    paused = false
    const downloaded = await verified()
    done.value = downloaded.size
    try {
      for (const file of files) {
        if (paused) {
          status.value = 'paused'
          settle(downloaded)
          return
        }
        if (downloaded.has(file)) continue
        const res = await fetch(`${base}audio/${AUDIO_VOICE}/${file}`)
        if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
        await res.blob() // drain the body so the service worker caches it
        downloaded.add(file)
        saveDone(downloaded)
        done.value++
      }
    } catch (e) {
      error.value = (e as Error).message
      settle(await verified())
      status.value = 'error'
      return
    }
    // Every clip fetched — now ask the cache whether it kept them. A download
    // that ran clean but stored nothing is a failure the learner needs told
    // about here, not one they discover on a plane with no signal.
    const have = await verified()
    if (settle(have)) {
      status.value = 'done'
    } else {
      error.value = `only ${have.size} of ${total.value} clips were stored offline`
      status.value = 'error'
    }
  }

  function start(): void {
    void run()
  }

  function pause(): void {
    paused = true
  }

  /** Resume after a pause or an error — retries remaining/failed files. */
  function resume(): void {
    if (status.value !== 'running') void run()
  }

  return { total, done, status, error, prepare, start, pause, resume }
}
