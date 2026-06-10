<script setup lang="ts">
import { ref } from 'vue'
import { useWordsByTheme } from '@/db/useDb'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

const words = useWordsByTheme(props.locationId)
const seen = ref(new Set<string>())

function markSeen(wordId: string) {
  seen.value.add(wordId)
}

const canContinue = () => words.value.length > 0 && seen.value.size >= Math.min(5, words.value.length)
</script>

<template>
  <div class="intro-exercise">
    <h2 class="exercise-title">Word Introduction</h2>
    <p class="exercise-desc">Tap each card to hear the word. Listen to all of them to continue.</p>

    <div v-if="words.length" class="word-list">
      <div
        v-for="word in words.slice(0, 5)"
        :key="word.id"
        class="word-card"
        :class="{ 'word-card--seen': seen.has(word.id) }"
        @click="markSeen(word.id)"
      >
        <span class="word-card__uzbek">{{ word.uzbek }}</span>
        <span class="word-card__english">{{ word.english }}</span>
        <div class="word-card__audio-btn" aria-label="Play audio">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M7 4l8 6-8 6V4z" />
          </svg>
        </div>
      </div>
    </div>
    <p v-else class="no-words">No words loaded yet for this location.</p>

    <button
      class="continue-btn"
      :disabled="!canContinue()"
      @click="emit('complete')"
    >
      Continue
    </button>
  </div>
</template>

<style scoped>
.intro-exercise {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.exercise-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.exercise-desc {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: 0;
}

.word-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
}

.word-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  box-shadow: var(--shadow-sm);
}

.word-card:hover {
  border-color: var(--color-primary-light);
}

.word-card--seen {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, white);
}

.word-card__uzbek {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary);
  flex: 1;
}

.word-card__english {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  flex: 1;
  text-align: right;
}

.word-card__audio-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.word-card--seen .word-card__audio-btn {
  background: var(--color-teal);
}

.word-card__audio-btn svg {
  width: 14px;
  height: 14px;
  margin-left: 1px;
}

.no-words {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.continue-btn {
  margin-top: auto;
  padding: 0.85rem;
  background: var(--color-primary);
  color: white;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  width: 100%;
  transition: opacity 0.15s;
}

.continue-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.continue-btn:not(:disabled):hover {
  opacity: 0.88;
}
</style>
