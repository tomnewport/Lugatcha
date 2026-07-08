<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { db, useLiveQuery } from '@/db/useDb'
import { isWordLearned, isWordPartiallyLearned, passedTypes } from '@/exercises/test'
import { overdueRatio, reviewStatus, relativeDue, type ReviewStage } from '@/exercises/spacedRepetition'
import { TEST_QUESTION_TYPES } from '@/db/types'
import { useContentLang } from '@/i18n/content'
import AudioButton from '@/components/AudioButton.vue'
import CyrillicSub from '@/components/CyrillicSub.vue'

interface ChestWord {
  id: string
  uzbek: string
  english: string
  russian?: string
  passed: number
  learned: boolean
  /** Spaced-repetition snapshot, precomputed so rows don't re-read the clock. */
  stage: ReviewStage
  strength: number
  due: boolean
  dueValue: number
  dueUnit: 'm' | 'h' | 'd' | 'w'
  /** Sort keys: when the next review lands, and how overdue it already is. */
  dueAt: number
  overdue: number
}

const { gloss } = useContentLang()
const { t } = useI18n()
const open = ref(false)

/**
 * Every word the learner has started (one or more test types passed), joined
 * with its text and a spaced-repetition snapshot. A single list — no learned /
 * in-progress split — ordered so words due for review surface first (most
 * overdue leading), then by soonest upcoming review, so the chest doubles as an
 * at-a-glance "how retention is going" view.
 */
const chest = useLiveQuery<{ items: ChestWord[]; learnedCount: number; dueCount: number }>(async () => {
  const now = Date.now()
  const progress = await db.wordProgress.toArray()
  const relevant = progress.filter((p) => passedTypes(p).length > 0)
  const words = await db.words.bulkGet(relevant.map((p) => p.wordId))
  const byId = new Map(words.filter(Boolean).map((w) => [w!.id, w!]))

  const items: ChestWord[] = []
  let learnedCount = 0
  let dueCount = 0
  for (const p of relevant) {
    const word = byId.get(p.wordId)
    if (!word) continue
    const learned = isWordLearned(p)
    const partial = isWordPartiallyLearned(p)
    if (!learned && !partial) continue
    const status = reviewStatus(p.review, now)
    const { value, unit } = relativeDue(status.dueInMs)
    items.push({
      id: word.id,
      uzbek: word.uzbek,
      english: word.english,
      russian: word.russian,
      passed: passedTypes(p).length,
      learned,
      stage: status.stage,
      strength: status.strength,
      due: status.due,
      dueValue: value,
      dueUnit: unit,
      dueAt: p.review?.dueAt ?? now,
      overdue: overdueRatio(p.review, now),
    })
    if (learned) learnedCount++
    if (status.due) dueCount++
  }

  // Due words first (most overdue leading), then upcoming by soonest review.
  items.sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1
    if (a.due) return b.overdue - a.overdue
    return a.dueAt - b.dueAt
  })

  return { items, learnedCount, dueCount }
}, { items: [], learnedCount: 0, dueCount: 0 })

const learnedCount = computed(() => chest.value.learnedCount)
const totalTypes = TEST_QUESTION_TYPES.length

/** Short due label for a row: "Review now" or "in 3d". */
function dueLabel(w: ChestWord): string {
  if (w.due) return t('chest.review.dueNow')
  return t('chest.review.dueIn', { time: `${w.dueValue}${t(`chest.review.units.${w.dueUnit}`)}` })
}
</script>

<template>
  <button
    class="chest-btn"
    type="button"
    :aria-label="$t('chest.openAria', { count: learnedCount })"
    @click="open = true"
  >
    <span class="chest-btn__icon" aria-hidden="true">🧰</span>
    <span class="chest-btn__count">{{ learnedCount }}</span>
  </button>

  <Teleport to="body">
    <Transition name="chest-fade">
      <div v-if="open" class="chest-overlay" @click.self="open = false">
        <div class="chest-panel" role="dialog" :aria-label="$t('chest.dialogLabel')">
          <header class="chest-panel__head">
            <h2 class="chest-panel__title">{{ $t('chest.title') }}</h2>
            <button class="chest-panel__close" type="button" :aria-label="$t('common.close')" @click="open = false">
              ✕
            </button>
          </header>

          <p v-if="chest.items.length === 0" class="chest-panel__empty">
            {{ $t('chest.empty') }}
          </p>

          <p v-else-if="chest.dueCount > 0" class="chest-panel__summary">
            <span class="chest-panel__summary-dot" aria-hidden="true" />
            {{ $t('chest.reviewSummary', { count: chest.dueCount }, chest.dueCount) }}
          </p>

          <section v-if="chest.items.length" class="chest-section">
            <ul class="chest-list">
              <li v-for="w in chest.items" :key="w.id" class="chest-item">
                <AudioButton :text="w.uzbek" />
                <span class="chest-item__main">
                  <span class="chest-item__top">
                    <span class="chest-item__word">
                      <span class="chest-item__uz" lang="uz">{{ w.uzbek }}</span>
                      <CyrillicSub :latin="w.uzbek" />
                    </span>
                    <span class="chest-item__en">{{ gloss(w) }}</span>
                    <span
                      v-if="w.learned"
                      class="chest-item__badge chest-item__badge--learned"
                      :aria-label="$t('chest.learnedBadge')"
                    >✓</span>
                    <span v-else class="chest-item__badge">{{ w.passed }}/{{ totalTypes }}</span>
                  </span>
                  <!-- Second line: concise spaced-repetition status. -->
                  <span class="chest-item__srs">
                    <span
                      class="chest-item__meter"
                      role="img"
                      :aria-label="$t('chest.review.strengthAria', { stage: $t(`chest.review.stages.${w.stage}`) })"
                    >
                      <span
                        v-for="n in 4"
                        :key="n"
                        class="chest-item__pip"
                        :class="{ 'chest-item__pip--on': n <= w.strength }"
                      />
                    </span>
                    <span class="chest-item__stage">{{ $t(`chest.review.stages.${w.stage}`) }}</span>
                    <span
                      class="chest-item__due"
                      :class="{ 'chest-item__due--now': w.due }"
                    >{{ dueLabel(w) }}</span>
                  </span>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.chest-btn {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem 0.3rem 0.45rem;
  border: 1.5px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.chest-btn:hover {
  box-shadow: var(--shadow-md);
}

.chest-btn__icon {
  font-size: 1.15rem;
  line-height: 1;
}

.chest-btn__count {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--color-primary);
  min-width: 0.8rem;
  text-align: center;
}

.chest-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 0.4);
  padding: 0;
}

.chest-panel {
  width: 100%;
  max-width: 520px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-lg);
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
}

.chest-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.chest-panel__title {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.chest-panel__close {
  width: 32px;
  height: 32px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.chest-panel__empty {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  line-height: 1.5;
  padding: 1rem 0.25rem 1.5rem;
}

.chest-section {
  overflow-y: auto;
}

.chest-section__head {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0.75rem 0 0.4rem;
}

.chest-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chest-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.chest-item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.chest-item__top {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.chest-item__word {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.chest-item__uz {
  font-weight: 700;
  color: var(--color-primary);
}

.chest-item__en {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chest-item__badge {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.chest-item__badge--learned {
  color: var(--color-teal);
}

/* Second line: spaced-repetition status */
.chest-item__srs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.chest-item__meter {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

.chest-item__pip {
  width: 12px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
}

.chest-item__pip--on {
  background: var(--color-teal);
}

.chest-item__stage {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.chest-item__due {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chest-item__due::before {
  content: '·';
  margin-right: 0.4rem;
  color: var(--color-border);
}

.chest-item__due--now {
  color: var(--color-terracotta);
  font-weight: 700;
}

/* Review summary line under the title */
.chest-panel__summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-terracotta);
}

.chest-panel__summary-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-terracotta);
  flex-shrink: 0;
}

.chest-fade-enter-active,
.chest-fade-leave-active {
  transition: opacity 0.2s ease;
}

.chest-fade-enter-from,
.chest-fade-leave-to {
  opacity: 0;
}
</style>
