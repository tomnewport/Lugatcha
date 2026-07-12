import type { LugatchaDB } from './LugatchaDB'

/**
 * Local backup & restore (issue: "local backup and restore needed").
 *
 * Everything a learner has *earned* lives in two places: the progress tables in
 * IndexedDB, and a handful of `lugatcha.*` keys in localStorage (chosen
 * language, daily-practice streak). Content tables (words, stories, roleplay)
 * are re-seeded from the shipped data files, so a backup never carries them —
 * that keeps the file tiny and lets a restore land on any app version.
 *
 * The format is plain JSON so it survives being emailed, dropped into a
 * cloud-synced folder, or shared to another device via the OS share sheet.
 */

/** Marker so we can tell a Lugʻatcha backup from any other JSON file. */
export const BACKUP_FORMAT = 'lugatcha-backup'

/** Bump when the shape below changes incompatibly. */
export const BACKUP_VERSION = 1

/** The Dexie tables that hold learner progress (never content). */
export const PROGRESS_TABLES = [
  'wordProgress',
  'locationProgress',
  'lessonProgress',
  'storyProgress',
  'roleplayProgress',
  'phraseProgress',
] as const

type ProgressTable = (typeof PROGRESS_TABLES)[number]

/** localStorage keys under this prefix are learner state worth backing up… */
const LOCALSTORAGE_PREFIX = 'lugatcha.'

/**
 * …except this one: it records which content-seed version is on the device, and
 * carrying it across a restore could wrongly suppress a needed re-seed.
 */
const LOCALSTORAGE_EXCLUDE = new Set(['lugatcha.contentVersion'])

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  /** ISO-8601 timestamp of when the backup was taken. */
  exportedAt: string
  /** Rows for each progress table, keyed by table name. */
  tables: Record<ProgressTable, unknown[]>
  /** Backed-up localStorage entries, keyed by their full key. */
  localStorage: Record<string, string>
}

/** Reads every `lugatcha.*` localStorage entry worth backing up. */
function collectLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(LOCALSTORAGE_PREFIX) || LOCALSTORAGE_EXCLUDE.has(key)) continue
      const value = localStorage.getItem(key)
      if (value !== null) out[key] = value
    }
  } catch {
    // private mode — nothing to collect
  }
  return out
}

/** Gathers all learner progress into a self-describing backup object. */
export async function collectBackup(db: LugatchaDB): Promise<BackupFile> {
  const rows = await Promise.all(PROGRESS_TABLES.map((name) => db.table(name).toArray()))
  const tables = {} as Record<ProgressTable, unknown[]>
  PROGRESS_TABLES.forEach((name, i) => (tables[name] = rows[i]))
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
    localStorage: collectLocalStorage(),
  }
}

/** True when `value` is a Lugʻatcha backup this app knows how to restore. */
export function isBackupFile(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<BackupFile>
  return (
    v.format === BACKUP_FORMAT &&
    typeof v.version === 'number' &&
    typeof v.tables === 'object' &&
    v.tables !== null
  )
}

/**
 * Thrown when a file the user picked isn't a backup we can restore, so the UI
 * can show a clear message instead of a raw parse error.
 */
export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBackupError'
  }
}

/** Parses backup JSON, validating its shape and version. */
export function parseBackup(json: string): BackupFile {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new InvalidBackupError("This file isn't valid JSON.")
  }
  if (!isBackupFile(value)) {
    throw new InvalidBackupError("This doesn't look like a Lugʻatcha backup.")
  }
  if (value.version > BACKUP_VERSION) {
    throw new InvalidBackupError(
      'This backup was made by a newer version of the app. Please update, then try again.',
    )
  }
  return value
}

/** Restores localStorage entries from a backup, replacing existing ones. */
function restoreLocalStorage(entries: Record<string, string> | undefined): void {
  if (!entries) return
  try {
    for (const [key, value] of Object.entries(entries)) {
      if (!key.startsWith(LOCALSTORAGE_PREFIX) || LOCALSTORAGE_EXCLUDE.has(key)) continue
      localStorage.setItem(key, value)
    }
  } catch {
    // private mode — settings just won't persist
  }
}

/**
 * Replaces all learner progress with the contents of `backup`. Progress tables
 * are cleared and rewritten wholesale (a restore is "make this device look like
 * that backup", not a merge), then the backed-up settings and streak are put
 * back. Content tables are never touched. The caller should reload afterwards so
 * live queries and the streak re-read from the restored state.
 */
export async function applyBackup(db: LugatchaDB, backup: BackupFile): Promise<void> {
  const tables = PROGRESS_TABLES.filter((name) => Array.isArray(backup.tables[name]))
  await db.transaction(
    'rw',
    tables.map((name) => db.table(name)),
    async () => {
      for (const name of tables) {
        await db.table(name).clear()
        const rows = backup.tables[name]
        if (rows.length) await db.table(name).bulkPut(rows)
      }
    },
  )
  restoreLocalStorage(backup.localStorage)
}
