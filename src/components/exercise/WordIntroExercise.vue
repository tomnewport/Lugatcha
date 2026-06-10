<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Word } from '@/db/types'
import { pickIntroWords } from '@/exercises/words'
import { useProgressStore } from '@/stores/progress'
import AudioButton from '@/components/AudioButton.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

const progress = useProgressStore()
const words = ref<Word[]>([])
const heard = ref(new Set<string>())
const loading = ref(true)

onMounted(async () => {
  words.value = await pickIntroWords(props.locationId)
  loading.value = false
})

const allHeard = computed(
  () => words.value.length > 0 && words.value.every((w) => heard.value.has(w.id)),
)

function markHeard(wordId: string) {
  heard.value = new Set(heard.value).add(wordId)
}

async function finish() {
  await progress.markWordsSeen(words.value.map((w) => w.id))
  emit('complete')
}
</script>

<template>
  <div class="intro">
    <p class="intro__instruction">
      Tap <strong>each speaker</strong> to hear the word. All five unlock Continue.
    </p>

    <p v-if="loading" class="intro__loading" aria-live="polite">Loading words…</p>

    <ul v-else class="intro__cards">
      <li
        v-for="word in words"
        :key="word.id"
        class="word-card"
        :class="{ 'word-card--heard': heard.has(word.id) }"
      >
        <AudioButton :text="word.uzbek" :audio-id="word.id" @played="markHeard(word.id)" />
        <div class="word-card__text">
          <span class="word-card__uzbek" lang="uz">{{ word.uzbek }}</span>
          <span class="word-card__english">{{ word.english }}</span>
          <span v-if="word.usageNotes" class="word-card__notes">{{ word.usageNotes }}</span>
        </div>
        <svg
          v-if="heard.has(word.id)"
          class="word-card__check"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M2.5 8l4 4 7-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </li>
    </ul>
  </div>

  <div class="intro__footer">
    <button class="btn btn--primary" type="button" :disabled="!allHeard" @click="finish">
      Continue
    </button>
  </div>
</template>

<style scoped>
.intro {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.intro__instruction {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.intro__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.intro__cards {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.word-card {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.8rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease;
}

.word-card--heard {
  border-color: var(--color-teal);
}

.word-card__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.word-card__uzbek {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary);
}

.word-card__english {
  font-size: 0.9rem;
  color: var(--color-text);
}

.word-card__notes {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.word-card__check {
  width: 18px;
  height: 18px;
  color: var(--color-teal);
  flex-shrink: 0;
}

.intro__footer {
  margin-top: 1.25rem;
  display: flex;
  flex-direction: column;
}
</style>
