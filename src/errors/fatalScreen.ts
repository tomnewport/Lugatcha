/**
 * Startup fatal-error screen (issue: app fails silently on launch).
 *
 * The toast pipeline in reporter.ts only surfaces errors *after* the Vue app has
 * mounted and <ErrorToasts> is on screen. When the app dies during bootstrap —
 * or the very first navigation aborts and leaves <RouterView> empty — the user
 * is left staring at a blank page with nothing to report.
 *
 * This module renders a prominent, full-screen panel straight into the DOM with
 * no dependency on Vue, the router, Pinia, or i18n having initialised, so it
 * shows the actual error (message + stack + build) even when everything else is
 * broken. Text is bilingual because the interface language may not be chosen yet.
 */
import { buildIssueUrl, toCapturedError, APP_COMMIT, APP_BUILD_TIME } from './reporter'
import type { CapturedError } from './reporter'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pure markup builder, kept separate from DOM insertion so it stays testable. */
export function buildFatalScreenHtml(entry: CapturedError): string {
  const meta = [
    `Commit: ${APP_COMMIT}`,
    APP_BUILD_TIME ? `Built: ${APP_BUILD_TIME}` : '',
    `Source: ${entry.source}`,
    entry.route ? `Route: ${entry.route}` : '',
    `Time: ${entry.time}`,
  ]
    .filter(Boolean)
    .join('\n')

  return `
    <div style="max-width:640px;margin:0 auto;">
      <h1 style="font-size:1.35rem;margin:0 0 .25rem;color:#B4451F;">
        Lugʻatcha couldn’t start
      </h1>
      <p style="margin:0 0 1rem;color:#555;font-size:.95rem;">
        Lugʻatcha не смогла запуститься. The details below are here so the problem
        can be fixed — tap “Report” to file them, or “Reload” to try again.
      </p>
      <p style="font-weight:700;margin:0 0 .5rem;word-break:break-word;">
        ${escapeHtml(entry.message)}
      </p>
      <pre style="background:#1e1e1e;color:#e6e6e6;padding:.75rem;border-radius:8px;overflow:auto;max-height:40vh;font-size:.78rem;white-space:pre-wrap;word-break:break-word;">${escapeHtml(entry.stack ?? '(no stack available)')}</pre>
      <pre style="color:#666;font-size:.72rem;white-space:pre-wrap;margin:.5rem 0 1rem;">${escapeHtml(meta)}</pre>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
        <a href="${escapeHtml(buildIssueUrl(entry))}" target="_blank" rel="noopener noreferrer"
           style="background:#B4451F;color:#fff;text-decoration:none;font-weight:700;padding:.55rem 1.1rem;border-radius:999px;">
          Report
        </a>
        <a href="${escapeHtml(typeof location !== 'undefined' ? location.href : '#')}"
           style="border:1.5px solid #ccc;color:#333;text-decoration:none;font-weight:700;padding:.55rem 1.1rem;border-radius:999px;">
          Reload
        </a>
      </div>
    </div>
  `
}

let shown = false

/**
 * Render the fatal screen once. Safe to call from anywhere and never throws:
 * a failure while reporting the failure must not make things worse.
 */
export function showFatalError(source: string, error: unknown, context?: string): void {
  try {
    if (shown || typeof document === 'undefined') return
    shown = true

    const entry = toCapturedError(source, error, context)
    // Mirror it to the console too, in case the screen itself can't paint.
    console.error('[fatal]', entry.message, error)

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'alert')
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'background:#F5F0E8',
      'color:#2B2B2B',
      'overflow:auto',
      'padding:calc(1.5rem + env(safe-area-inset-top)) 1.25rem 1.5rem',
      'box-sizing:border-box',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    ].join(';')
    overlay.innerHTML = buildFatalScreenHtml(entry)

    document.body.appendChild(overlay)
  } catch {
    // Last resort: at least don't crash the crash handler.
  }
}
