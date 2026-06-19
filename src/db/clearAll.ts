import { db } from './LugatchaDB'

/** Resolves once the deletion request settles, however it settles. */
function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

/**
 * Wipes everything Lugʻatcha stores on this device: the IndexedDB content and
 * progress, all localStorage/sessionStorage, and the PWA's cached shell, data,
 * and audio. The caller should reload afterwards so the app re-seeds clean.
 */
export async function clearAllLocalData(): Promise<void> {
  // IndexedDB — the app database, plus any others (e.g. Workbox expiration meta).
  await db.delete().catch(() => {})
  try {
    const dbs = (await indexedDB.databases?.()) ?? []
    await Promise.all(dbs.map((d) => (d.name ? deleteIndexedDb(d.name) : Promise.resolve())))
  } catch {
    // databases() isn't supported everywhere — db.delete() above covers the main one.
  }

  // Key/value stores.
  try {
    localStorage.clear()
  } catch {
    /* private mode */
  }
  try {
    sessionStorage.clear()
  } catch {
    /* private mode */
  }

  // Cache Storage — precached shell, data-cache, and audio-cache.
  if ('caches' in globalThis) {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    } catch {
      /* caches unavailable */
    }
  }
}
