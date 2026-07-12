<script setup lang="ts">
import { ref, computed } from 'vue'
import { tokenize, buildDecoys } from '@/exercises/validate'
import { PHRASE_DECOYS, type PhrasePromptMode, type PracticePhrase } from '@/exercises/phrases'
import { useContentLang } from '@/i18n/content'
import { speakUzbek } from '@/audio/audio'
import AudioButton from '@/components/AudioButton.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'
import TokenAssembly, { type AssemblyResult } from './TokenAssembly.vue'

/**
 * One phrase-building question inside a mixed practice session — the same
 * prompt modes as the location Phrase Assembly exercise, condensed to a single
 * phrase whose answer feeds the phrase's spaced-repetition schedule.
 */
const props = defineProps<{ phrase: PracticePhrase; mode: PhrasePromptMode; pool: PracticePhrase[] }>()
const emit = defineEmits<{ answered: [boolean] }>()
const { pick } = useContentLang()

const translation = computed(() => pick(props.phrase.english, props.phrase.russian))
const isEnglishAssembly = computed(() => props.mode === 'uzbek-to-english')
const targetTokens = computed(() =>
  isEnglishAssembly.value ? tokenize(translation.value) : props.phrase.tokens,
)
const decoys = computed(() => {
  const pool = isEnglishAssembly.value
    ? props.pool.flatMap((p) => tokenize(pick(p.english, p.russian)))
    : props.pool.flatMap((p) => p.tokens)
  return buildDecoys(targetTokens.value, pool, PHRASE_DECOYS)
})

const solved = ref(false)

function onResult(result: AssemblyResult) {
  solved.value = true
  if (result.correct) speakUzbek(props.phrase.uzbek)
  emit('answered', result.correct && !result.revealed)
}
</script>

<template>
  <div class="pq">
    <div class="pq__prompt">
      <template v-if="mode === 'english'">
        <span class="pq__prompt-label">{{ $t('exercise.phrase.buildUzbek') }}</span>
        <p class="pq__prompt-text">{{ translation }}</p>
      </template>
      <template v-else-if="mode === 'uzbek-to-english'">
        <span class="pq__prompt-label">{{ $t('exercise.phrase.translate') }}</span>
        <p class="pq__prompt-text">
          <UzbekSentence :uzbek="phrase.uzbek" />
        </p>
      </template>
      <template v-else>
        <span class="pq__prompt-label">{{ $t('exercise.phrase.listenBuild') }}</span>
        <AudioButton :text="phrase.uzbek" large :label="$t('audio.playPhrase')" />
      </template>
    </div>

    <TokenAssembly
      :tokens="targetTokens"
      :decoys="decoys"
      :mode="isEnglishAssembly ? 'loose' : 'strict'"
      @result="onResult"
    />

    <div v-if="solved" class="pq__solution">
      <p class="pq__solution-uz">
        <UzbekSentence :uzbek="phrase.uzbek" />
        <AudioButton :text="phrase.uzbek" />
      </p>
      <p class="pq__solution-en">{{ translation }}</p>
    </div>
  </div>
</template>

<style scoped>
.pq {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.pq__prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.pq__prompt-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.pq__prompt-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.pq__solution {
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

.pq__solution-uz {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-teal);
  margin: 0;
}

.pq__solution-en {
  font-size: 0.9rem;
  color: var(--color-text);
  margin: 0;
}
</style>
