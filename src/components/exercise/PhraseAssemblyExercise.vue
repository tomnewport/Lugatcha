<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db } from '@/db'
import { tokenize, shuffle, buildDecoys, normalizeToken } from '@/exercises/validate'
import { speakUzbek } from '@/audio/audio'
import AudioButton from '@/components/AudioButton.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'
import TokenAssembly, { type AssemblyResult } from './TokenAssembly.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

type PromptMode = 'english' | 'uzbek' | 'audio'

interface Phrase {
  uzbek: string
  english: string
  tokens: string[]
  mode: PromptMode
}

const PHRASES_PER_SESSION = 4
const MODES: PromptMode[] = ['english', 'uzbek', 'audio']

const phrases = ref<Phrase[]>([])
const decoyPool = ref<string[]>([])
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
        userPhrases.push({
          uzbek: turn.uzbek,
          english: turn.english,
          tokens: turn.tokens ?? tokenize(turn.uzbek),
        })
      }
    }
  }
  phrases.value = shuffle(userPhrases)
    .slice(0, PHRASES_PER_SESSION)
    .map((p, i) => ({ ...p, mode: MODES[i % MODES.length] }))
  decoyPool.value = userPhrases.flatMap((p) => p.tokens)
  loading.value = false
})

const current = computed(() => phrases.value[index.value])
const decoys = computed(() =>
  current.value ? buildDecoys(current.value.tokens, decoyPool.value, 3) : [],
)
const isLast = computed(() => index.value >= phrases.value.length - 1)

function onResult(result: AssemblyResult) {
  solved.value = true
  if (result.correct) speakUzbek(current.value.uzbek)
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
    <p v-if="loading" class="phrase__loading" aria-live="polite">Loading phrases…</p>

    <template v-else-if="current">
      <p class="phrase__counter">Phrase {{ index + 1 }} of {{ phrases.length }}</p>

      <div class="phrase__prompt">
        <template v-if="current.mode === 'english'">
          <span class="phrase__prompt-label">Build this in Uzbek:</span>
          <p class="phrase__prompt-text">{{ current.english }}</p>
        </template>
        <template v-else-if="current.mode === 'uzbek'">
          <span class="phrase__prompt-label">Rebuild this phrase:</span>
          <p class="phrase__prompt-text">
            <UzbekSentence :uzbek="current.uzbek" />
          </p>
        </template>
        <template v-else>
          <span class="phrase__prompt-label">Listen, then build what you hear:</span>
          <AudioButton :text="current.uzbek" large label="Play the phrase" />
        </template>
      </div>

      <TokenAssembly
        :key="index"
        :tokens="current.tokens"
        :decoys="decoys"
        mode="strict"
        @result="onResult"
      />

      <div v-if="solved" class="phrase__solution">
        <p class="phrase__solution-uz">
          <UzbekSentence :uzbek="current.uzbek" />
          <AudioButton :text="current.uzbek" />
        </p>
        <p class="phrase__solution-en">{{ current.english }}</p>
        <button class="btn btn--primary" type="button" @click="next">
          {{ isLast ? 'Finish' : 'Next phrase' }}
        </button>
      </div>
    </template>

    <div v-else class="phrase__empty">
      <p class="phrase__loading">
        No phrases for this location yet — they'll arrive in a content update.
      </p>
      <button class="btn btn--primary" type="button" @click="emit('complete')">Continue</button>
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
