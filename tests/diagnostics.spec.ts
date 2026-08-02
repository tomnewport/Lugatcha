import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  detectEngine,
  gatherDiagnostics,
  formatDiagnosticsReport,
  recordAppOpen,
  isDiagnosticKey,
} from '@/db/diagnostics'
import { db } from '@/db/LugatchaDB'

// Real user-agent samples for the engines we distinguish on Android.
const UA = {
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/21.0 Chrome/110.0.5481.154 Mobile Safari/537.36',
  webview:
    'Mozilla/5.0 (Linux; Android 10; SM-G973F Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36',
  chrome:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  firefox:
    'Mozilla/5.0 (Android 13; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
}

/** Install a fake navigator with the given UA and optional storage behaviour. */
function stubNavigator(
  ua: string,
  storage?: { persisted?: boolean; usage?: number; quota?: number },
) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform: 'Linux armv8l',
    onLine: true,
    storage: storage
      ? {
          persisted: async () => storage.persisted ?? false,
          estimate: async () => ({ usage: storage.usage, quota: storage.quota }),
        }
      : undefined,
  })
}

beforeEach(() => {
  localStorage.clear()
  // The singleton db seeds via fetch on first access (populate). Diagnostics
  // never needs real content, so an empty manifest keeps the seed from throwing.
  vi.stubGlobal('fetch', async (url: string) => {
    const path = String(url).replace(/^.*\/data\//, '')
    const data = path === 'manifest.json' ? { words: [], stories: [], roleplay: [] } : undefined
    return { ok: data !== undefined, status: data ? 200 : 404, json: async () => data } as Response
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectEngine', () => {
  it('flags Samsung Internet', () => {
    const e = detectEngine(UA.samsung)
    expect(e.name).toBe('Samsung Internet')
    expect(e.isSamsungInternet).toBe(true)
    expect(e.isWebView).toBe(false)
  })

  it('flags an Android in-app WebView', () => {
    const e = detectEngine(UA.webview)
    expect(e.name).toBe('Android WebView (in-app browser)')
    expect(e.isWebView).toBe(true)
  })

  it('recognises plain Chrome, Safari and Firefox', () => {
    expect(detectEngine(UA.chrome).name).toBe('Chrome')
    expect(detectEngine(UA.chrome).isWebView).toBe(false)
    expect(detectEngine(UA.iosSafari).name).toBe('Safari')
    expect(detectEngine(UA.firefox).name).toBe('Firefox')
  })

  it('does not mistake Samsung Internet (which also carries Chrome/) for WebView', () => {
    expect(detectEngine(UA.samsung).isWebView).toBe(false)
  })
})

describe('isDiagnosticKey', () => {
  it('matches only the per-device diagnostic prefix', () => {
    expect(isDiagnosticKey('lugatcha.diag.firstOpenAt')).toBe(true)
    expect(isDiagnosticKey('lugatcha.settings')).toBe(false)
    expect(isDiagnosticKey('lugatcha.streakCount')).toBe(false)
  })
})

describe('recordAppOpen', () => {
  it('stamps first/last open, counts opens, and snapshots the engine', async () => {
    stubNavigator(UA.chrome)
    await recordAppOpen(1000)
    expect(localStorage.getItem('lugatcha.diag.firstOpenAt')).toBe('1000')
    expect(localStorage.getItem('lugatcha.diag.openCount')).toBe('1')
    expect(localStorage.getItem('lugatcha.diag.lastEngine')).toBe('Chrome')

    await recordAppOpen(2000)
    // First-open is stamped once; last-open and the counter move on.
    expect(localStorage.getItem('lugatcha.diag.firstOpenAt')).toBe('1000')
    expect(localStorage.getItem('lugatcha.diag.lastOpenAt')).toBe('2000')
    expect(localStorage.getItem('lugatcha.diag.openCount')).toBe('2')
  })

  it('records the persisted flag when the API is available', async () => {
    stubNavigator(UA.chrome, { persisted: true })
    await recordAppOpen(1000)
    expect(localStorage.getItem('lugatcha.diag.lastPersisted')).toBe('true')
  })
})

describe('gatherDiagnostics', () => {
  it('returns the four report groups and a findings array', async () => {
    stubNavigator(UA.chrome)
    const report = await gatherDiagnostics(5000)
    expect(report.generatedAt).toBe(new Date(5000).toISOString())
    expect(report.groups.map((g) => g.title)).toEqual([
      'Storage safety',
      'Browser & install',
      'Saved data on this device',
      'App & lifetime',
    ])
    expect(Array.isArray(report.findings)).toBe(true)
  })

  it('flags non-persistent storage as a high-severity likely cause', async () => {
    stubNavigator(UA.chrome, { persisted: false, usage: 1000, quota: 100000 })
    const report = await gatherDiagnostics()
    const high = report.findings.filter((f) => f.severity === 'high')
    expect(high.some((f) => /persistent storage is not granted/i.test(f.text))).toBe(true)
  })

  it('flags an in-app WebView as a high-severity likely cause', async () => {
    stubNavigator(UA.webview, { persisted: true })
    const report = await gatherDiagnostics()
    expect(report.findings.some((f) => f.severity === 'high' && /webview/i.test(f.text))).toBe(true)
  })

  it('flags an engine change since the previous open', async () => {
    localStorage.setItem('lugatcha.diag.lastEngine', 'Chrome')
    stubNavigator(UA.samsung, { persisted: true })
    const report = await gatherDiagnostics()
    expect(
      report.findings.some(
        (f) => f.severity === 'high' && /Samsung Internet/.test(f.text) && /Chrome/.test(f.text),
      ),
    ).toBe(true)
  })

  it('flags loaded content with zero progress rows', async () => {
    // Ensure the words table has content but progress tables are empty.
    await db.words.bulkPut([{ id: 'x', theme: 'core' } as never])
    stubNavigator(UA.chrome, { persisted: true })
    const report = await gatherDiagnostics()
    expect(report.findings.some((f) => /zero saved-progress rows/i.test(f.text))).toBe(true)
    await db.wordProgress.clear()
  })
})

describe('formatDiagnosticsReport', () => {
  it('renders findings and grouped rows as plain text', () => {
    const text = formatDiagnosticsReport({
      generatedAt: '2026-08-02T00:00:00.000Z',
      findings: [{ severity: 'high', text: 'Storage not persistent.' }],
      groups: [{ title: 'Storage safety', rows: [{ label: 'Persistent storage', value: 'NOT granted' }] }],
    })
    expect(text).toContain('Lugʻatcha diagnostics')
    expect(text).toContain('Likely causes:')
    expect(text).toContain('- [HIGH] Storage not persistent.')
    expect(text).toContain('## Storage safety')
    expect(text).toContain('- Persistent storage: NOT granted')
  })

  it('omits the causes section when there are no findings', () => {
    const text = formatDiagnosticsReport({
      generatedAt: '2026-08-02T00:00:00.000Z',
      findings: [],
      groups: [],
    })
    expect(text).not.toContain('Likely causes:')
  })
})
