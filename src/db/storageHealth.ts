/**
 * Storage-health signals (issue: a learner lost all their progress — the device
 * had run out of storage).
 *
 * A full device breaks the app in two quiet ways that this module makes loud:
 *
 *  1. **Writes fail silently.** When the disk is full, an IndexedDB write throws
 *     `QuotaExceededError`. Progress-saving code doesn't expect that, so the row
 *     simply isn't written — the learner studies on, sees the UI update in
 *     memory, and only discovers the loss on the next reload, when in truth the
 *     progress was never saved. `isQuotaExceeded` / `noteStorageError` catch that
 *     and flip {@link storageHealth.full}.
 *
 *  2. **Storage sitting near the quota is first in line for eviction.** Before it
 *     gets that bad we can warn: `refreshEstimate` reads the usage/quota estimate
 *     and flips {@link storageHealth.low} when there's little headroom left.
 *
 * Either flag drives a banner (components/StorageWarning.vue) whose one action —
 * "back up now" — writes a file *outside* origin storage, so it still works when
 * IndexedDB itself can't be written. Everything here is best-effort: the estimate
 * is approximate and unsupported on some browsers, so a quiet failure just means
 * no early warning, never a crash.
 */
import { reactive } from 'vue'

export interface StorageHealth {
  /** A write has failed with a quota error — progress is not being saved. */
  full: boolean
  /** The usage estimate is close enough to the quota to risk eviction. */
  low: boolean
  /** Last observed bytes in use, or null when the estimate is unavailable. */
  usage: number | null
  /** Last observed quota in bytes, or null when the estimate is unavailable. */
  quota: number | null
}

export const storageHealth = reactive<StorageHealth>({
  full: false,
  low: false,
  usage: null,
  quota: null,
})

/** At or above this fraction of the quota, warn the learner to back up. */
export const LOW_STORAGE_RATIO = 0.9

/**
 * Whether a thrown value is a storage-quota error, however it's wrapped. Covers
 * the DOM `QuotaExceededError` (code 22), Firefox's `NS_ERROR_DOM_QUOTA_REACHED`
 * (code 1014), and Dexie's wrapper, which nests the real error under `.inner`.
 */
export function isQuotaExceeded(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 5) return false
  const e = err as { name?: string; code?: number; inner?: unknown }
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  if (e.code === 22 || e.code === 1014) return true
  if (e.inner && e.inner !== err) return isQuotaExceeded(e.inner, depth + 1)
  return false
}

/**
 * Inspect a captured error and, if it's a quota failure, mark storage full and
 * refresh the estimate so the banner shows how tight things are. Safe to call on
 * every error — non-quota errors are ignored.
 */
export function noteStorageError(err: unknown): void {
  if (!isQuotaExceeded(err)) return
  storageHealth.full = true
  void refreshEstimate()
}

/**
 * Read `navigator.storage.estimate()` and update usage/quota and the `low` flag.
 * Best-effort: unsupported or blocked environments leave the state untouched.
 */
export async function refreshEstimate(): Promise<void> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!storage || typeof storage.estimate !== 'function') return
    const { usage, quota } = await storage.estimate()
    storageHealth.usage = typeof usage === 'number' ? usage : null
    storageHealth.quota = typeof quota === 'number' ? quota : null
    if (typeof usage === 'number' && typeof quota === 'number' && quota > 0) {
      storageHealth.low = usage / quota >= LOW_STORAGE_RATIO
    }
  } catch {
    // Estimate unsupported or blocked — no early warning, which is acceptable.
  }
}

/** Reset flags (used by tests). */
export function resetStorageHealth(): void {
  storageHealth.full = false
  storageHealth.low = false
  storageHealth.usage = null
  storageHealth.quota = null
}
