/**
 * Activity context for the in-app "Raise an issue" form.
 *
 * A single page can describe what the learner is doing right now — the activity
 * they're in and any useful specifics (location, exercise, lesson…). The
 * RaiseIssue form reads this so a report can be scoped to "the specific activity
 * I'm doing" and pre-filled with those details, instead of only "the app in
 * general".
 *
 * On top of that, {@link noteUzbekViewed} records the last Uzbek word or phrase
 * the learner interacted with (every audio playback goes through it). That gives
 * "the word you're looking at" across every exercise without each one having to
 * wire it up by hand — it's reset whenever the activity changes.
 */
import { reactive, watch, onScopeDispose } from 'vue'
import type { Ref } from 'vue'

export interface ActivityDetail {
  label: string
  value: string
}

export interface ActivityContext {
  /** Human-readable name of the activity, e.g. "Learn Vocabulary · Bozor". */
  label: string
  /** Key/value specifics carried into a scoped issue report. */
  details: ActivityDetail[]
}

interface FeedbackState {
  activity: ActivityContext | null
  /** Last Uzbek word/phrase seen or heard, cleared when the activity changes. */
  lastUzbek: string | null
}

export const feedbackState = reactive<FeedbackState>({
  activity: null,
  lastUzbek: null,
})

/**
 * Set (or clear) the current activity context. Replacing the activity clears the
 * "word in view" so a stale word from a previous screen never leaks into a new
 * report.
 */
export function setActivityContext(activity: ActivityContext | null): void {
  if (activity?.label !== feedbackState.activity?.label) {
    feedbackState.lastUzbek = null
  }
  feedbackState.activity = activity
}

/** Record the last Uzbek text the learner interacted with (word or phrase). */
export function noteUzbekViewed(text: string): void {
  const trimmed = text?.trim()
  if (trimmed) feedbackState.lastUzbek = trimmed
}

/**
 * Composable: keep the activity context in sync with a reactive source for the
 * lifetime of the calling component, clearing it automatically on unmount.
 *
 * ```ts
 * useActivityContext(() => ({ label: 'Learn Vocabulary', details: [...] }))
 * ```
 */
export function useActivityContext(source: Ref<ActivityContext | null> | (() => ActivityContext | null)): void {
  watch(
    source,
    (ctx) => setActivityContext(ctx),
    { immediate: true },
  )
  onScopeDispose(() => {
    setActivityContext(null)
  })
}
