import { describe, it, expect } from 'vitest'
import { toCapturedError } from '@/errors/reporter'
import { buildFatalScreenHtml } from '@/errors/fatalScreen'

describe('toCapturedError', () => {
  it('normalises an Error with message, source, and stack', () => {
    const entry = toCapturedError('bootstrap', new Error('boom'), 'while starting')
    expect(entry.source).toBe('bootstrap')
    expect(entry.message).toBe('boom — while starting')
    expect(entry.stack).toContain('boom')
    expect(entry.count).toBe(1)
  })

  it('wraps non-Error values', () => {
    expect(toCapturedError('router', 'string failure').message).toBe('string failure')
  })
})

describe('buildFatalScreenHtml', () => {
  it('shows the message, stack, and a prefilled report link', () => {
    const entry = toCapturedError('bootstrap', new Error('kaput'))
    const html = buildFatalScreenHtml(entry)
    expect(html).toContain('kaput')
    expect(html).toContain('Report')
    expect(html).toContain('https://github.com/tomnewport/Lugatcha/issues/new')
  })

  it('escapes HTML so an error message cannot break the markup', () => {
    const entry = toCapturedError('vue', new Error('<img src=x onerror=alert(1)>'))
    const html = buildFatalScreenHtml(entry)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('falls back gracefully when there is no stack', () => {
    const entry = toCapturedError('window', 'no stack here')
    entry.stack = undefined
    expect(buildFatalScreenHtml(entry)).toContain('(no stack available)')
  })
})
