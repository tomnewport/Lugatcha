<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadGroup, learnedInGroup } from '@/db/groups'
import { useLiveQuery, db } from '@/db/useDb'
import type { VocabGroup, WordProgress } from '@/db/types'
import GroupReview from '@/components/school/GroupReview.vue'
import CountingQuiz from '@/components/school/CountingQuiz.vue'
import TestExercise from '@/components/exercise/TestExercise.vue'

const route = useRoute()
const router = useRouter()

const group = ref<VocabGroup | null>(null)
const missing = ref(false)
type Stage = 'menu' | 'review' | 'test'
const stage = ref<Stage>('menu')

onMounted(async () => {
  const found = await loadGroup(route.params.id as string)
  if (!found) {
    missing.value = true
    return
  }
  group.value = found
})

const allProgress = useLiveQuery(() => db.wordProgress.toArray(), [] as WordProgress[])
const progressMap = computed(() => {
  const map = new Map<string, WordProgress>()
  for (const p of allProgress.value) map.set(p.wordId, p)
  return map
})
const learnedCount = computed(() =>
  group.value ? learnedInGroup(group.value.words, progressMap.value) : 0,
)
const total = computed(() => group.value?.words.length ?? 0)

function back() {
  if (stage.value === 'menu') {
    router.push('/school')
  } else {
    stage.value = 'menu'
  }
}
</script>

<template>
  <div class="group">
    <header class="group-header">
      <button class="exit-btn" aria-label="Back" type="button" @click="back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="group-header__titles">
        <span class="group-header__school">Vocabulary set</span>
        <h1 class="group-header__title">{{ group?.title.en ?? 'Vocabulary' }}</h1>
      </div>
      <span v-if="group" class="group-header__icon" aria-hidden="true">{{ group.icon }}</span>
    </header>

    <div class="group-body">
      <p v-if="missing" class="group-loading">
        Set not found.
        <button class="btn btn--ghost" type="button" @click="router.push('/school')">
          Back to the School
        </button>
      </p>
      <p v-else-if="!group" class="group-loading" aria-live="polite">Loading…</p>

      <!-- Menu: pick review or test -->
      <template v-else-if="stage === 'menu'">
        <div class="hero">
          <span class="hero__icon" aria-hidden="true">{{ group.icon }}</span>
          <p class="hero__uz" lang="uz">{{ group.title.uz }}</p>
          <p class="hero__blurb">{{ group.blurb }}</p>
          <p class="hero__progress">{{ learnedCount }} of {{ total }} words learned</p>
        </div>

        <div class="actions">
          <button class="action action--review" type="button" @click="stage = 'review'">
            <span class="action__emoji" aria-hidden="true">📖</span>
            <span class="action__text">
              <span class="action__title">Review</span>
              <span class="action__sub">Read about them, then meet the words</span>
            </span>
          </button>
          <button class="action action--test" type="button" @click="stage = 'test'">
            <span class="action__emoji" aria-hidden="true">{{ group.quiz === 'counting' ? '🧮' : '🎯' }}</span>
            <span class="action__text">
              <span class="action__title">{{ group.quiz === 'counting' ? 'Counting quiz' : 'Test' }}</span>
              <span class="action__sub">{{
                group.quiz === 'counting'
                  ? 'Read, hear and type the numbers'
                  : 'Prove you know them'
              }}</span>
            </span>
          </button>
        </div>
      </template>

      <!-- Review: article + word gallery -->
      <GroupReview
        v-else-if="stage === 'review'"
        :group="group"
        @done="stage = 'test'"
      />

      <!-- Test: counting quiz for numbers, standard word test otherwise -->
      <CountingQuiz
        v-else-if="stage === 'test' && group.quiz === 'counting'"
        :words="group.words"
        @complete="stage = 'menu'"
      />
      <TestExercise
        v-else-if="stage === 'test'"
        :pool="group.words"
        @complete="stage = 'menu'"
      />
    </div>
  </div>
</template>

<style scoped>
.group {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  background: var(--color-surface);
  border-bottom: 1.5px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 5;
}

.exit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  flex-shrink: 0;
}

.exit-btn svg {
  width: 16px;
  height: 16px;
}

.group-header__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.group-header__school {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.group-header__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-teal);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-header__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.group-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1rem 2rem;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.group-loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-items: center;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  text-align: center;
  padding: 0.5rem 1rem 1.5rem;
}

.hero__icon {
  font-size: 3rem;
}

.hero__uz {
  font-size: 1rem;
  color: var(--color-text-muted);
  margin: 0;
}

.hero__blurb {
  font-size: 0.95rem;
  color: var(--color-text);
  margin: 0.3rem 0 0;
}

.hero__progress {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-gold);
  margin: 0.4rem 0 0;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.action {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.action:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.action--test {
  border-color: var(--color-teal);
}

.action__emoji {
  font-size: 1.7rem;
  flex-shrink: 0;
}

.action__text {
  display: flex;
  flex-direction: column;
}

.action__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.action__sub {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
