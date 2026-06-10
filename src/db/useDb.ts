import { ref, onUnmounted, type Ref } from 'vue'
import { liveQuery } from 'dexie'
import { db } from './LugatchaDB'
import type { Word, WordProgress, LocationProgress } from './types'

/**
 * Wraps a Dexie liveQuery in a Vue ref.
 * Re-renders the component whenever the queried data changes in IndexedDB.
 */
export function useLiveQuery<T>(querier: () => T | Promise<T>, initialValue: T): Ref<T> {
  const result = ref(initialValue) as Ref<T>
  const subscription = liveQuery(querier).subscribe({
    next: (val) => {
      result.value = val
    },
    error: (err) => console.error('[useLiveQuery]', err),
  })
  onUnmounted(() => subscription.unsubscribe())
  return result
}

export function useWordsByTheme(theme: string): Ref<Word[]> {
  return useLiveQuery(() => db.words.where('theme').equals(theme).toArray(), [])
}

export function useWordProgress(wordId: string): Ref<WordProgress | undefined> {
  return useLiveQuery(() => db.wordProgress.get(wordId), undefined)
}

export function useLocationProgress(locationId: string): Ref<LocationProgress | undefined> {
  return useLiveQuery(() => db.locationProgress.get(locationId), undefined)
}

/** Returns true once 3 of the word's last 4 flashcard attempts are correct. */
export function isWordKnown(progress: WordProgress | undefined): boolean {
  if (!progress || progress.lastResults.length < 4) return false
  return progress.lastResults.slice(0, 4).filter(Boolean).length >= 3
}

export { db }
