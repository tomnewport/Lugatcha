import type { Lesson, LessonMeta, LessonProgress } from './types'

const base = import.meta.env.BASE_URL
let metaCache: LessonMeta[] | null = null
const lessonCache = new Map<string, Lesson>()

export async function loadLessonIndex(): Promise<LessonMeta[]> {
  if (metaCache) return metaCache
  const res = await fetch(`${base}data/lessons/index.json`)
  if (!res.ok) throw new Error(`Failed to fetch lesson index (${res.status})`)
  metaCache = (await res.json()) as LessonMeta[]
  metaCache.sort((a, b) => a.order - b.order)
  return metaCache
}

export async function loadLesson(id: string): Promise<Lesson | undefined> {
  const cached = lessonCache.get(id)
  if (cached) return cached
  const res = await fetch(`${base}data/lessons/${id}.json`)
  if (!res.ok) return undefined
  const lesson = (await res.json()) as Lesson
  lessonCache.set(id, lesson)
  return lesson
}

export type LessonState = 'done' | 'available' | 'locked'

/** A lesson unlocks once every prerequisite lesson is completed. */
export function lessonState(meta: LessonMeta, progress: Map<string, LessonProgress>): LessonState {
  if (progress.get(meta.id)?.completedAt) return 'done'
  const blocked = (meta.prerequisites ?? []).some((id) => !progress.get(id)?.completedAt)
  return blocked ? 'locked' : 'available'
}

/** English titles of the prerequisites still standing in the way. */
export function missingPrerequisites(
  meta: LessonMeta,
  all: LessonMeta[],
  progress: Map<string, LessonProgress>,
): string[] {
  return (meta.prerequisites ?? [])
    .filter((id) => !progress.get(id)?.completedAt)
    .map((id) => all.find((m) => m.id === id)?.title.en ?? id)
}
