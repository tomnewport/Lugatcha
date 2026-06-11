/**
 * Offline audio download with progress, pause/resume, and resume-on-error.
 *
 * Warms the Workbox CacheFirst audio cache by fetching every clip in the
 * manifest. Completed files are remembered in localStorage so a resumed or
 * reloaded session skips what's already done. Too much to auto-download on
 * load, so this is driven from a button in Settings.
 */
import { ref } from 'vue'
import { getAudioManifest, audioFile } from './audio'
import { useSettingsStore } from '@/stores/settings'

const base = import.meta.env.BASE_URL

export type DownloadStatus = 'idle' | 'running' | 'paused' | 'done' | 'error'

export function useAudioDownload() {
  const total = ref(0)
  const done = ref(0)
  const status = ref<DownloadStatus>('idle')
  const error = ref('')

  let files: string[] = []
  let paused = false

  function doneKey(): string {
    return `lugatcha.audioDownloaded.${useSettingsStore().audioVoice}`
  }

  function loadDone(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(doneKey()) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  }

  function saveDone(downloaded: Set<string>): void {
    try {
      localStorage.setItem(doneKey(), JSON.stringify([...downloaded]))
    } catch {
      // private mode etc. — progress just won't survive a reload
    }
  }

  /** Load the manifest and reflect how much is already cached. Call on mount. */
  async function prepare(): Promise<void> {
    const voice = useSettingsStore().audioVoice
    const manifest = await getAudioManifest(voice)
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
    const voice = useSettingsStore().audioVoice
    const downloaded = loadDone()
    done.value = files.filter((f) => downloaded.has(f)).length
    try {
      for (const file of files) {
        if (paused) {
          status.value = 'paused'
          return
        }
        if (downloaded.has(file)) continue
        const res = await fetch(`${base}audio/${voice}/${file}`)
        if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
        await res.blob() // drain the body so the service worker caches it
        downloaded.add(file)
        saveDone(downloaded)
        done.value++
      }
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
