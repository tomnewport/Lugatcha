import { describe, it, expect, beforeEach } from 'vitest'
import {
  capturedErrors,
  captureError,
  dismissError,
  buildIssueUrl,
  APP_COMMIT,
} from '@/errors/reporter'

beforeEach(() => {
  capturedErrors.splice(0)
})

describe('captureError', () => {
  it('records message, source, and stack', () => {
    captureError('window', new Error('boom'))
    expect(capturedErrors).toHaveLength(1)
    expect(capturedErrors[0].message).toBe('boom')
    expect(capturedErrors[0].source).toBe('window')
    expect(capturedErrors[0].stack).toContain('boom')
    expect(capturedErrors[0].count).toBe(1)
  })

  it('wraps non-Error values', () => {
    captureError('promise', 'string rejection')
    expect(capturedErrors[0].message).toBe('string rejection')
  })

  it('appends context to the message', () => {
    captureError('vue', new Error('render fail'), 'during render')
    expect(capturedErrors[0].message).toBe('render fail — during render')
  })

  it('collapses identical errors into one toast with a count', () => {
    captureError('window', new Error('same'))
    captureError('window', new Error('same'))
    captureError('window', new Error('same'))
    expect(capturedErrors).toHaveLength(1)
    expect(capturedErrors[0].count).toBe(3)
  })

  it('caps the visible toasts, dropping the oldest', () => {
    for (let i = 0; i < 5; i++) captureError('window', new Error(`distinct ${i}`))
    expect(capturedErrors).toHaveLength(3)
    expect(capturedErrors[0].message).toBe('distinct 2')
    expect(capturedErrors[2].message).toBe('distinct 4')
  })
})

describe('dismissError', () => {
  it('removes only the dismissed toast', () => {
    captureError('window', new Error('first'))
    captureError('window', new Error('second'))
    dismissError(capturedErrors[0].id)
    expect(capturedErrors).toHaveLength(1)
    expect(capturedErrors[0].message).toBe('second')
  })
})

describe('buildIssueUrl', () => {
  it('opens a prefilled GitHub issue with the debugging details', () => {
    captureError('vue', new Error('toast me'), 'during render')
    const url = buildIssueUrl(capturedErrors[0])

    expect(url).toMatch(/^https:\/\/github\.com\/tomnewport\/Lugatcha\/issues\/new\?/)
    const params = new URL(url).searchParams
    expect(params.get('title')).toBe('[runtime error] toast me — during render')
    expect(params.get('labels')).toBe('bug')

    const body = params.get('body')!
    expect(body).toContain('**Message:** toast me — during render')
    expect(body).toContain(`**Commit:** \`${APP_COMMIT}\``)
    expect(body).toContain('**Stack trace:**')
    expect(body).toContain('**Time:**')
  })

  it('truncates enormous stacks so the URL stays usable', () => {
    const error = new Error('huge')
    error.stack = 'x'.repeat(20000)
    captureError('window', error)
    const body = new URL(buildIssueUrl(capturedErrors[0])).searchParams.get('body')!
    expect(body.length).toBeLessThanOrEqual(5500)
  })
})
