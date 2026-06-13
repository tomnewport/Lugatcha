<script setup lang="ts">
import { ref, computed } from 'vue'
import { db, useLiveQuery } from '@/db/useDb'
import { isWordLearned, isWordPartiallyLearned, passedTypes } from '@/exercises/test'
import { TEST_QUESTION_TYPES } from '@/db/types'
import { useContentLang } from '@/i18n/content'
import AudioButton from '@/components/AudioButton.vue'

interface ChestWord {
  id: string
  uzbek: string
  english: string
  russian?: string
  passed: number
  learnedAt: number
}

const { gloss } = useContentLang()
const open = ref(false)

/** Learned and partially-learned words, joined with their text, for the chest. */
const chest = useLiveQuery<{ learned: ChestWord[]; partial: ChestWord[] }>(async () => {
  const progress = await db.wordProgress.toArray()
  const relevant = progress.filter((p) => passedTypes(p).length > 0)
  const words = await db.words.bulkGet(relevant.map((p) => p.wordId))
  const byId = new Map(words.filter(Boolean).map((w) => [w!.id, w!]))

  const learned: ChestWord[] = []
  const partial: ChestWord[] = []
  for (const p of relevant) {
    const word = byId.get(p.wordId)
    if (!word) continue
    const entry: ChestWord = {
      id: word.id,
      uzbek: word.uzbek,
      english: word.english,
      russian: word.russian,
      passed: passedTypes(p).length,
      learnedAt: p.learnedAt ?? 0,
    }
    if (isWordLearned(p)) learned.push(entry)
    else if (isWordPartiallyLearned(p)) partial.push(entry)
  }
  learned.sort((a, b) => b.learnedAt - a.learnedAt)
  partial.sort((a, b) => b.passed - a.passed)
  return { learned, partial }
}, { learned: [], partial: [] })

const learnedCount = computed(() => chest.value.learned.length)
const totalTypes = TEST_QUESTION_TYPES.length
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

          <p v-if="learnedCount === 0 && chest.partial.length === 0" class="chest-panel__empty">
            {{ $t('chest.empty') }}
          </p>

          <section v-if="chest.learned.length" class="chest-section">
            <h3 class="chest-section__head">{{ $t('chest.learnedSection', { count: chest.learned.length }) }}</h3>
            <ul class="chest-list">
              <li v-for="w in chest.learned" :key="w.id" class="chest-item">
                <AudioButton :text="w.uzbek" />
                <span class="chest-item__uz" lang="uz">{{ w.uzbek }}</span>
                <span class="chest-item__en">{{ gloss(w) }}</span>
                <span class="chest-item__badge chest-item__badge--learned" aria-hidden="true">✓</span>
              </li>
            </ul>
          </section>

          <section v-if="chest.partial.length" class="chest-section">
            <h3 class="chest-section__head">{{ $t('chest.partialSection', { count: chest.partial.length }) }}</h3>
            <ul class="chest-list">
              <li v-for="w in chest.partial" :key="w.id" class="chest-item">
                <AudioButton :text="w.uzbek" />
                <span class="chest-item__uz" lang="uz">{{ w.uzbek }}</span>
                <span class="chest-item__en">{{ gloss(w) }}</span>
                <span class="chest-item__badge">{{ w.passed }}/{{ totalTypes }}</span>
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

.chest-fade-enter-active,
.chest-fade-leave-active {
  transition: opacity 0.2s ease;
}

.chest-fade-enter-from,
.chest-fade-leave-to {
  opacity: 0;
}
</style>
