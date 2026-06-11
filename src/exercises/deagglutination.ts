import { shallowRef } from 'vue'
import { loadLessonIndex, loadLesson } from '@/db/lessons'
import { normalizeToken } from '@/exercises/validate'

export interface Breakdown {
  breakdown: string[]
  gloss: string[]
}

export const breakdownIndex = shallowRef<Map<string, Breakdown>>(new Map())

let _loading: Promise<void> | null = null

export function ensureBreakdownIndex(): Promise<void> {
  if (_loading) return _loading
  _loading = (async () => {
    const metas = await loadLessonIndex()
    const lessons = await Promise.all(metas.map((m) => loadLesson(m.id)))
    const map = new Map<string, Breakdown>()
    for (const lesson of lessons) {
      if (!lesson) continue
      for (const section of lesson.sections) {
        for (const ex of section.examples ?? []) {
          if (ex.breakdown?.length && ex.gloss?.length) {
            map.set(normalizeToken(ex.uzbek), {
              breakdown: ex.breakdown,
              gloss: ex.gloss,
            })
          }
        }
      }
    }
    breakdownIndex.value = map
  })()
  return _loading
}
