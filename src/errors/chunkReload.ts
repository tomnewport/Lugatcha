/**
 * Recover from stale lazy-chunk failures after a deploy (PWA update issue).
 *
 * The app ships as a PWA with `registerType: 'autoUpdate'` (see vite.config.ts).
 * When a new version is deployed, a fresh service worker installs and activates
 * automatically, and Workbox purges the old precache — deleting the previous
 * build's hashed JS chunks. A tab (or installed PWA) that was open across the
 * update still holds the OLD index.html in memory, so the moment the user
 * navigates to a lazily-loaded route (Settings, School, Practice, Travel…) the
 * dynamic `import()` fetches a chunk hash that no longer exists on the server.
 * The browser then throws "Failed to fetch dynamically imported module" — which
 * is exactly the error a user hits when they can't move around after an update.
 *
 * The reliable fix is a one-time full reload: fetching a fresh index.html pulls
 * in the new chunk hashes, and the hash-based router restores the route the user
 * was on. A short sessionStorage guard stops this from becoming a reload loop
 * when the reload genuinely can't help (offline, or a chunk that 404s for real).
 */

/** Where the last recovery reload was stamped, to break reload loops. */
const RELOAD_GUARD_KEY = 'lugatcha.chunkReloadAt'
/** If a reload doesn't fix the import within this window, stop retrying. */
const RELOAD_GUARD_MS = 10_000

/**
 * True when an error is a browser "the code chunk isn't there" failure — the
 * signature of a lazy import pointing at a file the current deploy removed.
 * Messages vary across browsers, so match all the known phrasings plus the
 * `ChunkLoadError` name that bundlers attach.
 */
export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof Error && error.name === 'ChunkLoadError') return true
  const message = error instanceof Error ? error.message : String(error)
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module|Loading chunk \d+ failed/i.test(
    message,
  )
}

/**
 * If `error` looks like a stale-chunk failure, trigger a one-time page reload to
 * pick up the freshly deployed build. Returns `true` when a reload was started
 * (the caller should then stop handling the error — the page is about to go
 * away), or `false` when the error isn't a chunk failure or a reload was already
 * attempted moments ago and clearly didn't help.
 *
 * `reload` is injectable so the guard logic is testable without a real browser.
 */
export function recoverFromStaleChunk(
  error: unknown,
  reload: () => void = defaultReload,
): boolean {
  if (!isStaleChunkError(error)) return false

  // Guard against a reload loop: if we reloaded moments ago and the very same
  // import still fails, the reload isn't fixing it (offline, or a genuine 404),
  // so let the error surface as a toast instead of spinning the page forever.
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0')
    if (Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage unavailable (private mode / storage disabled). Without a
    // guard we can't tell a first failure from a loop, so don't auto-reload —
    // surface the error rather than risk reloading endlessly.
    return false
  }

  reload()
  return true
}

function defaultReload(): void {
  if (typeof window !== 'undefined') window.location.reload()
}
