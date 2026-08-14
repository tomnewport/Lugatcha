import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  storageHealth,
  isQuotaExceeded,
  noteStorageError,
  refreshEstimate,
  resetStorageHealth,
} from '@/db/storageHealth'

beforeEach(() => {
  resetStorageHealth()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isQuotaExceeded', () => {
  it('recognises the DOM QuotaExceededError by name and code', () => {
    expect(isQuotaExceeded({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaExceeded({ code: 22 })).toBe(true)
  })

  it("recognises Firefox's NS_ERROR_DOM_QUOTA_REACHED (code 1014)", () => {
    expect(isQuotaExceeded({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaExceeded({ code: 1014 })).toBe(true)
  })

  it("unwraps Dexie's nested error", () => {
    const dexieErr = { name: 'AbortError', inner: { name: 'QuotaExceededError' } }
    expect(isQuotaExceeded(dexieErr)).toBe(true)
  })

  it('is false for unrelated errors and non-objects', () => {
    expect(isQuotaExceeded(new Error('boom'))).toBe(false)
    expect(isQuotaExceeded({ name: 'TypeError' })).toBe(false)
    expect(isQuotaExceeded(null)).toBe(false)
    expect(isQuotaExceeded('QuotaExceededError')).toBe(false)
  })

  it('does not loop forever on a self-referential inner chain', () => {
    const err: { name: string; inner?: unknown } = { name: 'X' }
    err.inner = err
    expect(isQuotaExceeded(err)).toBe(false)
  })
})

describe('noteStorageError', () => {
  it('flags storage full only for quota errors', () => {
    noteStorageError(new Error('network'))
    expect(storageHealth.full).toBe(false)

    noteStorageError({ name: 'QuotaExceededError' })
    expect(storageHealth.full).toBe(true)
  })
})

describe('refreshEstimate', () => {
  function stubEstimate(usage: number, quota: number) {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage, quota }) },
    })
  }

  it('marks storage low when usage is near the quota', async () => {
    stubEstimate(95, 100)
    await refreshEstimate()
    expect(storageHealth.low).toBe(true)
    expect(storageHealth.usage).toBe(95)
    expect(storageHealth.quota).toBe(100)
  })

  it('leaves storage not-low when there is ample headroom', async () => {
    stubEstimate(50, 100)
    await refreshEstimate()
    expect(storageHealth.low).toBe(false)
  })

  it('does nothing when the estimate API is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    await refreshEstimate()
    expect(storageHealth.low).toBe(false)
    expect(storageHealth.usage).toBeNull()
  })
})
