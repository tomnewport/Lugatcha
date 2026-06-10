<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Word } from '@/db/types'
import { pickFlashcardWords } from '@/exercises/words'
import { shuffle } from '@/exercises/validate'
import { useProgressStore } from '@/stores/progress'
import AudioButton from '@/components/AudioButton.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

const progress = useProgressStore()

const words = ref<Word[]>([])
const leftOrder = ref<Word[]>([])
const rightOrder = ref<Word[]>([])
/** Sound-only mode: the Uzbek column plays audio instead of showing text. */
const soundMode = ref(false)
const loading = ref(true)

/** rightWordId keyed by leftWordId. */
const pairs = ref(new Map<string, string>())
const selectedLeft = ref<string | null>(null)
const checked = ref(false)
/** Per-left-word correctness after checking. */
const results = ref(new Map<string, boolean>())

onMounted(async () => {
  words.value = await pickFlashcardWords(props.locationId)
  leftOrder.value = shuffle(words.value)
  rightOrder.value = shuffle(words.value)
  soundMode.value = Math.random() < 0.4
  loading.value = false
})

const pairedRight = computed(() => new Set(pairs.value.values()))
const allPaired = computed(() => words.value.length > 0 && pairs.value.size === words.value.length)
const correctCount = computed(() => [...results.value.values()].filter(Boolean).length)

/** 1-based pair number for badge display. */
function pairNumber(leftId: string): number {
  return [...pairs.value.keys()].indexOf(leftId) + 1
}

function rightPairNumber(rightId: string): number {
  const entry = [...pairs.value.entries()].find(([, r]) => r === rightId)
  return entry ? pairNumber(entry[0]) : 0
}

function tapLeft(word: Word) {
  if (checked.value) return
  if (pairs.value.has(word.id)) {
    const next = new Map(pairs.value)
    next.delete(word.id)
    pairs.value = next
    return
  }
  selectedLeft.value = selectedLeft.value === word.id ? null : word.id
}

function tapRight(word: Word) {
  if (checked.value) return
  if (pairedRight.value.has(word.id)) {
    const entry = [...pairs.value.entries()].find(([, r]) => r === word.id)
    if (entry) {
      const next = new Map(pairs.value)
      next.delete(entry[0])
      pairs.value = next
    }
    return
  }
  if (!selectedLeft.value) return
  pairs.value = new Map(pairs.value).set(selectedLeft.value, word.id)
  selectedLeft.value = null
}

async function check() {
  const graded = new Map<string, boolean>()
  for (const [leftId, rightId] of pairs.value) {
    graded.set(leftId, leftId === rightId)
  }
  results.value = graded
  checked.value = true
  await Promise.all(
    [...graded.entries()].map(([wordId, correct]) => progress.recordMatchResult(wordId, correct)),
  )
}

function statusClass(leftId: string): string {
  if (!checked.value) return ''
  return results.value.get(leftId) ? 'card--correct' : 'card--wrong'
}

function rightStatusClass(rightId: string): string {
  if (!checked.value) return ''
  const entry = [...pairs.value.entries()].find(([, r]) => r === rightId)
  if (!entry) return ''
  return results.value.get(entry[0]) ? 'card--correct' : 'card--wrong'
}
</script>

<template>
  <div class="flashcards">
    <p class="flashcards__instruction">
      <template v-if="soundMode"
        >Listen, then pair each <strong>sound</strong> with its English meaning.</template
      >
      <template v-else>Pair each <strong>Uzbek</strong> word with its English meaning.</template>
    </p>

    <p v-if="loading" class="flashcards__loading" aria-live="polite">Loading cards…</p>

    <div v-else class="flashcards__columns">
      <div class="flashcards__column" aria-label="Uzbek words">
        <button
          v-for="word in leftOrder"
          :key="word.id"
          class="card"
          :class="[
            statusClass(word.id),
            {
              'card--selected': selectedLeft === word.id,
              'card--paired': pairs.has(word.id),
            },
          ]"
          type="button"
          @click="tapLeft(word)"
        >
          <AudioButton v-if="soundMode" :text="word.uzbek" />
          <span v-else lang="uz">{{ word.uzbek }}</span>
          <span v-if="pairs.has(word.id)" class="card__badge">{{ pairNumber(word.id) }}</span>
        </button>
      </div>

      <div class="flashcards__column" aria-label="English meanings">
        <button
          v-for="word in rightOrder"
          :key="word.id"
          class="card"
          :class="[rightStatusClass(word.id), { 'card--paired': pairedRight.has(word.id) }]"
          type="button"
          @click="tapRight(word)"
        >
          <span>{{ word.english }}</span>
          <span v-if="pairedRight.has(word.id)" class="card__badge">{{
            rightPairNumber(word.id)
          }}</span>
        </button>
      </div>
    </div>

    <p v-if="checked" class="flashcards__score" aria-live="polite">
      {{ correctCount }} of {{ words.length }} correct
      <template v-if="correctCount === words.length"> — ajoyib! 🎉</template>
    </p>

    <div class="flashcards__footer">
      <button
        v-if="!checked"
        class="btn btn--primary"
        type="button"
        :disabled="!allPaired"
        @click="check"
      >
        Check matches
      </button>
      <button v-else class="btn btn--primary" type="button" @click="emit('complete')">
        Continue
      </button>
    </div>
  </div>
</template>

<style scoped>
.flashcards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.flashcards__instruction {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.flashcards__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.flashcards__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.flashcards__column {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 56px;
  padding: 0.6rem 0.7rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.12s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
  text-align: center;
}

.card:hover {
  transform: translateY(-1px);
}

.card--selected {
  border-color: var(--color-primary);
  background: #f2f7fc;
}

.card--paired {
  border-color: var(--color-primary-light);
}

.card--correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
  animation: pop 0.3s ease;
}

.card--wrong {
  border-color: var(--color-terracotta);
  background: #fbf1ec;
  animation: shake 0.35s ease;
}

@keyframes pop {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}

.card__badge {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  background: var(--color-primary);
  border-radius: 50%;
}

.flashcards__score {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-primary);
  text-align: center;
  margin: 0;
}

.flashcards__footer {
  margin-top: auto;
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
}
</style>
