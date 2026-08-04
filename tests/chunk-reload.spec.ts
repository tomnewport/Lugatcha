import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isStaleChunkError, recoverFromStaleChunk } from '@/errors/chunkReload'

// A minimal sessionStorage so the loop-guard can read/write (setup.ts only
// provides localStorage).
function installSessionStorage(): void {
  const store = new Map<string, string>()
  globalThis.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

describe('isStaleChunkError', () => {
  it('matches the browser messages for a missing lazy chunk', () => {
    expect(
      isStaleChunkError(new Error('Failed to fetch dynamically imported module: https://x/y.js')),
    ).toBe(true)
    expect(
      isStaleChunkError(new Error('error loading dynamically imported module')),
    ).toBe(true)
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('Loading chunk 42 failed.'))).toBe(true)
  })

  it('matches by ChunkLoadError name regardless of message', () => {
    const err = new Error('boom')
    err.name = 'ChunkLoadError'
    expect(isStaleChunkError(err)).toBe(true)
  })

  it('accepts a raw string reason', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(true)
  })

  it('ignores unrelated errors and empty values', () => {
    expect(isStaleChunkError(new Error('render fail'))).toBe(false)
    expect(isStaleChunkError(null)).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
  })
})

describe('recoverFromStaleChunk', () => {
  beforeEach(() => {
    installSessionStorage()
  })

  it('reloads once for a stale-chunk error', () => {
    const reload = vi.fn()
    expect(
      recoverFromStaleChunk(new Error('Failed to fetch dynamically imported module'), reload),
    ).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload for an unrelated error', () => {
    const reload = vi.fn()
    expect(recoverFromStaleChunk(new Error('render fail'), reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload again within the guard window (breaks reload loops)', () => {
    const reload = vi.fn()
    const err = new Error('Failed to fetch dynamically imported module')
    expect(recoverFromStaleChunk(err, reload)).toBe(true)
    expect(recoverFromStaleChunk(err, reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again once the guard window has passed', () => {
    const reload = vi.fn()
    const err = new Error('Failed to fetch dynamically imported module')
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    expect(recoverFromStaleChunk(err, reload)).toBe(true)
    now.mockReturnValue(1_000_000 + 11_000)
    expect(recoverFromStaleChunk(err, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })

  it('does not reload when sessionStorage is unavailable (avoids blind loops)', () => {
    // @ts-expect-error deliberately remove for this case
    delete globalThis.sessionStorage
    const reload = vi.fn()
    expect(
      recoverFromStaleChunk(new Error('Failed to fetch dynamically imported module'), reload),
    ).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
