<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LessonExercise } from '@/db/types'
import { speakUzbek, playChime } from '@/audio/audio'
import AudioButton from '@/components/AudioButton.vue'
import TokenAssembly, { type AssemblyResult } from '@/components/exercise/TokenAssembly.vue'

const props = defineProps<{ exercise: LessonExercise }>()
const emit = defineEmits<{ done: [passed: boolean] }>()

const result = ref<AssemblyResult | null>(null)

const assembled = computed(() => (props.exercise.tokens ?? []).join(props.exercise.joiner ?? ' '))
const spoken = computed(() => props.exercise.audioText ?? assembled.value)

function onResult(r: AssemblyResult) {
  result.value = r
  if (r.correct) {
    playChime()
    speakUzbek(spoken.value)
  }
}

function finish() {
  emit('done', result.value?.correct ?? false)
}
</script>

<template>
  <div class="build">
    <p class="build__instruction">{{ exercise.instruction }}</p>
    <p v-if="exercise.prompt" class="build__prompt">{{ exercise.prompt }}</p>

    <TokenAssembly
      :tokens="exercise.tokens ?? []"
      :decoys="exercise.decoys ?? []"
      mode="strict"
      @result="onResult"
    />

    <div v-if="result" class="build__solution">
      <p class="build__solution-uz" lang="uz">
        {{ assembled }}
        <AudioButton :text="spoken" />
      </p>
      <p v-if="exercise.translation" class="build__solution-en">{{ exercise.translation }}</p>
      <button class="btn btn--primary" type="button" @click="finish">Continue</button>
    </div>
  </div>
</template>

<style scoped>
.build {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.build__instruction {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
  margin: 0;
}

.build__prompt {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary);
  text-align: center;
  margin: 0;
  padding: 0.9rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.build__solution {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
  padding: 1rem;
  background: #f0f7f5;
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-md);
  text-align: center;
}

.build__solution-uz {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-teal);
  margin: 0;
}

.build__solution-en {
  font-size: 0.9rem;
  color: var(--color-text);
  margin: 0;
}

.build__solution .btn {
  margin-top: 0.4rem;
  align-self: stretch;
}
</style>
