import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LugatchaDB } from '@/db/LugatchaDB'
import {
  collectBackup,
  applyBackup,
  parseBackup,
  isBackupFile,
  InvalidBackupError,
  BACKUP_FORMAT,
  BACKUP_VERSION,
} from '@/db/backup'
import {
  markWordsSeen,
  recordMatchResult,
  completeExercise,
  recordRoleplayShown,
} from '@/db/progress'

let db: LugatchaDB

beforeEach(() => {
  // seedDatabase fires on first DB access (populate). Backups never carry
  // content, so an empty manifest is all we need — travel/group files are
  // allowed to 404. This keeps the seed from throwing an unhandled rejection.
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace(/^.*\/data\//, '')
    const data = path === 'manifest.json' ? { words: [], stories: [], roleplay: [] } : undefined
    return { ok: data !== undefined, status: data ? 200 : 404, json: async () => data } as Response
  })
  db = new LugatchaDB()
})

afterEach(async () => {
  await db.delete()
  vi.unstubAllGlobals()
})

async function seedSomeProgress() {
  await markWordsSeen(db, ['core.hello', 'airport.passport'])
  await recordMatchResult(db, 'core.hello', true)
  await completeExercise(db, 'airport', 'intro')
  await recordRoleplayShown(db, 'base')
  localStorage.setItem('lugatcha.settings', JSON.stringify({ baseLanguage: 'ru' }))
  localStorage.setItem('lugatcha.streakCount', '7')
  localStorage.setItem('lugatcha.contentVersion', '9') // must NOT be backed up
}

describe('collectBackup', () => {
  it('captures progress tables and lugatcha.* settings', async () => {
    await seedSomeProgress()
    const backup = await collectBackup(db)

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(new Date(backup.exportedAt).toString()).not.toBe('Invalid Date')
    expect(backup.tables.wordProgress).toHaveLength(2)
    expect(backup.tables.locationProgress).toHaveLength(1)
    expect(backup.tables.roleplayProgress).toHaveLength(1)
    expect(backup.localStorage['lugatcha.settings']).toContain('ru')
    expect(backup.localStorage['lugatcha.streakCount']).toBe('7')
  })

  it('never carries the content-version marker', async () => {
    await seedSomeProgress()
    const backup = await collectBackup(db)
    expect('lugatcha.contentVersion' in backup.localStorage).toBe(false)
  })
})

describe('applyBackup', () => {
  it('round-trips progress and settings', async () => {
    await seedSomeProgress()
    const backup = await collectBackup(db)

    // Wipe everything the backup should restore.
    await db.wordProgress.clear()
    await db.locationProgress.clear()
    await db.roleplayProgress.clear()
    localStorage.clear()

    await applyBackup(db, backup)

    expect(await db.wordProgress.count()).toBe(2)
    expect((await db.wordProgress.get('core.hello'))?.lastResults).toEqual([true])
    expect((await db.locationProgress.get('airport'))?.completedExercises).toEqual(['intro'])
    expect(localStorage.getItem('lugatcha.settings')).toContain('ru')
    expect(localStorage.getItem('lugatcha.streakCount')).toBe('7')
  })

  it('replaces existing progress rather than merging', async () => {
    await markWordsSeen(db, ['old.word'])
    const empty = await collectBackup(db) // captures old.word
    await db.wordProgress.clear()
    await markWordsSeen(db, ['new.word'])

    await applyBackup(db, empty)

    expect(await db.wordProgress.get('new.word')).toBeUndefined()
    expect(await db.wordProgress.get('old.word')).toBeDefined()
  })

  it('does not restore the content-version marker', async () => {
    await seedSomeProgress()
    const backup = await collectBackup(db)
    localStorage.clear()
    await applyBackup(db, backup)
    expect(localStorage.getItem('lugatcha.contentVersion')).toBeNull()
  })

  it('tolerates a backup missing a table', async () => {
    await seedSomeProgress()
    const backup = await collectBackup(db)
    // A future/partial file might omit a table entirely.
    delete (backup.tables as Record<string, unknown>).phraseProgress
    await expect(applyBackup(db, backup)).resolves.toBeUndefined()
  })
})

describe('parseBackup / isBackupFile', () => {
  it('accepts a genuine backup', async () => {
    await seedSomeProgress()
    const json = JSON.stringify(await collectBackup(db))
    expect(isBackupFile(parseBackup(json))).toBe(true)
  })

  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json {')).toThrow(InvalidBackupError)
  })

  it('rejects JSON that is not a backup', () => {
    expect(() => parseBackup(JSON.stringify({ hello: 'world' }))).toThrow(InvalidBackupError)
  })

  it('rejects a backup from a newer app version', () => {
    const future = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION + 1,
      exportedAt: new Date().toISOString(),
      tables: {},
      localStorage: {},
    })
    expect(() => parseBackup(future)).toThrow(/newer version/)
  })
})
