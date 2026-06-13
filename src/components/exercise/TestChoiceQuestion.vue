<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Word } from '@/db/types'
import { speakUzbek } from '@/audio/audio'
import { useContentLang } from '@/i18n/content'
import AudioButton from '@/components/AudioButton.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'

const props = defineProps<{
  word: Word
  /** 'listen' plays the audio prompt; 'read' shows the Uzbek text. */
  mode: 'listen' | 'read'
  options: string[]
}>()

const emit = defineEmits<{ answered: [correct: boolean] }>()
const { gloss } = useContentLang()

/** The correct answer in the learner's base language. */
const answer = computed(() => gloss(props.word))

const query = ref('')
const picked = ref<string | null>(null)
const answered = computed(() => picked.value !== null)

onMounted(() => {
  if (props.mode === 'listen') speakUzbek(props.word.uzbek)
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q ? props.options.filter((o) => o.toLowerCase().includes(q)) : props.options
  return list
})

function choose(option: string) {
  if (answered.value) return
  picked.value = option
  emit('answered', option === answer.value)
}

/** After answering, collapse to just the chosen answer and (if wrong) the right one. */
const revealed = computed(() =>
  answered.value ? [...new Set([picked.value!, answer.value])] : filtered.value,
)

function optionClass(option: string): string {
  if (!answered.value) return ''
  if (option === answer.value) return 'option--correct'
  if (option === picked.value) return 'option--wrong'
  return 'option--muted'
}
</script>

<template>
  <div class="choice-q">
    <p class="choice-q__instruction">
      {{ mode === 'listen' ? $t('exercise.choice.listenChoose') : $t('exercise.choice.choose') }}
    </p>

    <div class="choice-q__prompt">
      <AudioButton v-if="mode === 'listen'" :text="word.uzbek" large :label="$t('audio.playSound')" />
      <p v-else class="choice-q__uzbek">
        <UzbekSentence :uzbek="word.uzbek" />
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

    <p v-if="answered" class="choice-q__result" :class="picked === answer ? 'is-right' : 'is-wrong'">
      {{ picked === answer ? $t('exercise.choice.correct') : $t('exercise.choice.answer', { answer }) }}
    </p>

    <div class="choice-q__options" role="listbox">
      <button
        v-for="option in revealed"
        :key="option"
        class="option"
        :class="optionClass(option)"
        type="button"
        :disabled="answered"
        @click="choose(option)"
      >
        {{ option }}
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
