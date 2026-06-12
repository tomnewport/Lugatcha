/**
 * Offline audio download with progress, pause/resume, and resume-on-error.
 *
 * Warms the Workbox CacheFirst audio cache by fetching every clip in the
 * manifest. Completed files are remembered in localStorage so a resumed or
 * reloaded session skips what's already done. Too much to auto-download on
 * load, so this is driven from a button in Settings.
 */
import { ref, computed } from 'vue'
import { getAudioManifest, audioFile } from './audio'

const base = import.meta.env.BASE_URL

const AUDIO_VOICE = 'yandex'
const AUDIO_DONE_KEY = `lugatcha.audioDone.${AUDIO_VOICE}`

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

export function useAudioDownload() {
  const total = ref(0)
  const done = ref(0)
  const status = ref<DownloadStatus>('idle')
  const error = ref('')
  const { recheck: recheckReady } = useAudioReady()

  let files: string[] = []
  let paused = false

  const DOWNLOADED_KEY = `lugatcha.audioDownloaded.${AUDIO_VOICE}`

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

  /** Load the manifest and reflect how much is already cached. Call on mount. */
  async function prepare(): Promise<void> {
    const manifest = await getAudioManifest()
    files = manifest ? Object.values(manifest).map(audioFile) : []
    total.value = files.length
    const downloaded = loadDone()
    done.value = files.filter((f) => downloaded.has(f)).length
    if (total.value > 0 && done.value >= total.value) status.value = 'done'
  }

  async function run(): Promise<void> {
    if (!files.length) await prepare()
    status.value = 'running'
    error.value = ''
    paused = false
    const downloaded = loadDone()
    done.value = files.filter((f) => downloaded.has(f)).length
    try {
      for (const file of files) {
        if (paused) {
          status.value = 'paused'
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
      localStorage.setItem(AUDIO_DONE_KEY, 'true')
      recheckReady()
      status.value = 'done'
    } catch (e) {
      error.value = (e as Error).message
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
