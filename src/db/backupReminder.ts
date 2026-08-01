/**
 * When to nudge a learner to back up (issue: a learner lost all their progress).
 *
 * Progress lives only on the device, so a browser wipe or WebKit's ~7-day
 * eviction of an un-installed PWA loses everything (see db/persist.ts). The
 * cheapest defence is a habit: a gentle reminder every couple of days to export
 * a backup file the learner keeps in a synced folder. Then a wipe costs minutes.
 *
 * This module is the pure scheduling logic — when a reminder is due, and the
 * small `lugatcha.*` bookkeeping behind it — kept free of DOM/Vue so it can be
 * unit tested. The two timestamps it owns are ordinary `lugatcha.*` keys, so a
 * backup captures them; that's harmless (worst case a restored device is
 * reminded a little sooner or later).
 */

/** Last time a backup was taken, as unix ms. */
const LAST_BACKUP_KEY = 'lugatcha.lastBackupAt'
/** Don't remind again until this unix ms (set on first use and on "Later"). */
const SNOOZE_KEY = 'lugatcha.backupReminderSnoozedUntil'

/** "Every couple of days" — how long a backup (or a snooze) holds the nudge off. */
export const BACKUP_REMINDER_DAYS = 2
const DAY_MS = 24 * 60 * 60 * 1000

function readNum(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeNum(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // private mode — the reminder simply won't persist between sessions
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* private mode */
  }
}

/** When the last backup was taken, or null if the learner never has. */
export function getLastBackupAt(): number | null {
  return readNum(LAST_BACKUP_KEY)
}

/** Records that a backup was just taken and clears any pending snooze. */
export function markBackedUp(now: number = Date.now()): void {
  writeNum(LAST_BACKUP_KEY, now)
  remove(SNOOZE_KEY)
}

/** Pushes the next reminder out by the reminder interval (the "Later" action). */
export function snoozeReminder(now: number = Date.now()): void {
  writeNum(SNOOZE_KEY, now + BACKUP_REMINDER_DAYS * DAY_MS)
}

/**
 * Starts the reminder clock the first time a learner has progress but no backup
 * history yet, so they get their couple-of-days grace instead of being nudged
 * the moment they meet their first word. No-op once a backup or snooze exists.
 * Returns true if it set the baseline (for callers that want to know).
 */
export function ensureReminderBaseline(hasProgress: boolean, now: number = Date.now()): boolean {
  if (!hasProgress) return false
  if (getLastBackupAt() !== null || readNum(SNOOZE_KEY) !== null) return false
  writeNum(SNOOZE_KEY, now + BACKUP_REMINDER_DAYS * DAY_MS)
  return true
}

/**
 * Whether to show the backup reminder now: there's progress worth saving, we're
 * past any snooze, and it's been at least the reminder interval since the last
 * backup (or there's never been one and the baseline grace has elapsed).
 */
export function isBackupReminderDue(hasProgress: boolean, now: number = Date.now()): boolean {
  if (!hasProgress) return false
  const snoozedUntil = readNum(SNOOZE_KEY)
  if (snoozedUntil !== null && now < snoozedUntil) return false
  const last = getLastBackupAt()
  if (last === null) return true
  return now - last >= BACKUP_REMINDER_DAYS * DAY_MS
}
