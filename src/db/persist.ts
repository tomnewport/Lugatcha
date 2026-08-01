/**
 * Ask the browser to keep our data (issue: a learner lost all their progress).
 *
 * Everything a learner earns lives only on the device — IndexedDB plus a few
 * `lugatcha.*` localStorage keys. By default that storage is "best-effort": the
 * browser may evict it under storage pressure, and WebKit (iOS Safari) clears
 * all script-writable storage after about seven days without a visit for any
 * site that isn't installed to the Home Screen. Either wipes a learner's whole
 * history and silently re-seeds a fresh app.
 *
 * Requesting persistent storage upgrades the origin to "persistent" where the
 * browser supports it, which exempts it from that automatic eviction. It's a
 * best-effort request — some browsers grant it silently, some tie it to the app
 * being installed, some ignore it — so we never block startup on the result and
 * never treat a refusal as an error. Backups (see backupReminder.ts) remain the
 * real safety net; this just makes a wipe far less likely in the first place.
 */

/** True once the origin's storage is marked persistent (or already was). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator?.storage
    if (!storage || typeof storage.persist !== 'function') return false
    // Don't re-prompt if it's already granted.
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    // Unsupported or blocked (e.g. private mode) — nothing more we can do here.
    return false
  }
}
