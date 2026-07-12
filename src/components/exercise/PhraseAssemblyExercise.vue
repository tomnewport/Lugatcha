<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db } from '@/db'
import { tokenize, shuffle, buildDecoys, normalizeToken } from '@/exercises/validate'
import { PHRASE_DECOYS, phraseKey } from '@/exercises/phrases'
import { speakUzbek } from '@/audio/audio'
import { useContentLang } from '@/i18n/content'
import { useProgressStore } from '@/stores/progress'
import AudioButton from '@/components/AudioButton.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'
import TokenAssembly, { type AssemblyResult } from './TokenAssembly.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()
const { pick } = useContentLang()
const progress = useProgressStore()

type PromptMode = 'english' | 'uzbek-to-english' | 'audio'

interface Phrase {
  uzbek: string
  english: string
  tokens: string[]
  englishTokens: string[]
  mode: PromptMode
}

const PHRASES_PER_SESSION = 4
const MODES: PromptMode[] = ['english', 'uzbek-to-english', 'audio']

const phrases = ref<Phrase[]>([])
const decoyPool = ref<string[]>([])
const englishDecoyPool = ref<string[]>([])
const index = ref(0)
const solved = ref(false)
const loading = ref(true)

onMounted(async () => {
  const roleplays = await db.roleplay.where('theme').equals(props.locationId).toArray()
  const seen = new Set<string>()
  const userPhrases: Omit<Phrase, 'mode'>[] = []
  for (const rp of roleplays) {
    for (const variant of rp.variants) {
      for (const turn of variant.turns) {
        if (turn.speaker !== 'user') continue
        const key = normalizeToken(turn.uzbek)
        if (seen.has(key)) continue
        seen.add(key)
        const translation = pick(turn.english, turn.russian)
        userPhrases.push({
          uzbek: turn.uzbek,
          english: translation,
          tokens: turn.tokens ?? tokenize(turn.uzbek),
          englishTokens: tokenize(translation),
        })
      }
    }
  }
  phrases.value = shuffle(userPhrases)
    .slice(0, PHRASES_PER_SESSION)
    .map((p, i) => ({ ...p, mode: MODES[i % MODES.length] }))
  decoyPool.value = userPhrases.flatMap((p) => p.tokens)
  englishDecoyPool.value = userPhrases.flatMap((p) => p.englishTokens)
  loading.value = false
})

const current = computed(() => phrases.value[index.value])
const isEnglishAssembly = computed(() => current.value?.mode === 'uzbek-to-english')
const activeTokens = computed(() =>
  current.value
    ? (isEnglishAssembly.value ? current.value.englishTokens : current.value.tokens)
    : []
)
const decoys = computed(() => {
  if (!current.value) return []
  return isEnglishAssembly.value
    ? buildDecoys(current.value.englishTokens, englishDecoyPool.value, PHRASE_DECOYS)
    : buildDecoys(current.value.tokens, decoyPool.value, PHRASE_DECOYS)
})
const isLast = computed(() => index.value >= phrases.value.length - 1)

function onResult(result: AssemblyResult) {
  solved.value = true
  if (result.correct) speakUzbek(current.value.uzbek)
  // Enrols the phrase in spaced repetition, so Daily Practice re-serves it.
  void progress.recordPhraseResult(phraseKey(current.value.uzbek), result.correct && !result.revealed)
}

function next() {
  if (isLast.value) {
    emit('complete')
  } else {
    index.value++
    solved.value = false
  }
}
</script>

<template>
  <div class="phrase">
    <p v-if="loading" class="phrase__loading" aria-live="polite">{{ $t('exercise.phrase.loading') }}</p>

    <template v-else-if="current">
      <p class="phrase__counter">{{ $t('exercise.phrase.counter', { current: index + 1, total: phrases.length }) }}</p>

      <div class="phrase__prompt">
        <template v-if="current.mode === 'english'">
          <span class="phrase__prompt-label">{{ $t('exercise.phrase.buildUzbek') }}</span>
          <p class="phrase__prompt-text">{{ current.english }}</p>
        </template>
        <template v-else-if="current.mode === 'uzbek-to-english'">
          <span class="phrase__prompt-label">{{ $t('exercise.phrase.translate') }}</span>
          <p class="phrase__prompt-text">
            <UzbekSentence :uzbek="current.uzbek" />
          </p>
        </template>
        <template v-else>
          <span class="phrase__prompt-label">{{ $t('exercise.phrase.listenBuild') }}</span>
          <AudioButton :text="current.uzbek" large :label="$t('audio.playPhrase')" />
        </template>
      </div>

      <TokenAssembly
        :key="index"
        :tokens="activeTokens"
        :decoys="decoys"
        :mode="isEnglishAssembly ? 'loose' : 'strict'"
        @result="onResult"
      />

      <div v-if="solved" class="phrase__solution">
        <p class="phrase__solution-uz">
          <UzbekSentence :uzbek="current.uzbek" />
          <AudioButton :text="current.uzbek" />
        </p>
        <p class="phrase__solution-en">{{ current.english }}</p>
        <button class="btn btn--primary" type="button" @click="next">
          {{ isLast ? $t('exercise.phrase.finish') : $t('exercise.phrase.nextPhrase') }}
        </button>
      </div>
    </template>

    <div v-else class="phrase__empty">
      <p class="phrase__loading">
        {{ $t('exercise.phrase.empty') }}
      </p>
      <button class="btn btn--primary" type="button" @click="emit('complete')">{{ $t('common.continue') }}</button>
    </div>
  </div>
</template>

<style scoped>
.phrase {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  flex: 1;
}

.phrase__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.phrase__empty {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.phrase__counter {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  margin: 0;
}

.phrase__prompt {
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

.phrase__prompt-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.phrase__prompt-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.phrase__solution {
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

.phrase__solution-uz {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-teal);
  margin: 0;
}

.phrase__solution-en {
  font-size: 0.9rem;
  color: var(--color-text);
  margin: 0;
}

.phrase__solution .btn {
  margin-top: 0.5rem;
  align-self: stretch;
}
</style>
