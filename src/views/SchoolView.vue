<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLiveQuery, db } from '@/db/useDb'
import { loadLessonIndex, lessonState, missingPrerequisites } from '@/db/lessons'
import { loadGroupIndex } from '@/db/groups'
import { isWordLearned } from '@/exercises/test'
import type { LessonMeta, LessonProgress, VocabGroupMeta } from '@/db/types'

const router = useRouter()
const lessons = ref<LessonMeta[]>([])
const groups = ref<VocabGroupMeta[]>([])

onMounted(async () => {
  lessons.value = await loadLessonIndex()
  groups.value = await loadGroupIndex()
})

const allProgress = useLiveQuery(() => db.lessonProgress.toArray(), [] as LessonProgress[])
const progressMap = computed(() => {
  const map = new Map<string, LessonProgress>()
  for (const p of allProgress.value) map.set(p.lessonId, p)
  return map
})

/** Per-group { learned, total } word counts for the vocab-set cards (#62). */
const groupStats = useLiveQuery(
  async () => {
    const [words, wordProgress] = await Promise.all([
      db.words.toArray(),
      db.wordProgress.toArray(),
    ])
    const prog = new Map(wordProgress.map((p) => [p.wordId, p]))
    const stats = new Map<string, { learned: number; total: number }>()
    for (const w of words) {
      if (!w.group) continue
      const s = stats.get(w.group) ?? { learned: 0, total: 0 }
      s.total++
      if (isWordLearned(prog.get(w.id))) s.learned++
      stats.set(w.group, s)
    }
    return stats
  },
  new Map<string, { learned: number; total: number }>(),
)

function groupProgress(id: string): string {
  const s = groupStats.value.get(id)
  if (!s || s.total === 0) return ''
  return `${s.learned}/${s.total}`
}

const doneCount = computed(
  () => lessons.value.filter((m) => lessonState(m, progressMap.value) === 'done').length,
)

function open(meta: LessonMeta) {
  if (lessonState(meta, progressMap.value) === 'locked') return
  router.push(`/school/${meta.id}`)
}

function prereqHint(meta: LessonMeta): string {
  const missing = missingPrerequisites(meta, lessons.value, progressMap.value)
  return `Finish ${missing.join(' and ')} first`
}
</script>

<template>
  <main class="school">
    <button class="back-btn" aria-label="Back to city map" type="button" @click="router.push('/')">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      City
    </button>

    <header class="school-header">
      <h1 class="school-header__title">🏫 Language School</h1>
      <p class="school-header__subtitle" lang="uz">Til maktabi</p>
      <p class="school-header__blurb">
        The big ideas that make Uzbek click — short lessons, each with a little game.
      </p>
      <p v-if="lessons.length" class="school-header__progress">
        {{ doneCount }} of {{ lessons.length }} lessons mastered
      </p>
    </header>

    <ol v-if="lessons.length" class="lesson-list">
      <li v-for="meta in lessons" :key="meta.id">
        <button
          class="lesson-card"
          :class="`lesson-card--${lessonState(meta, progressMap)}`"
          type="button"
          :disabled="lessonState(meta, progressMap) === 'locked'"
          @click="open(meta)"
        >
          <span class="lesson-card__marker" aria-hidden="true">
            <svg
              v-if="lessonState(meta, progressMap) === 'done'"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M2.5 8l4 4 7-7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg
              v-else-if="lessonState(meta, progressMap) === 'locked'"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <rect x="2" y="7" width="12" height="8" rx="2" />
              <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke-linecap="round" />
            </svg>
            <span v-else>{{ meta.order }}</span>
          </span>
          <span class="lesson-card__text">
            <span class="lesson-card__title">{{ meta.title.en }}</span>
            <span class="lesson-card__blurb">{{ meta.blurb }}</span>
            <span v-if="lessonState(meta, progressMap) === 'locked'" class="lesson-card__hint">
              {{ prereqHint(meta) }}
            </span>
          </span>
          <span class="lesson-card__minutes">~{{ meta.estimatedMinutes }} min</span>
        </button>
      </li>
    </ol>

    <p v-else class="school-loading" aria-live="polite">Loading lessons…</p>

    <section v-if="groups.length" class="groups">
      <h2 class="groups__heading">Vocabulary sets</h2>
      <p class="groups__intro">
        Learn a whole family of words at once — read the story, then take the test.
      </p>
      <ul class="group-list">
        <li v-for="group in groups" :key="group.id">
          <button
            class="group-card"
            type="button"
            @click="router.push(`/school/group/${group.id}`)"
          >
            <span class="group-card__icon" aria-hidden="true">{{ group.icon }}</span>
            <span class="group-card__text">
              <span class="group-card__title">{{ group.title.en }}</span>
              <span class="group-card__blurb">{{ group.blurb }}</span>
            </span>
            <span v-if="groupProgress(group.id)" class="group-card__count">
              {{ groupProgress(group.id) }}
            </span>
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.school {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1rem 1.25rem 2rem;
  background: var(--color-bg);
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem 0.4rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
  align-self: flex-start;
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.school-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.school-header__title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--color-teal);
  margin: 0;
}

.school-header__subtitle {
  font-size: 0.95rem;
  color: var(--color-text-muted);
  margin: 0;
}

.school-header__blurb {
  font-size: 0.88rem;
  color: var(--color-text);
  margin: 0.4rem 0 0;
}

.school-header__progress {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-gold);
  margin: 0.2rem 0 0;
}

.lesson-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.lesson-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.lesson-card:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.lesson-card--locked {
  opacity: 0.55;
  cursor: default;
  background: var(--color-bg);
}

.lesson-card--done {
  border-color: var(--color-teal);
}

.lesson-card__marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  font-size: 0.9rem;
  font-weight: 700;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  color: var(--color-text-muted);
}

.lesson-card--done .lesson-card__marker {
  background: var(--color-teal);
  border-color: var(--color-teal);
  color: #fff;
}

.lesson-card__marker svg {
  width: 14px;
  height: 14px;
}

.lesson-card__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.lesson-card__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.lesson-card__blurb {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.lesson-card__hint {
  font-size: 0.72rem;
  font-style: italic;
  color: var(--color-terracotta);
  margin-top: 2px;
}

.lesson-card__minutes {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.school-loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.groups__heading {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--color-teal);
  margin: 0;
}

.groups__intro {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin: 0 0 0.4rem;
}

.group-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.group-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.group-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.group-card__icon {
  font-size: 1.7rem;
  flex-shrink: 0;
}

.group-card__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.group-card__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.group-card__blurb {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.group-card__count {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-gold);
}
</style>
