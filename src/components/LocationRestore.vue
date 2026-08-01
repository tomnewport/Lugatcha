<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLiveQuery, db } from '@/db/useDb'
import type { Location, ExerciseType, Word } from '@/db/types'
import { isWordLearned } from '@/exercises/test'
import { EXERCISE_EMOJI, exerciseLabel, exerciseDescription } from '@/exercises/potluck'
import { useContentLang } from '@/i18n/content'
import { useProgressStore } from '@/stores/progress'

/**
 * Manual recovery for a learner who lost their progress and has no backup
 * (issue: a learner lost all their progress). Instead of re-grinding a place
 * they already know, they tick the words they still remember — restored as
 * "learned" — and tick the activities they've already done so those are marked
 * complete and skipped. Words already learned show as such and can't be
 * un-known here (mirroring the chest, which only forgets not-yet-learned words).
 */
const props = defineProps<{ location: Location }>()
const emit = defineEmits<{ done: []; back: [] }>()

const { name, gloss } = useContentLang()
const progressStore = useProgressStore()

const locationId = computed(() => props.location.id)

/** Activities a learner can declare "already done" — every practice type. */
const RESTORABLE_EXERCISES: ExerciseType[] = [
  'flashcards',
  'listening',
  'phrase-assembly',
  'roleplay',
  'storytime',
  'test',
]

const words = useLiveQuery<Word[]>(
  () => db.words.where('theme').equals(locationId.value).toArray(),
  [],
)

/** Words sorted essentials-first, then alphabetically by their Uzbek form. */
const sortedWords = computed(() =>
  [...words.value].sort(
    (a, b) => (a.level ?? 2) - (b.level ?? 2) || a.uzbek.localeCompare(b.uzbek),
  ),
)

// Which words are already learned, and which exercises already complete, so
// those render as done and don't need re-selecting.
const learnedIds = useLiveQuery(
  async () => {
    const all = await db.words.where('theme').equals(locationId.value).toArray()
    const progress = await db.wordProgress.bulkGet(all.map((w) => w.id))
    return new Set(all.filter((w, i) => isWordLearned(progress[i])).map((w) => w.id))
  },
  new Set<string>(),
)

const completedExercises = useLiveQuery(
  async () => {
    const p = await db.locationProgress.get(locationId.value)
    return new Set<ExerciseType>(p?.completedExercises ?? [])
  },
  new Set<ExerciseType>(),
)

// The learner's picks among not-yet-known words / not-yet-done activities.
const checkedWords = ref(new Set<string>())
const checkedExercises = ref(new Set<ExerciseType>())

function toggleWord(id: string) {
  if (learnedIds.value.has(id)) return
  const next = new Set(checkedWords.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  checkedWords.value = next
}

function toggleExercise(type: ExerciseType) {
  if (completedExercises.value.has(type)) return
  const next = new Set(checkedExercises.value)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  checkedExercises.value = next
}

/** Not-yet-learned words the learner could still tick. */
const selectableWords = computed(() => sortedWords.value.filter((w) => !learnedIds.value.has(w.id)))
const allSelectableChecked = computed(
  () =>
    selectableWords.value.length > 0 &&
    selectableWords.value.every((w) => checkedWords.value.has(w.id)),
)

function toggleAllWords() {
  checkedWords.value = allSelectableChecked.value
    ? new Set()
    : new Set(selectableWords.value.map((w) => w.id))
}

const nothingToApply = computed(
  () => checkedWords.value.size === 0 && checkedExercises.value.size === 0,
)

const applying = ref(false)

async function apply() {
  if (nothingToApply.value) return
  applying.value = true
  try {
    if (checkedWords.value.size) await progressStore.markWordsKnown([...checkedWords.value])
    if (checkedExercises.value.size)
      await progressStore.markExercisesDone(locationId.value, [...checkedExercises.value])
    emit('done')
  } finally {
    applying.value = false
  }
}

// A brand-new visit to this screen starts with nothing pre-ticked; if the
// location ever changes under us, reset the picks.
watch(locationId, () => {
  checkedWords.value = new Set()
  checkedExercises.value = new Set()
})
</script>

<template>
  <main class="restore">
    <button class="back-btn" :aria-label="$t('common.backToLocation')" type="button" @click="emit('back')">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ $t('common.back') }}
    </button>

    <header class="restore__header">
      <span class="restore__badge" aria-hidden="true">♻️</span>
      <h1 class="restore__title">{{ $t('restore.title') }}</h1>
      <p class="restore__sub">{{ name(location.name) }}</p>
      <p class="restore__intro">{{ $t('restore.intro') }}</p>
    </header>

    <section v-if="sortedWords.length" class="restore-card">
      <div class="restore-card__head">
        <h2 class="restore-card__title">{{ $t('restore.wordsTitle') }}</h2>
        <button
          v-if="selectableWords.length"
          class="restore-card__all"
          type="button"
          @click="toggleAllWords"
        >
          {{ allSelectableChecked ? $t('restore.clearAll') : $t('restore.selectAll') }}
        </button>
      </div>
      <p class="restore-card__desc">{{ $t('restore.wordsDesc') }}</p>
      <ul class="rows">
        <li v-for="w in sortedWords" :key="w.id">
          <label class="row" :class="{ 'row--locked': learnedIds.has(w.id) }">
            <input
              class="row__check"
              type="checkbox"
              :checked="learnedIds.has(w.id) || checkedWords.has(w.id)"
              :disabled="learnedIds.has(w.id)"
              @change="toggleWord(w.id)"
            />
            <span class="row__body">
              <span class="row__uz" lang="uz">{{ w.uzbek }}</span>
              <span class="row__gloss">{{ gloss(w) }}</span>
            </span>
            <span v-if="learnedIds.has(w.id)" class="row__badge">{{ $t('restore.known') }}</span>
          </label>
        </li>
      </ul>
    </section>

    <section class="restore-card">
      <h2 class="restore-card__title">{{ $t('restore.activitiesTitle') }}</h2>
      <p class="restore-card__desc">{{ $t('restore.activitiesDesc') }}</p>
      <ul class="rows">
        <li v-for="type in RESTORABLE_EXERCISES" :key="type">
          <label class="row" :class="{ 'row--locked': completedExercises.has(type) }">
            <input
              class="row__check"
              type="checkbox"
              :checked="completedExercises.has(type) || checkedExercises.has(type)"
              :disabled="completedExercises.has(type)"
              @change="toggleExercise(type)"
            />
            <span class="row__emoji" aria-hidden="true">{{ EXERCISE_EMOJI[type] }}</span>
            <span class="row__body">
              <span class="row__label">{{ exerciseLabel(type) }}</span>
              <span class="row__gloss">{{ exerciseDescription(type) }}</span>
            </span>
            <span v-if="completedExercises.has(type)" class="row__badge">{{ $t('restore.done') }}</span>
          </label>
        </li>
      </ul>
    </section>

    <div class="restore__apply">
      <button
        class="btn btn--primary"
        type="button"
        :disabled="nothingToApply || applying"
        @click="apply"
      >
        {{ applying ? $t('restore.applying') : $t('restore.apply') }}
      </button>
      <button class="btn btn--ghost" type="button" :disabled="applying" @click="emit('back')">
        {{ $t('common.cancel') }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.restore {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 1.25rem calc(2rem + env(safe-area-inset-bottom));
  background: var(--color-bg);
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  align-self: flex-start;
  padding: 0.4rem 0.75rem 0.4rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.restore__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.restore__badge {
  font-size: 1.9rem;
  line-height: 1;
}

.restore__title {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0.1rem 0 0;
}

.restore__sub {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-teal);
  margin: 0;
}

.restore__intro {
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--color-text-muted);
  margin: 0.3rem 0 0;
}

.restore-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 1rem 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.restore-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.restore-card__title {
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.restore-card__all {
  border: 0;
  background: none;
  color: var(--color-primary);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0.1rem 0.2rem;
  cursor: pointer;
  white-space: nowrap;
}

.restore-card__desc {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin: 0;
}

.rows {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.2rem 0 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.65rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  cursor: pointer;
}

.row--locked {
  cursor: default;
  opacity: 0.75;
  border-color: var(--color-gold);
  background: #fffdf4;
}

.row__check {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  accent-color: var(--color-teal);
}

.row__emoji {
  font-size: 1.25rem;
  line-height: 1;
  flex-shrink: 0;
}

.row__body {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  flex: 1;
  min-width: 0;
}

.row__uz {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.row__label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.row__gloss {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.row__badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-gold);
}

.restore__apply {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.3rem;
}
</style>
