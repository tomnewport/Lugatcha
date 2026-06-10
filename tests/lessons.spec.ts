import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { lessonState, missingPrerequisites } from '@/db/lessons'
import type { Lesson, LessonMeta, LessonProgress } from '@/db/types'

const LESSONS_DIR = join(__dirname, '..', 'public', 'data', 'lessons')
const index: LessonMeta[] = JSON.parse(readFileSync(join(LESSONS_DIR, 'index.json'), 'utf8'))
const lessons: Lesson[] = index.map((meta) =>
  JSON.parse(readFileSync(join(LESSONS_DIR, `${meta.id}.json`), 'utf8')),
)

describe('lesson data integrity', () => {
  it('index covers every lesson file exactly once', () => {
    const files = readdirSync(LESSONS_DIR).filter((f) => f !== 'index.json')
    expect(new Set(index.map((m) => `${m.id}.json`))).toEqual(new Set(files))
    expect(new Set(index.map((m) => m.id)).size).toBe(index.length)
    expect(new Set(index.map((m) => m.order)).size).toBe(index.length)
  })

  it('prerequisites reference real lessons and contain no cycles', () => {
    const ids = new Set(index.map((m) => m.id))
    for (const meta of index) {
      for (const prereq of meta.prerequisites ?? []) {
        expect(ids.has(prereq), `${meta.id} requires unknown lesson ${prereq}`).toBe(true)
      }
    }
    // Depth-first from each node; a revisit on the current path is a cycle
    const visit = (id: string, path: string[]) => {
      expect(path.includes(id), `prerequisite cycle: ${[...path, id].join(' -> ')}`).toBe(false)
      const meta = index.find((m) => m.id === id)
      for (const prereq of meta?.prerequisites ?? []) visit(prereq, [...path, id])
    }
    for (const meta of index) visit(meta.id, [])
  })

  it.each(lessons.map((l) => [l.id, l] as const))('%s is well-formed', (_id, lesson) => {
    expect(lesson.sections.length).toBeGreaterThan(0)
    expect(lesson.exercises.length).toBeGreaterThan(0)
    expect(lesson.wrapUp.length).toBeGreaterThan(0)

    const exerciseIds = lesson.exercises.map((e) => e.id)
    expect(new Set(exerciseIds).size).toBe(exerciseIds.length)

    for (const section of lesson.sections) {
      expect(section.body.length).toBeGreaterThan(0)
      for (const example of section.examples ?? []) {
        if (example.gloss) {
          expect(example.gloss.length, `${lesson.id}: gloss misaligned for ${example.uzbek}`).toBe(
            example.breakdown?.length,
          )
        }
      }
    }

    for (const exercise of lesson.exercises) {
      if (exercise.engine === 'choice') {
        const options = exercise.options ?? []
        expect(options.length, `${exercise.id} needs 2+ options`).toBeGreaterThanOrEqual(2)
        expect(
          options.filter((o) => o.correct).length,
          `${exercise.id} needs exactly one correct option`,
        ).toBe(1)
      } else {
        expect(exercise.engine).toBe('build')
        expect(exercise.tokens?.length, `${exercise.id} needs tokens`).toBeGreaterThan(0)
        // Decoys must not duplicate answer tokens or the bank becomes ambiguous
        const tokenSet = new Set(exercise.tokens)
        for (const decoy of exercise.decoys ?? []) {
          expect(tokenSet.has(decoy), `${exercise.id}: decoy "${decoy}" is an answer token`).toBe(
            false,
          )
        }
      }
    }
  })
})

describe('lessonState', () => {
  const metas = [
    { id: 'a', order: 1, title: { en: 'A' }, blurb: '', estimatedMinutes: 2 },
    { id: 'b', order: 2, title: { en: 'B' }, blurb: '', estimatedMinutes: 2, prerequisites: ['a'] },
  ] satisfies LessonMeta[]

  const progressOf = (...done: string[]) =>
    new Map<string, LessonProgress>(
      done.map((id) => [id, { lessonId: id, completedAt: 1, exercisesPassed: [] }]),
    )

  it('locks lessons behind incomplete prerequisites', () => {
    expect(lessonState(metas[0], progressOf())).toBe('available')
    expect(lessonState(metas[1], progressOf())).toBe('locked')
    expect(missingPrerequisites(metas[1], metas, progressOf())).toEqual(['A'])
  })

  it('unlocks once prerequisites complete, and reports done', () => {
    expect(lessonState(metas[1], progressOf('a'))).toBe('available')
    expect(lessonState(metas[1], progressOf('a', 'b'))).toBe('done')
  })
})
