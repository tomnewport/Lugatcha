/**
 * Storage diagnostics (issue: a learner keeps losing all their progress after an
 * app update, on a Samsung device).
 *
 * Progress lives only on the device — IndexedDB plus a few `lugatcha.*`
 * localStorage keys (see db/persist.ts, db/backup.ts). When it vanishes there
 * are really only two families of cause, and this module is built to tell them
 * apart from inside the running app:
 *
 *  1. **Eviction.** The origin's storage was never marked persistent, so the
 *     browser deleted it — under storage pressure, or after a spell without a
 *     visit. The data is genuinely gone. `navigator.storage.persisted()` and the
 *     usage/quota estimate expose this.
 *
 *  2. **Wrong storage partition.** The data is intact but the app is now reading
 *     a *different* store. On Samsung phones a home-screen icon can be backed by
 *     Samsung Internet, by Chrome, or by an in-app WebView, and an OS/browser
 *     update can quietly switch which one opens the icon. Each engine has its own
 *     IndexedDB origin, so a switch looks exactly like a wipe. The engine sniff
 *     and the "installed?" flag expose this.
 *
 * Everything here is best-effort and defensive: any probe may be unsupported or
 * throw, and a diagnostics panel must never itself crash the settings screen.
 * The report is plain, copy-pasteable technical text the learner can send back.
 */
import { db } from './LugatchaDB'
import { APP_COMMIT, APP_BUILD_TIME } from '@/errors/reporter'
import { CONTENT_VERSION } from './seed'
import { PROGRESS_TABLES } from './backup'
import { getLastBackupAt } from './backupReminder'
import { storageHealth } from './storageHealth'

export interface InfoRow {
  label: string
  value: string
}

export type FindingSeverity = 'high' | 'medium' | 'info'

export interface Finding {
  severity: FindingSeverity
  text: string
}

export interface DiagnosticGroup {
  title: string
  rows: InfoRow[]
}

export interface DiagnosticsReport {
  generatedAt: string
  groups: DiagnosticGroup[]
  findings: Finding[]
}

/**
 * Per-device lifetime markers. Kept under a `lugatcha.diag.` prefix that the
 * backup deliberately skips (see db/backup.ts) so they describe *this* physical
 * store and never travel to another device in a restore — otherwise a restored
 * backup would claim the store is older than it is.
 */
const DIAG_PREFIX = 'lugatcha.diag.'
const FIRST_OPEN_KEY = `${DIAG_PREFIX}firstOpenAt`
const LAST_OPEN_KEY = `${DIAG_PREFIX}lastOpenAt`
const OPEN_COUNT_KEY = `${DIAG_PREFIX}openCount`
const LAST_ENGINE_KEY = `${DIAG_PREFIX}lastEngine`
const LAST_PERSISTED_KEY = `${DIAG_PREFIX}lastPersisted`

/** True for keys the backup should leave behind (they are per-device diagnostics). */
export function isDiagnosticKey(key: string): boolean {
  return key.startsWith(DIAG_PREFIX)
}

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode — diagnostics simply won't persist */
  }
}

/**
 * Record that the app opened. Called once at startup. The very first open stamps
 * `firstOpenAt`; every open bumps `lastOpenAt` and an open counter, and snapshots
 * the current engine and persisted flag. A later data-loss report can then show
 * whether the store looks freshly created (low open count, recent first-open),
 * and whether the engine or persistence *changed* since last time — the
 * fingerprints of a partition switch or a revoked grant.
 */
export async function recordAppOpen(now: number = Date.now()): Promise<void> {
  try {
    if (readLS(FIRST_OPEN_KEY) === null) writeLS(FIRST_OPEN_KEY, String(now))
    writeLS(LAST_OPEN_KEY, String(now))
    const count = Number(readLS(OPEN_COUNT_KEY) ?? '0')
    writeLS(OPEN_COUNT_KEY, String((Number.isFinite(count) ? count : 0) + 1))

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    writeLS(LAST_ENGINE_KEY, detectEngine(ua).name)

    const persisted = await isPersisted()
    if (persisted !== null) writeLS(LAST_PERSISTED_KEY, persisted ? 'true' : 'false')
  } catch {
    // Never let bookkeeping break startup.
  }
}

export interface EngineInfo {
  name: string
  isSamsungInternet: boolean
  isWebView: boolean
}

/**
 * Best-effort browser-engine sniff from a user-agent string. We only care about
 * the distinctions that change *which storage partition* the app sees on Android:
 * Samsung Internet, an in-app WebView, or a plain Chrome/other browser tab.
 */
export function detectEngine(ua: string): EngineInfo {
  const isSamsungInternet = /SamsungBrowser/i.test(ua)
  // Android WebView tags the platform token with "wv" — e.g. "…Build/…; wv)".
  const isWebView = /;\s*wv[;)]/i.test(ua) || /\bwv\)/i.test(ua)

  let name: string
  if (isSamsungInternet) name = 'Samsung Internet'
  else if (isWebView) name = 'Android WebView (in-app browser)'
  else if (/EdgA?\//i.test(ua)) name = 'Edge'
  else if (/Firefox\/|FxiOS\//i.test(ua)) name = 'Firefox'
  else if (/CriOS\//i.test(ua)) name = 'Chrome (iOS)'
  else if (/Chrome\//i.test(ua)) name = 'Chrome'
  else if (/Safari\//i.test(ua)) name = 'Safari'
  else name = 'Unknown'

  return { name, isSamsungInternet, isWebView }
}

/** Whether this origin's storage is marked persistent, or null if unknowable. */
async function isPersisted(): Promise<boolean | null> {
  try {
    const storage = navigator?.storage
    if (!storage || typeof storage.persisted !== 'function') return null
    return await storage.persisted()
  } catch {
    return null
  }
}

/** `navigator.storage.estimate()`, guarded; null when unsupported or blocked. */
async function storageEstimate(): Promise<{ usage?: number; quota?: number } | null> {
  try {
    const storage = navigator?.storage
    if (!storage || typeof storage.estimate !== 'function') return null
    return await storage.estimate()
  } catch {
    return null
  }
}

/** Human byte size, e.g. 1536 → "1.5 MB". */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return String(bytes)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function formatTimestamp(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return 'never'
  try {
    return new Date(ms).toISOString()
  } catch {
    return 'never'
  }
}

/** Count rows in a Dexie table, or null if it can't be read. */
async function countTable(name: string): Promise<number | null> {
  try {
    return await db.table(name).count()
  } catch {
    return null
  }
}

/** All `lugatcha.*` localStorage keys currently present (names only, not values). */
function localStorageKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('lugatcha.')) keys.push(key)
    }
  } catch {
    /* private mode */
  }
  return keys.sort()
}

/** Names of Cache Storage buckets (precached shell, data, audio), best-effort. */
async function cacheNames(): Promise<string[] | null> {
  try {
    if (!('caches' in globalThis)) return null
    return await caches.keys()
  } catch {
    return null
  }
}

/**
 * Gather the full diagnostics report: labelled rows grouped for display, plus a
 * ranked list of *findings* — plain-language notes about the likely cause of a
 * wipe, derived from the probes above.
 */
export async function gatherDiagnostics(now: number = Date.now()): Promise<DiagnosticsReport> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const win = typeof window !== 'undefined' ? window : undefined
  const ua = nav?.userAgent ?? 'unknown'
  const engine = detectEngine(ua)

  const persisted = await isPersisted()
  const estimate = await storageEstimate()
  const lastPersistedRaw = readLS(LAST_PERSISTED_KEY)

  const standalone = Boolean(
    win?.matchMedia?.('(display-mode: standalone)').matches ||
      (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true,
  )

  // ── Storage safety ────────────────────────────────────────────────────────
  const storageRows: InfoRow[] = []
  storageRows.push({
    label: 'Persistent storage',
    value:
      persisted === null ? 'unknown (not supported)' : persisted ? 'granted' : 'NOT granted',
  })
  if (lastPersistedRaw !== null) {
    storageRows.push({ label: 'Persistent (previous open)', value: lastPersistedRaw })
  }
  if (estimate && typeof estimate.usage === 'number') {
    const pct =
      typeof estimate.quota === 'number' && estimate.quota > 0
        ? ` (${((estimate.usage / estimate.quota) * 100).toFixed(1)}%)`
        : ''
    storageRows.push({
      label: 'Storage in use',
      value: `${formatBytes(estimate.usage)}${
        typeof estimate.quota === 'number' ? ` of ${formatBytes(estimate.quota)}` : ''
      }${pct}`,
    })
  } else {
    storageRows.push({ label: 'Storage estimate', value: 'unavailable' })
  }
  storageRows.push({
    label: 'Write blocked (out of space)',
    value: storageHealth.full ? 'YES — a write failed this session' : 'no',
  })

  // ── Browser & install ─────────────────────────────────────────────────────
  const browserRows: InfoRow[] = [
    { label: 'Browser engine', value: engine.name },
    { label: 'In-app WebView', value: engine.isWebView ? 'yes' : 'no' },
    { label: 'Installed (home screen)', value: standalone ? 'yes' : 'no' },
    { label: 'Engine (previous open)', value: readLS(LAST_ENGINE_KEY) ?? '(none recorded)' },
    { label: 'User agent', value: ua },
  ]
  if (nav?.platform) browserRows.push({ label: 'Platform', value: String(nav.platform) })
  if (nav && typeof nav.onLine === 'boolean') {
    browserRows.push({ label: 'Online', value: nav.onLine ? 'yes' : 'no' })
  }

  // ── Saved data on this device ─────────────────────────────────────────────
  const wordCount = await countTable('words')
  const progressCounts = await Promise.all(PROGRESS_TABLES.map((name) => countTable(name)))
  const progressTotal = progressCounts.reduce<number | null>(
    (sum, n) => (sum === null || n === null ? (sum === null ? n : sum) : sum + n),
    0,
  )
  const dataRows: InfoRow[] = []
  dataRows.push({
    label: 'Database open',
    value: db.isOpen() ? `yes (v${db.verno})` : 'no',
  })
  dataRows.push({ label: 'Words seeded', value: wordCount === null ? 'error' : String(wordCount) })
  PROGRESS_TABLES.forEach((name, i) => {
    dataRows.push({
      label: name,
      value: progressCounts[i] === null ? 'error' : String(progressCounts[i]),
    })
  })
  dataRows.push({ label: 'Progress rows (total)', value: progressTotal === null ? 'error' : String(progressTotal) })
  dataRows.push({ label: 'Last backup', value: formatTimestamp(getLastBackupAt()) })

  // ── App & lifetime ────────────────────────────────────────────────────────
  const firstOpen = Number(readLS(FIRST_OPEN_KEY))
  const openCount = Number(readLS(OPEN_COUNT_KEY) ?? '0')
  const lifetimeRows: InfoRow[] = [
    { label: 'App commit', value: APP_COMMIT },
    ...(APP_BUILD_TIME ? [{ label: 'App built', value: APP_BUILD_TIME }] : []),
    { label: 'Content version', value: String(CONTENT_VERSION) },
    { label: 'First opened (this store)', value: formatTimestamp(Number.isFinite(firstOpen) ? firstOpen : null) },
    { label: 'Last opened', value: formatTimestamp(Number(readLS(LAST_OPEN_KEY)) || null) },
    { label: 'Opens counted', value: Number.isFinite(openCount) ? String(openCount) : '0' },
    { label: 'lugatcha.* keys present', value: localStorageKeys().join(', ') || '(none)' },
  ]
  const caches = await cacheNames()
  if (caches !== null) {
    lifetimeRows.push({ label: 'Cache buckets', value: caches.join(', ') || '(none)' })
  }

  // ── Findings: the likely-cause notes ──────────────────────────────────────
  const findings: Finding[] = []

  if (storageHealth.full) {
    findings.push({
      severity: 'high',
      text:
        'A database write failed this session because the device is out of ' +
        'storage — new progress is NOT being saved. Free up space on the device, ' +
        'and back up now (a backup file is saved outside the app, so it still ' +
        'works when storage is full).',
    })
  }
  if (storageHealth.low && !storageHealth.full) {
    findings.push({
      severity: 'medium',
      text:
        'Device storage is nearly full. When it runs out, progress stops saving ' +
        'and stored data can be evicted. Free up space and keep a backup.',
    })
  }
  if (persisted === false) {
    findings.push({
      severity: 'high',
      text:
        'Persistent storage is NOT granted, so the browser is allowed to delete ' +
        "Lugʻatcha's data on its own — under storage pressure, or after a period " +
        'without opening the app. This is a leading cause of lost progress. ' +
        'Installing the app to the home screen and keeping regular backups is the fix.',
    })
  }
  if (lastPersistedRaw === 'true' && persisted === false) {
    findings.push({
      severity: 'high',
      text:
        'Persistent storage was granted on a previous open but is not now — the ' +
        'browser appears to have revoked it, which typically precedes an eviction.',
    })
  }
  if (engine.isWebView) {
    findings.push({
      severity: 'high',
      text:
        'The app is running inside an in-app WebView, not a full browser. WebView ' +
        'storage is separate from the browser, so progress saved in the browser is ' +
        'invisible here (and vice-versa). An update that changed how the home-screen ' +
        'icon opens can look exactly like a wipe.',
    })
  }
  const prevEngine = readLS(LAST_ENGINE_KEY)
  if (prevEngine && prevEngine !== engine.name) {
    findings.push({
      severity: 'high',
      text:
        `The app opened in "${engine.name}" but last opened in "${prevEngine}". Each ` +
        'browser/engine keeps its own separate storage, so switching between them ' +
        'shows an empty, freshly-seeded app even though the old data still exists in ' +
        'the other one.',
    })
  }
  if (engine.isSamsungInternet) {
    findings.push({
      severity: 'info',
      text:
        'Running in Samsung Internet. On Samsung phones a home-screen app can be ' +
        'backed by Samsung Internet or by Chrome; if the backing browser changes, the ' +
        'app opens a different, empty storage area.',
    })
  }
  if (wordCount !== null && wordCount > 0 && progressTotal === 0) {
    findings.push({
      severity: 'medium',
      text:
        'Vocabulary is loaded but there are zero saved-progress rows. The progress ' +
        'store is empty here — either it was cleared/evicted, this is a different ' +
        'browser or profile, or no progress was ever saved on this store.',
    })
  }
  if (!standalone) {
    findings.push({
      severity: 'info',
      text:
        'The app is not installed to the home screen. Installed apps are much less ' +
        'likely to have their storage evicted than a plain browser tab.',
    })
  }
  if (Number.isFinite(openCount) && openCount <= 1) {
    findings.push({
      severity: 'info',
      text:
        'This storage has only been opened once — it looks freshly created, ' +
        'consistent with a reset or a switch to a different browser/store.',
    })
  }
  if (getLastBackupAt() === null) {
    findings.push({
      severity: 'info',
      text:
        'No backup has ever been taken on this device. A backup file is the only ' +
        'thing that can bring progress back after a wipe — take one from Settings and ' +
        'keep it in a synced folder.',
    })
  }

  return {
    generatedAt: new Date(now).toISOString(),
    groups: [
      { title: 'Storage safety', rows: storageRows },
      { title: 'Browser & install', rows: browserRows },
      { title: 'Saved data on this device', rows: dataRows },
      { title: 'App & lifetime', rows: lifetimeRows },
    ],
    findings,
  }
}

/** Render a report as a plain-text block for pasting into an issue or a message. */
export function formatDiagnosticsReport(report: DiagnosticsReport): string {
  const lines: string[] = ['Lugʻatcha diagnostics', `Generated: ${report.generatedAt}`, '']
  if (report.findings.length) {
    lines.push('Likely causes:')
    for (const f of report.findings) lines.push(`- [${f.severity.toUpperCase()}] ${f.text}`)
    lines.push('')
  }
  for (const group of report.groups) {
    lines.push(`## ${group.title}`)
    for (const row of group.rows) lines.push(`- ${row.label}: ${row.value}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}
