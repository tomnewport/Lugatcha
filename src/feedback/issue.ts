/**
 * Builds a prefilled GitHub issue from the in-app "Raise an issue" form.
 *
 * Two scopes:
 *  - `general`  — feedback about the app as a whole.
 *  - `activity` — feedback about the specific activity the learner is doing;
 *                 the current {@link feedbackState} activity and the word/phrase
 *                 in view are attached.
 *
 * Both scopes attach environment details (client and device) so a maintainer can
 * reproduce the report. Only non-identifying, technical details are collected.
 */
import { i18n } from '@/i18n'
import { APP_COMMIT, APP_BUILD_TIME } from '@/errors/reporter'
import { feedbackState } from './activityContext'

const REPO_ISSUES_URL = 'https://github.com/tomnewport/Lugatcha/issues/new'
/** GitHub truncates very long URLs; keep the prefilled body comfortably under. */
const MAX_BODY_CHARS = 5500

export type FeedbackScope = 'general' | 'activity'

export interface InfoRow {
  label: string
  value: string
}

interface NavigatorUAData {
  platform?: string
}

/**
 * Non-identifying details about the user's client and device, used to reproduce
 * a report. No cookies, storage, or personal data — just the browser and screen.
 */
export function collectClientInfo(): InfoRow[] {
  const rows: InfoRow[] = []
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const win = typeof window !== 'undefined' ? window : undefined

  if (nav) {
    rows.push({ label: 'User agent', value: nav.userAgent })
    if (nav.language) rows.push({ label: 'Language', value: nav.language })
    const uaData = (nav as Navigator & { userAgentData?: NavigatorUAData }).userAgentData
    const platform = uaData?.platform || nav.platform
    if (platform) rows.push({ label: 'Platform', value: String(platform) })
    if (typeof nav.onLine === 'boolean') {
      rows.push({ label: 'Online', value: nav.onLine ? 'yes' : 'no' })
    }
  }

  if (win) {
    rows.push({ label: 'Viewport', value: `${win.innerWidth}×${win.innerHeight}` })
    if (win.screen) {
      const dpr = win.devicePixelRatio ? `@${win.devicePixelRatio}x` : ''
      rows.push({ label: 'Screen', value: `${win.screen.width}×${win.screen.height} ${dpr}`.trim() })
    }
    const standalone =
      win.matchMedia?.('(display-mode: standalone)').matches ||
      (nav as Navigator & { standalone?: boolean })?.standalone === true
    rows.push({ label: 'Installed (PWA)', value: standalone ? 'yes' : 'no' })
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) rows.push({ label: 'Time zone', value: tz })
  } catch {
    // Intl unavailable — skip
  }

  rows.push({ label: 'Commit', value: APP_COMMIT })
  if (APP_BUILD_TIME) rows.push({ label: 'Built', value: APP_BUILD_TIME })

  return rows
}

/** Current route, from the URL hash (the app uses hash history). */
function currentRoute(): string {
  if (typeof location === 'undefined') return ''
  return location.hash || location.pathname || ''
}

/** Details block for a report scoped to the current activity, or `null`. */
export function activityDetailRows(): InfoRow[] | null {
  const activity = feedbackState.activity
  if (!activity) return null
  const rows: InfoRow[] = [{ label: 'Activity', value: activity.label }, ...activity.details]
  if (feedbackState.lastUzbek) {
    rows.push({ label: 'Word/phrase in view', value: feedbackState.lastUzbek })
  }
  return rows
}

/** Whether a report can be scoped to a specific activity right now. */
export function hasActivityContext(): boolean {
  return feedbackState.activity !== null
}

/**
 * Assemble the prefilled new-issue URL for the given scope and free-text comment.
 * When `scope` is `activity` but no activity context is set, it degrades to a
 * general report.
 */
export function buildFeedbackIssueUrl(scope: FeedbackScope, comment: string): string {
  const t = i18n.global.t
  const activityRows = scope === 'activity' ? activityDetailRows() : null
  const isActivity = activityRows !== null

  const label = isActivity ? feedbackState.activity!.label : t('feedback.scopeGeneral')
  const title = `[feedback] ${label}`.slice(0, 120)

  const lines: string[] = [t('feedback.issue.intro'), '']

  lines.push(`### ${t('feedback.issue.commentHeading')}`)
  lines.push(comment.trim() || t('feedback.issue.noComment'))
  lines.push('')

  if (activityRows) {
    lines.push(`### ${t('feedback.issue.activityHeading')}`)
    for (const row of activityRows) lines.push(`- **${row.label}:** ${row.value}`)
    lines.push('')
  }

  lines.push(`### ${t('feedback.issue.contextHeading')}`)
  lines.push(`- **Route:** \`${currentRoute() || '(unknown)'}\``)
  lines.push(`- **Reported:** ${new Date().toISOString()}`)
  for (const row of collectClientInfo()) lines.push(`- **${row.label}:** ${row.value}`)

  const body = lines.join('\n').slice(0, MAX_BODY_CHARS)
  const params = new URLSearchParams({ title, body, labels: 'feedback' })
  return `${REPO_ISSUES_URL}?${params}`
}
