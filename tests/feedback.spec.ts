import { describe, it, expect, beforeEach } from 'vitest'
import {
  feedbackState,
  setActivityContext,
  noteUzbekViewed,
} from '@/feedback/activityContext'
import {
  buildFeedbackIssueUrl,
  activityDetailRows,
  hasActivityContext,
} from '@/feedback/issue'
import { APP_COMMIT } from '@/errors/reporter'

beforeEach(() => {
  setActivityContext(null)
})

describe('activity context', () => {
  it('starts empty', () => {
    expect(hasActivityContext()).toBe(false)
    expect(activityDetailRows()).toBeNull()
  })

  it('exposes the activity label and details as rows', () => {
    setActivityContext({
      label: 'Learn Vocabulary · Bozor',
      details: [{ label: 'Location', value: 'Bozor' }],
    })
    expect(hasActivityContext()).toBe(true)
    const rows = activityDetailRows()!
    expect(rows[0]).toEqual({ label: 'Activity', value: 'Learn Vocabulary · Bozor' })
    expect(rows).toContainEqual({ label: 'Location', value: 'Bozor' })
  })

  it('attaches the last Uzbek word/phrase in view', () => {
    setActivityContext({ label: 'Listening · Bozor', details: [] })
    noteUzbekViewed('Assalomu alaykum')
    expect(activityDetailRows()).toContainEqual({
      label: 'Word/phrase in view',
      value: 'Assalomu alaykum',
    })
  })

  it('clears the word in view when the activity changes', () => {
    setActivityContext({ label: 'A', details: [] })
    noteUzbekViewed('non')
    expect(feedbackState.lastUzbek).toBe('non')
    setActivityContext({ label: 'B', details: [] })
    expect(feedbackState.lastUzbek).toBeNull()
  })
})

describe('buildFeedbackIssueUrl', () => {
  it('builds a general report with a comment and environment block', () => {
    const url = buildFeedbackIssueUrl('general', 'Buttons overlap on my phone')

    expect(url).toMatch(/^https:\/\/github\.com\/tomnewport\/Lugatcha\/issues\/new\?/)
    const params = new URL(url).searchParams
    expect(params.get('labels')).toBe('feedback')
    expect(params.get('title')).toContain('[feedback]')

    const body = params.get('body')!
    expect(body).toContain('Buttons overlap on my phone')
    expect(body).toContain('### Environment')
    expect(body).toContain(`- **Commit:** ${APP_COMMIT}`)
    // No activity context set: the activity block is omitted.
    expect(body).not.toContain('### Activity')
  })

  it('includes the activity block when scoped to the current activity', () => {
    setActivityContext({
      label: 'Learn Vocabulary · Bozor',
      details: [{ label: 'Location', value: 'Bozor' }],
    })
    noteUzbekViewed('olma')

    const body = new URL(buildFeedbackIssueUrl('activity', 'The audio sounds wrong'))
      .searchParams.get('body')!

    expect(body).toContain('### Activity')
    expect(body).toContain('- **Activity:** Learn Vocabulary · Bozor')
    expect(body).toContain('- **Location:** Bozor')
    expect(body).toContain('- **Word/phrase in view:** olma')
    expect(body).toContain('The audio sounds wrong')
  })

  it('degrades an activity-scoped report to general when no context is set', () => {
    const body = new URL(buildFeedbackIssueUrl('activity', 'hi')).searchParams.get('body')!
    expect(body).not.toContain('### Activity')
  })

  it('falls back to a placeholder when no comment is given', () => {
    const body = new URL(buildFeedbackIssueUrl('general', '   ')).searchParams.get('body')!
    expect(body).toContain('no comment provided')
  })
})
