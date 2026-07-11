<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Word } from '@/db/types'
import { speakUzbek } from '@/audio/audio'
import { latinToCyrillic } from '@/exercises/transliterate'
import { isCloseEnough } from '@/exercises/test'
import { useContentLang } from '@/i18n/content'
import AudioButton from '@/components/AudioButton.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'

const props = defineProps<{
  word: Word
  /**
   * 'listen' plays the audio prompt; 'read' shows the Latin spelling;
   * 'read-cyrillic' shows the Cyrillic spelling.
   */
  mode: 'listen' | 'read' | 'read-cyrillic'
  options: Word[]
}>()

const emit = defineEmits<{ answered: [correct: boolean] }>()
const { gloss } = useContentLang()

/** The correct answer in the learner's base language. */
const answer = computed(() => gloss(props.word))

/** Cyrillic spelling for the sight-Cyrillic prompt, transliterated if absent. */
const cyrillic = computed(() => props.word.cyrillic || latinToCyrillic(props.word.uzbek))

const instruction = computed(() => {
  if (props.mode === 'listen') return 'exercise.choice.listenChoose'
  if (props.mode === 'read-cyrillic') return 'exercise.choice.chooseCyrillic'
  return 'exercise.choice.choose'
})

const query = ref('')
const picked = ref<Word | null>(null)
const answered = computed(() => picked.value !== null)

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * 'right' exact meaning; 'close' a curated near-synonym we accept (e.g. "Hello"
 * for the formal "Assalomu alaykum") while still showing the precise answer;
 * 'wrong' otherwise. Both 'right' and 'close' pass the question.
 */
type Verdict = 'right' | 'close' | 'wrong'
const verdict = computed<Verdict>(() => {
  if (picked.value === null) return 'wrong'
  if (eq(gloss(picked.value), answer.value)) return 'right'
  if (isCloseEnough(props.word, picked.value)) return 'close'
  return 'wrong'
})

onMounted(() => {
  if (props.mode === 'listen') speakUzbek(props.word.uzbek)
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.options.filter((o) => gloss(o).toLowerCase().includes(q)) : props.options
})

function choose(option: Word) {
  if (answered.value) return
  picked.value = option
  const right = eq(gloss(option), answer.value)
  emit('answered', right || isCloseEnough(props.word, option))
}

/**
 * After answering, collapse to just the chosen answer when it was exactly
 * right; otherwise show it alongside the precise answer — including the
 * close-enough case, where the note points to the exact meaning.
 */
const revealed = computed(() => {
  if (!answered.value) return filtered.value
  return verdict.value === 'right' ? [picked.value!] : [picked.value!, props.word]
})

function optionClass(option: Word): string {
  if (!answered.value) return ''
  if (eq(gloss(option), answer.value)) return 'option--correct'
  if (option.id === picked.value?.id) return verdict.value === 'close' ? 'option--close' : 'option--wrong'
  return 'option--muted'
}
</script>

<template>
  <div class="choice-q">
    <p class="choice-q__instruction">{{ $t(instruction) }}</p>

    <div class="choice-q__prompt">
      <AudioButton v-if="mode === 'listen'" :text="word.uzbek" large :label="$t('audio.playSound')" />
      <p v-else-if="mode === 'read-cyrillic'" class="choice-q__uzbek" lang="uz">{{ cyrillic }}</p>
      <p v-else class="choice-q__uzbek">
        <UzbekSentence :uzbek="word.uzbek" no-hint />
      </p>
    </div>

    <input
      v-if="!answered"
      v-model="query"
      class="choice-q__search"
      type="text"
      inputmode="search"
      :placeholder="$t('exercise.choice.searchPlaceholder')"
      :aria-label="$t('exercise.choice.searchLabel')"
    />

    <p v-if="answered" class="choice-q__result" :class="`is-${verdict}`">
      <template v-if="verdict === 'right'">{{ $t('exercise.choice.correct') }}</template>
      <template v-else-if="verdict === 'close'">{{ $t('exercise.choice.closeEnough', { answer }) }}</template>
      <template v-else>{{ $t('exercise.choice.answer', { answer }) }}</template>
    </p>

    <div class="choice-q__options" role="listbox">
      <button
        v-for="option in revealed"
        :key="option.id"
        class="option"
        :class="optionClass(option)"
        type="button"
        :disabled="answered"
        @click="choose(option)"
      >
        {{ gloss(option) }}
      </button>
      <p v-if="!answered && filtered.length === 0" class="choice-q__empty">{{ $t('exercise.choice.noMatches') }}</p>
    </div>
  </div>
</template>

<style scoped>
.choice-q {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  flex: 1;
  min-height: 0;
}

.choice-q__instruction {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  margin: 0;
}

.choice-q__prompt {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 56px;
}

.choice-q__uzbek {
  display: flex;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.choice-q__search {
  width: 100%;
  padding: 0.6rem 0.8rem;
  font-size: 1rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
}

.choice-q__search:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(27 79 138 / 0.16);
}

.choice-q__result {
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
  margin: 0;
}

.choice-q__result.is-right {
  color: var(--color-teal);
}

.choice-q__result.is-close {
  color: var(--color-gold);
}

.choice-q__result.is-wrong {
  color: var(--color-terracotta);
}

.choice-q__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  max-height: 46vh;
  padding: 2px;
}

.option {
  text-align: left;
  padding: 0.6rem 0.8rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.option:not(:disabled):hover {
  border-color: var(--color-primary);
}

.option--correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
  color: var(--color-teal);
}

.option--wrong {
  border-color: var(--color-terracotta);
  background: #fbf1ec;
  color: var(--color-terracotta);
}

.option--close {
  border-color: var(--color-gold);
  background: #fbf7ec;
  color: var(--color-gold);
}

.option--muted {
  opacity: 0.45;
}

.choice-q__empty {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0.5rem 0;
}
</style>
