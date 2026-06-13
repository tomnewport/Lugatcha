<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LessonExercise } from '@/db/types'
import { shuffle } from '@/exercises/validate'
import AudioButton from '@/components/AudioButton.vue'
import { playChime } from '@/audio/audio'
import { useContentLang } from '@/i18n/content'

const props = defineProps<{ exercise: LessonExercise }>()
const emit = defineEmits<{ done: [passed: boolean] }>()
const { pick: pickText } = useContentLang()

const options = ref(shuffle(props.exercise.options ?? []))
const picked = ref<number | null>(null)
const wrongPicks = ref(new Set<number>())
const revealed = ref(false)

const correctIndex = computed(() => options.value.findIndex((o) => o.correct))
const solved = computed(
  () => revealed.value || (picked.value !== null && options.value[picked.value]?.correct),
)
const feedback = computed(() => {
  if (picked.value === null) return null
  const opt = options.value[picked.value]
  return opt?.explain ? pickText(opt.explain, opt.explainRu) : null
})

function pick(i: number) {
  if (solved.value) return
  picked.value = i
  if (options.value[i].correct) {
    playChime()
  } else {
    wrongPicks.value = new Set(wrongPicks.value).add(i)
    if (wrongPicks.value.size >= 2) revealed.value = true
  }
}

function optionClass(i: number): string {
  if (revealed.value && i === correctIndex.value) return 'option--correct'
  if (picked.value === i) return options.value[i].correct ? 'option--correct' : 'option--wrong'
  if (wrongPicks.value.has(i)) return 'option--wrong'
  return ''
}

function finish() {
  emit('done', !revealed.value)
}
</script>

<template>
  <div class="choice">
    <p class="choice__instruction">{{ pickText(exercise.instruction, exercise.instructionRu) }}</p>

    <div v-if="exercise.prompt || exercise.promptUzbek" class="choice__prompt">
      <p v-if="exercise.prompt" class="choice__prompt-text">{{ pickText(exercise.prompt, exercise.promptRu) }}</p>
      <AudioButton
        v-if="exercise.promptUzbek"
        :text="exercise.promptUzbek"
        large
        :label="$t('audio.playSound')"
      />
    </div>

    <div class="choice__options">
      <button
        v-for="(option, i) in options"
        :key="option.text"
        class="option"
        :class="optionClass(i)"
        type="button"
        :disabled="solved && i !== correctIndex && picked !== i"
        @click="pick(i)"
      >
        {{ pickText(option.text, option.textRu) }}
      </button>
    </div>

    <p
      v-if="feedback || revealed"
      class="choice__feedback"
      :class="solved ? 'choice__feedback--good' : 'choice__feedback--bad'"
      aria-live="polite"
    >
      <template v-if="revealed && !options[picked ?? -1]?.correct">
        {{ $t('school2.answerIs', { answer: pickText(options[correctIndex]?.text ?? '', options[correctIndex]?.textRu) }) }}
      </template>
      {{ feedback ?? '' }}
    </p>

    <button v-if="solved" class="btn btn--primary" type="button" @click="finish">{{ $t('common.continue') }}</button>
  </div>
</template>

<style scoped>
.choice {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.choice__instruction {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
  margin: 0;
}

.choice__prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.choice__prompt-text {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
  text-align: center;
}

.choice__options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option {
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: center;
  transition:
    transform 0.12s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.option:not(:disabled):hover {
  transform: translateY(-1px);
}

.option--correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
  color: var(--color-teal);
}

.option--wrong {
  border-color: var(--color-terracotta);
  background: #fbf1ec;
  animation: shake 0.35s ease;
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

.choice__feedback {
  font-size: 0.88rem;
  text-align: center;
  margin: 0;
}

.choice__feedback--good {
  color: var(--color-teal);
  font-weight: 600;
}

.choice__feedback--bad {
  color: var(--color-terracotta);
}
</style>
