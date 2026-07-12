import type { BackupFile } from './backup'

/**
 * Browser glue for getting a backup out of, and back into, the app. Kept apart
 * from backup.ts (which is pure and unit-tested) because it touches the DOM,
 * the filesystem, and the OS share sheet.
 *
 * "Cloud backup without a backend" lives here: on a phone, `navigator.share`
 * hands the file to the OS share sheet, so the learner can drop it straight into
 * iCloud Drive, Google Drive, Dropbox, Files, or email — no server of ours in
 * the loop. On the desktop it saves a file, which the learner can keep in a
 * cloud-synced folder for the same effect.
 */

/** A stable, dated filename so successive backups sort and don't collide. */
export function backupFilename(date = new Date()): string {
  return `lugatcha-backup-${date.toISOString().slice(0, 10)}.json`
}

/** True when the browser can share files via the OS share sheet. */
function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

/**
 * Offers a backup to the learner: shares it to the OS share sheet where that's
 * available (phones), otherwise downloads it as a file (desktop). Returns false
 * only when the user cancels the share sheet, so the UI can stay quiet.
 */
export async function saveBackup(backup: BackupFile): Promise<boolean> {
  const json = JSON.stringify(backup, null, 2)
  const name = backupFilename()
  const file = new File([json], name, { type: 'application/json' })

  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: 'Lugʻatcha backup' })
      return true
    } catch (err) {
      // A cancelled share sheet is not an error; anything else falls through to
      // a plain download so the learner still gets their file.
      if (err instanceof DOMException && err.name === 'AbortError') return false
    }
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has claimed the URL first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

/**
 * Opens the OS file picker and resolves with the chosen file's text, or null if
 * the learner cancels. Restricted to JSON, matching what {@link saveBackup}
 * writes.
 */
export function pickBackupText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      file.text().then(resolve, () => resolve(null))
    })
    // Some browsers only fire `change`; there's no reliable cancel event, so we
    // simply resolve nothing further if the user dismisses the picker.
    input.click()
  })
}
