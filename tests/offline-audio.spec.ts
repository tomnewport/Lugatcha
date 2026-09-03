import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AudioManifest } from '@/audio/audio'

/**
 * Downloading the audio has to leave the audio *there*.
 *
 * It did not: the Workbox audio cache was capped at 500 entries against a
 * corpus of thousands, so a completed download evicted all but the tail of
 * itself, and the note in localStorage went on saying "done". Offline, the
 * lookup missed on nearly every word and the app fell through to the device's
 * own voice — Uzbek read out in US English. The fix is that the cache itself
 * is the record: what the browser is really holding is what gets counted, and
 * what gets reported as ready.
 */

const MANIFEST: AudioManifest = {
  a: { file: 'a.mp3', slowFile: 'a_slow.mp3' },
  b: { file: 'b.mp3' },
  c: 'c.mp3', // legacy bare-filename form
}

vi.mock('@/audio/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/audio/audio')>()),
  getAudioManifest: () => Promise.resolve(MANIFEST),
}))

const { useAudioDownload, useAudioReady } = await import('@/audio/offline')

/** A Cache API holding whatever the "service worker" has stored. */
function fakeCaches(held: Set<string>) {
  return {
    open: () =>
      Promise.resolve({
        keys: () => Promise.resolve([...held].map((url) => ({ url }))),
        put: () => Promise.resolve(),
      }),
    match: () => Promise.resolve(undefined),
  }
}

/** Fetches that the service worker does (or does not) cache on the way past. */
function fakeFetch(held: Set<string> | null) {
  return vi.fn((url: string) => {
    if (held) held.add(`https://example.test${url}`)
    return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) } as Response)
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('offline audio download', () => {
  it('counts the slow clips too — the second tap on a speaker plays them', async () => {
    vi.stubGlobal('caches', fakeCaches(new Set()))
    const dl = useAudioDownload()
    await dl.prepare()
    expect(dl.total.value).toBe(4)
  })

  it('is ready once every clip is really in the cache', async () => {
    const held = new Set<string>()
    vi.stubGlobal('caches', fakeCaches(held))
    vi.stubGlobal('fetch', fakeFetch(held))
    const dl = useAudioDownload()
    await dl.prepare()
    await dl.start()
    await vi.waitFor(() => expect(dl.status.value).toBe('done'))
    expect(dl.done.value).toBe(4)
    expect(useAudioReady().ready.value).toBe(true)
  })

  it('says so when the fetches ran clean but the cache kept nothing', async () => {
    vi.stubGlobal('caches', fakeCaches(new Set()))
    vi.stubGlobal('fetch', fakeFetch(null))
    const dl = useAudioDownload()
    await dl.prepare()
    await dl.start()
    await vi.waitFor(() => expect(dl.status.value).toBe('error'))
    expect(dl.error.value).toMatch(/0 of 4/)
    expect(useAudioReady().ready.value).toBe(false)
  })

  it('re-downloads what an eviction took, however complete localStorage says it is', async () => {
    localStorage.setItem('lugatcha.audioDone.yandex', 'true')
    localStorage.setItem(
      'lugatcha.audioDownloaded.yandex',
      JSON.stringify(['a.mp3', 'a_slow.mp3', 'b.mp3', 'c.mp3']),
    )
    // Everything but one clip has been evicted under storage pressure.
    const held = new Set(['https://example.test/audio/yandex/b.mp3'])
    vi.stubGlobal('caches', fakeCaches(held))
    const fetched = fakeFetch(held)
    vi.stubGlobal('fetch', fetched)

    const dl = useAudioDownload()
    await dl.prepare()
    // The prompt to download comes back rather than the learner being told
    // they are ready for a flight they are not.
    expect(dl.status.value).toBe('idle')
    expect(dl.done.value).toBe(1)
    expect(useAudioReady().ready.value).toBe(false)

    await dl.start()
    await vi.waitFor(() => expect(dl.status.value).toBe('done'))
    expect(fetched.mock.calls.map((c) => c[0])).toEqual([
      '/audio/yandex/a.mp3',
      '/audio/yandex/a_slow.mp3',
      '/audio/yandex/c.mp3',
    ])
  })

  it('falls back to its own note where there is no Cache API to read', async () => {
    localStorage.setItem(
      'lugatcha.audioDownloaded.yandex',
      JSON.stringify(['a.mp3', 'a_slow.mp3', 'b.mp3', 'c.mp3']),
    )
    const dl = useAudioDownload()
    await dl.prepare()
    expect(dl.status.value).toBe('done')
  })
})

describe('service worker caching', () => {
  it('caps the audio cache above the number of clips that ship', async () => {
    const { workboxOptions, audioClipCount, AUDIO_CACHE_ENTRIES } = await import(
      '../vite.config'
    )
    // A cap below the corpus does not fail loudly; it just evicts, and the
    // learner finds out on a plane. 500 against thousands is what shipped.
    expect(audioClipCount).toBeGreaterThan(0)
    expect(AUDIO_CACHE_ENTRIES).toBeGreaterThan(audioClipCount)
    const audio = workboxOptions.runtimeCaching.find((r) =>
      String(r.urlPattern).includes('mp3'),
    )
    expect(audio?.options?.expiration?.maxEntries).toBe(AUDIO_CACHE_ENTRIES)
  })

  it('precaches the audio manifest, which every lookup goes through', async () => {
    const { workboxOptions } = await import('../vite.config')
    expect(workboxOptions.globPatterns).toContain('audio/*/manifest.json')
  })
})

describe('getAudioManifest', () => {
  it('reads its own cached copy when the network is gone', async () => {
    vi.resetModules()
    const kept = new Map<string, unknown>()
    vi.stubGlobal('caches', {
      open: () =>
        Promise.resolve({
          put: (url: string, res: { json: () => Promise<unknown> }) =>
            res.json().then((body) => void kept.set(url, body)),
        }),
      match: () =>
        Promise.resolve(
          kept.size
            ? { json: () => Promise.resolve([...kept.values()][0]) }
            : undefined,
        ),
    })

    const audio = await vi.importActual<typeof import('@/audio/audio')>('@/audio/audio')

    // Online once: the manifest arrives and a copy is kept.
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        clone: () => ({ json: () => Promise.resolve(MANIFEST) }),
        json: () => Promise.resolve(MANIFEST),
      } as unknown as Response),
    )
    expect(await audio.getAudioManifest('test-voice')).toEqual(MANIFEST)
    await vi.waitFor(() => expect(kept.size).toBe(1))

    // Offline, under a build whose precache does not have it: still found, so
    // the downloaded clips are still reachable.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    expect(await audio.getAudioManifest('other-voice')).toEqual(MANIFEST)
  })
})
