<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { db, useLiveQuery } from '@/db/useDb'
import { isWordLearned, passedTypes } from '@/exercises/test'
import { overdueRatio, reviewStatus, relativeDue, type ReviewStage } from '@/exercises/spacedRepetition'
import { TEST_QUESTION_TYPES } from '@/db/types'
import { useProgressStore } from '@/stores/progress'
import { useContentLang } from '@/i18n/content'
import AudioButton from '@/components/AudioButton.vue'
import CyrillicSub from '@/components/CyrillicSub.vue'

/** A fully-learned word, with its spaced-repetition snapshot for the retention view. */
interface LearnedWord {
  id: string
  uzbek: string
  english: string
  russian?: string
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

/** A word met but not yet fully learned — resettable from the Learning tab. */
interface LearningWord {
  id: string
  uzbek: string
  english: string
  russian?: string
  /** Skills passed so far (0 = only just met by browsing). */
  passed: number
}

const { gloss } = useContentLang()
const { t } = useI18n()
const progress = useProgressStore()
const open = ref(false)
type Tab = 'learned' | 'learning'
const tab = ref<Tab>('learned')
/** The Learning row currently asking to confirm a reset (one at a time). */
const confirmingId = ref<string | null>(null)

/**
 * Every word the learner has met, split into two views:
 *  - `learned`: fully learned words, joined with a spaced-repetition snapshot
 *    and ordered so words due for review surface first (most overdue leading),
 *    then by soonest upcoming review — the "how retention is going" view.
 *  - `learning`: words met but not yet learned (including ones only just met by
 *    browsing a vocabulary set, with no skills passed). Just-met words lead so
 *    the ones swept in by accident are easy to find and reset.
 */
const chest = useLiveQuery<{
  learned: LearnedWord[]
  learning: LearningWord[]
  dueCount: number
}>(async () => {
  const now = Date.now()
  const allProgress = await db.wordProgress.toArray()
  // A word belongs in the chest once met (seen, or with any skill passed).
  const relevant = allProgress.filter((p) => p.seenAt != null || passedTypes(p).length > 0)
  const words = await db.words.bulkGet(relevant.map((p) => p.wordId))
  const byId = new Map(words.filter(Boolean).map((w) => [w!.id, w!]))

  const learned: LearnedWord[] = []
  const learning: LearningWord[] = []
  let dueCount = 0
  for (const p of relevant) {
    const word = byId.get(p.wordId)
    if (!word) continue
    if (isWordLearned(p)) {
      const status = reviewStatus(p.review, now)
      const { value, unit } = relativeDue(status.dueInMs)
      learned.push({
        id: word.id,
        uzbek: word.uzbek,
        english: word.english,
        russian: word.russian,
        stage: status.stage,
        strength: status.strength,
        due: status.due,
        dueValue: value,
        dueUnit: unit,
        dueAt: p.review?.dueAt ?? now,
        overdue: overdueRatio(p.review, now),
      })
      if (status.due) dueCount++
    } else {
      learning.push({
        id: word.id,
        uzbek: word.uzbek,
        english: word.english,
        russian: word.russian,
        passed: passedTypes(p).length,
      })
    }
  }

  // Due words first (most overdue leading), then upcoming by soonest review.
  learned.sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1
    if (a.due) return b.overdue - a.overdue
    return a.dueAt - b.dueAt
  })
  // Just-met words (0 skills) first, then alphabetically within each rung.
  learning.sort((a, b) => a.passed - b.passed || a.uzbek.localeCompare(b.uzbek))

  return { learned, learning, dueCount }
}, { learned: [], learning: [], dueCount: 0 })

const learnedCount = computed(() => chest.value.learned.length)
const learningCount = computed(() => chest.value.learning.length)
const totalTypes = TEST_QUESTION_TYPES.length

// Closing the panel, or leaving the Learning tab, drops any pending confirm.
watch([open, tab], () => {
  confirmingId.value = null
})

/** Short due label for a row: "Review now" or "in 3d". */
function dueLabel(w: LearnedWord): string {
  if (w.due) return t('chest.review.dueNow')
  return t('chest.review.dueIn', { time: `${w.dueValue}${t(`chest.review.units.${w.dueUnit}`)}` })
}

async function forget(id: string) {
  await progress.forgetWord(id)
  confirmingId.value = null
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

          <p v-if="learnedCount === 0 && learningCount === 0" class="chest-panel__empty">
            {{ $t('chest.empty') }}
          </p>

          <template v-else>
            <div class="chest-tabs" role="tablist">
              <button
                class="chest-tab"
                :class="{ 'chest-tab--active': tab === 'learned' }"
                type="button"
                role="tab"
                :aria-selected="tab === 'learned'"
                @click="tab = 'learned'"
              >
                {{ $t('chest.tabs.learned') }} <span class="chest-tab__count">{{ learnedCount }}</span>
              </button>
              <button
                class="chest-tab"
                :class="{ 'chest-tab--active': tab === 'learning' }"
                type="button"
                role="tab"
                :aria-selected="tab === 'learning'"
                @click="tab = 'learning'"
              >
                {{ $t('chest.tabs.learning') }} <span class="chest-tab__count">{{ learningCount }}</span>
              </button>
            </div>

            <!-- Learned: the retention / spaced-repetition view. -->
            <template v-if="tab === 'learned'">
              <p v-if="chest.dueCount > 0" class="chest-panel__summary">
                <span class="chest-panel__summary-dot" aria-hidden="true" />
                {{ $t('chest.reviewSummary', { count: chest.dueCount }, chest.dueCount) }}
              </p>
              <p v-if="learnedCount === 0" class="chest-panel__empty">{{ $t('chest.empty') }}</p>
              <section v-else class="chest-section">
                <ul class="chest-list">
                  <li v-for="w in chest.learned" :key="w.id" class="chest-item">
                    <AudioButton :text="w.uzbek" />
                    <span class="chest-item__main">
                      <span class="chest-item__top">
                        <span class="chest-item__word">
                          <span class="chest-item__uz" lang="uz">{{ w.uzbek }}</span>
                          <CyrillicSub :latin="w.uzbek" />
                        </span>
                        <span class="chest-item__en">{{ gloss(w) }}</span>
                        <span
                          class="chest-item__badge chest-item__badge--learned"
                          :aria-label="$t('chest.learnedBadge')"
                        >✓</span>
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
            </template>

            <!-- Learning: words met but not yet learned, each resettable. -->
            <template v-else>
              <p v-if="learningCount === 0" class="chest-panel__empty">{{ $t('chest.learning.empty') }}</p>
              <template v-else>
                <p class="chest-panel__intro">{{ $t('chest.learning.intro') }}</p>
                <section class="chest-section">
                  <ul class="chest-list">
                    <li v-for="w in chest.learning" :key="w.id" class="chest-item">
                      <AudioButton :text="w.uzbek" />
                      <span class="chest-item__main">
                        <span class="chest-item__top">
                          <span class="chest-item__word">
                            <span class="chest-item__uz" lang="uz">{{ w.uzbek }}</span>
                            <CyrillicSub :latin="w.uzbek" />
                          </span>
                          <span class="chest-item__en">{{ gloss(w) }}</span>
                          <span v-if="w.passed > 0" class="chest-item__badge">{{ w.passed }}/{{ totalTypes }}</span>
                          <span v-else class="chest-item__badge chest-item__badge--met">{{ $t('chest.learning.metBadge') }}</span>
                        </span>
                      </span>
                      <!-- Reset control, with an inline confirm to avoid mis-taps. -->
                      <span v-if="confirmingId === w.id" class="chest-item__confirm">
                        <span class="chest-item__confirm-q">{{ $t('chest.learning.confirm') }}</span>
                        <button class="chest-item__confirm-yes" type="button" @click="forget(w.id)">
                          {{ $t('chest.learning.confirmYes') }}
                        </button>
                        <button class="chest-item__confirm-no" type="button" @click="confirmingId = null">
                          {{ $t('chest.learning.confirmNo') }}
                        </button>
                      </span>
                      <button
                        v-else
                        class="chest-item__forget"
                        type="button"
                        :aria-label="$t('chest.learning.forgetAria', { word: w.uzbek })"
                        @click="confirmingId = w.id"
                      >
                        {{ $t('chest.learning.forget') }}
                      </button>
                    </li>
                  </ul>
                </section>
              </template>
            </template>
          </template>
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

.chest-tabs {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.chest-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border: 1.5px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 700;
}

.chest-tab--active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-bg);
}

.chest-tab__count {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--color-border);
  color: var(--color-text-muted);
}

.chest-tab--active .chest-tab__count {
  background: var(--color-primary);
  color: #fff;
}

.chest-panel__intro {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  line-height: 1.4;
  margin: 0 0.25rem 0.6rem;
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

.chest-item__badge--met {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  opacity: 0.75;
}

/* Reset control on Learning rows */
.chest-item__forget {
  flex-shrink: 0;
  padding: 0.3rem 0.6rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.chest-item__forget:hover {
  border-color: var(--color-terracotta);
  color: var(--color-terracotta);
}

.chest-item__confirm {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.chest-item__confirm-q {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.chest-item__confirm-yes,
.chest-item__confirm-no {
  padding: 0.3rem 0.55rem;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 700;
  border: 1.5px solid var(--color-border);
}

.chest-item__confirm-yes {
  background: var(--color-terracotta);
  border-color: var(--color-terracotta);
  color: #fff;
}

.chest-item__confirm-no {
  background: var(--color-surface);
  color: var(--color-text-muted);
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
