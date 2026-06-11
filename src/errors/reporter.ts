/**
 * Global runtime-error capture (issue #31).
 *
 * Errors from Vue components, uncaught exceptions, and unhandled promise
 * rejections land in a reactive list that ErrorToasts.vue renders. Each toast
 * offers a "Report" link that opens a prefilled GitHub issue with the
 * message, stack, commit hash, route, and environment details.
 */
import { reactive } from 'vue'
import type { App } from 'vue'

const REPO_ISSUES_URL = 'https://github.com/tomnewport/Lugatcha/issues/new'
const MAX_TOASTS = 3
/** GitHub truncates very long URLs; keep the prefilled body comfortably under. */
const MAX_BODY_CHARS = 5500

// Injected by vite define; guarded so plain node (vitest) can import this too
export const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev'
export const APP_BUILD_TIME = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : ''

export interface CapturedError {
  id: number
  source: string // 'vue' | 'window' | 'promise'
  message: string
  stack?: string
  route: string
  time: string // ISO
  count: number // identical errors collapse into one toast
}

export const capturedErrors = reactive<CapturedError[]>([])

let nextId = 1

export function captureError(source: string, error: unknown, context?: string): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const message = [err.message || 'Unknown error', context].filter(Boolean).join(' — ')

    const existing = capturedErrors.find((e) => e.message === message)
    if (existing) {
      existing.count++
      existing.time = new Date().toISOString()
      return
    }

    capturedErrors.push({
      id: nextId++,
      source,
      message,
      stack: err.stack,
      route: typeof location !== 'undefined' ? location.hash || location.pathname : '',
      time: new Date().toISOString(),
      count: 1,
    })
    if (capturedErrors.length > MAX_TOASTS) capturedErrors.shift()
  } catch {
    // Never let the error reporter itself take the app down
  }
}

export function dismissError(id: number): void {
  const index = capturedErrors.findIndex((e) => e.id === id)
  if (index !== -1) capturedErrors.splice(index, 1)
}

/** Prefilled new-issue URL carrying everything useful for debugging. */
export function buildIssueUrl(entry: CapturedError): string {
  const title = `[runtime error] ${entry.message.slice(0, 80)}`
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  const body = [
    'Automatically reported from the in-app error toast.',
    '',
    `**Message:** ${entry.message}`,
    `**Source:** ${entry.source}`,
    `**Route:** \`${entry.route || '(unknown)'}\``,
    `**Time:** ${entry.time}`,
    `**Commit:** \`${APP_COMMIT}\``,
    APP_BUILD_TIME ? `**Built:** ${APP_BUILD_TIME}` : '',
    `**Occurrences this session:** ${entry.count}`,
    `**User agent:** ${userAgent}`,
    '',
    '**Stack trace:**',
    '```',
    entry.stack ?? '(no stack available)',
    '```',
  ]
    .filter((line) => line !== '')
    .join('\n')
    .slice(0, MAX_BODY_CHARS)

  const params = new URLSearchParams({ title, body, labels: 'bug' })
  return `${REPO_ISSUES_URL}?${params}`
}

/** Hook every error pathway: Vue, uncaught exceptions, unhandled rejections. */
export function installErrorHandlers(app: App): void {
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[vue error]', err)
    captureError('vue', err, info ? `during ${info}` : undefined)
  }

  window.addEventListener('error', (event) => {
    captureError('window', event.error ?? event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    captureError('promise', event.reason)
  })
}
