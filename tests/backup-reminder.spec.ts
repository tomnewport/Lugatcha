import { describe, it, expect, beforeEach } from 'vitest'
import {
  isBackupReminderDue,
  ensureReminderBaseline,
  markBackedUp,
  snoozeReminder,
  getLastBackupAt,
  BACKUP_REMINDER_DAYS,
} from '@/db/backupReminder'

const DAY = 24 * 60 * 60 * 1000
const T0 = 1_700_000_000_000 // a fixed "now"

beforeEach(() => localStorage.clear())

describe('isBackupReminderDue', () => {
  it('never nags when there is no progress to save', () => {
    expect(isBackupReminderDue(false, T0)).toBe(false)
  })

  it('is due when there is progress and no backup or snooze yet', () => {
    expect(isBackupReminderDue(true, T0)).toBe(true)
  })

  it('is held off while a snooze is live, then returns', () => {
    snoozeReminder(T0)
    expect(isBackupReminderDue(true, T0 + DAY)).toBe(false)
    // Snooze lasts BACKUP_REMINDER_DAYS days.
    expect(isBackupReminderDue(true, T0 + BACKUP_REMINDER_DAYS * DAY + 1)).toBe(true)
  })

  it('is held off for the reminder window after a backup, then returns', () => {
    markBackedUp(T0)
    expect(isBackupReminderDue(true, T0 + DAY)).toBe(false)
    expect(isBackupReminderDue(true, T0 + BACKUP_REMINDER_DAYS * DAY)).toBe(true)
  })
})

describe('markBackedUp', () => {
  it('records the time and clears a pending snooze', () => {
    snoozeReminder(T0)
    markBackedUp(T0 + DAY)
    expect(getLastBackupAt()).toBe(T0 + DAY)
    // The old snooze is gone; only the fresh backup window applies now.
    expect(isBackupReminderDue(true, T0 + DAY + 1)).toBe(false)
  })
})

describe('ensureReminderBaseline', () => {
  it('starts a grace window on first progress so a new learner is not nagged at once', () => {
    expect(ensureReminderBaseline(true, T0)).toBe(true)
    expect(isBackupReminderDue(true, T0)).toBe(false)
    expect(isBackupReminderDue(true, T0 + BACKUP_REMINDER_DAYS * DAY + 1)).toBe(true)
  })

  it('does nothing without progress, and never overrides an existing backup', () => {
    expect(ensureReminderBaseline(false, T0)).toBe(false)
    markBackedUp(T0)
    expect(ensureReminderBaseline(true, T0 + 5 * DAY)).toBe(false)
    expect(getLastBackupAt()).toBe(T0)
  })
})
