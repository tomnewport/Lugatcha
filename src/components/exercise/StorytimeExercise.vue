<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db } from '@/db'
import type { Story } from '@/db/types'
import { tokenize, buildDecoys, contentWords, normalizeToken, shuffle } from '@/exercises/validate'
import AudioButton from '@/components/AudioButton.vue'
import TokenAssembly, { type AssemblyResult } from './TokenAssembly.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

const story = ref<Story | null>(null)
const index = ref(0)
const solved = ref(false)
const replayMode = ref(false)
const loading = ref(true)

/** normalised Uzbek form -> English meaning, built from the whole dictionary. */
const glossary = ref(new Map<string, string>())

onMounted(async () => {
  const [themeStories, allWords] = await Promise.all([
    db.stories.where('theme').equals(props.locationId).toArray(),
    db.words.toArray(),
  ])
  // A location can have several stories — serve a random one each session
  const found = shuffle(themeStories)[0]
  story.value = found ?? null
  const map = new Map<string, string>()
  for (const word of allWords) {
    map.set(normalizeToken(word.uzbek), word.english)
    for (const inflection of word.inflections ?? []) {
      if (!map.has(normalizeToken(inflection))) map.set(normalizeToken(inflection), word.english)
    }
  }
  // Story-specific glosses win over dictionary entries
  for (const [surface, gloss] of Object.entries(found?.glossary ?? {})) {
    map.set(normalizeToken(surface), gloss)
  }
  glossary.value = map
  loading.value = false
})

const sentence = computed(() => story.value?.sentences[index.value])
const englishTokens = computed(() => (sentence.value ? tokenize(sentence.value.english) : []))
const isLast = computed(() => !!story.value && index.value >= story.value.sentences.length - 1)

/** English content words from the rest of the story, used as decoys. */
const decoys = computed(() => {
  if (!story.value || !sentence.value) return []
  const pool = story.value.sentences
    .filter((_, i) => i !== index.value)
    .flatMap((s) => contentWords(tokenize(s.english)))
  return buildDecoys(englishTokens.value, pool, 3)
})

function onResult(result: AssemblyResult) {
  void result
  solved.value = true
}

function next() {
  if (isLast.value) {
    replayMode.value = true
  } else {
    index.value++
    solved.value = false
  }
}
</script>

<template>
  <div class="story">
    <p v-if="loading" class="story__loading" aria-live="polite">Loading story…</p>

    <div v-else-if="!story" class="story__empty">
      <p class="story__loading">
        No story for this location yet — it'll arrive in a content update.
      </p>
      <button class="btn btn--primary" type="button" @click="emit('complete')">Continue</button>
    </div>

    <!-- Bilingual replay -->
    <template v-else-if="replayMode">
      <h2 class="story__title">{{ story.title.en }}</h2>
      <p class="story__title-uz" lang="uz">{{ story.title.uz }}</p>
      <p class="story__replay-note">The whole story — listen again any time.</p>

      <ol class="replay-list">
        <li v-for="(s, i) in story.sentences" :key="i" class="replay-item">
          <div class="replay-item__text">
            <p class="replay-item__uzbek">
              <UzbekSentence :uzbek="s.uzbek" :glossary="glossary" />
            </p>
            <p class="replay-item__english">{{ s.english }}</p>
          </div>
          <AudioButton :text="s.uzbek" />
        </li>
      </ol>

      <button class="btn btn--primary story__finish" type="button" @click="emit('complete')">
        Finish story
      </button>
    </template>

    <!-- Sentence by sentence -->
    <template v-else-if="sentence">
      <h2 class="story__title">{{ story.title.en }}</h2>
      <p class="story__counter">Sentence {{ index + 1 }} of {{ story.sentences.length }}</p>

      <div class="sentence-card">
        <p class="sentence-card__uzbek">
          <UzbekSentence :uzbek="sentence.uzbek" :glossary="glossary" />
        </p>
        <AudioButton :text="sentence.uzbek" label="Play the sentence" />
        <p class="sentence-card__hint">Tap any word you don't know.</p>
      </div>

      <p class="story__task">Now build the English translation:</p>

      <TokenAssembly
        :key="index"
        :tokens="englishTokens"
        :decoys="decoys"
        mode="loose"
        @result="onResult"
      />

      <div v-if="solved" class="story__solution">
        <p class="story__solution-text">{{ sentence.english }}</p>
        <button class="btn btn--primary" type="button" @click="next">
          {{ isLast ? 'Read the whole story' : 'Next sentence' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.story {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  flex: 1;
}

.story__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.story__empty {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.story__title {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
  text-align: center;
  margin: 0;
}

.story__title-uz {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.story__counter {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  margin: 0;
}

.sentence-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.1rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.sentence-card__uzbek {
  display: flex;
  justify-content: center;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.sentence-card__hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-style: italic;
  margin: 0;
}

.story__task {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
  margin: 0;
}

.story__solution {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem;
  background: #f0f7f5;
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-md);
  text-align: center;
}

.story__solution-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-teal);
  margin: 0;
}

.story__replay-note {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.replay-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.replay-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.replay-item__text {
  flex: 1;
  min-width: 0;
}

.replay-item__uzbek {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.replay-item__english {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0.15rem 0 0;
}

.story__finish {
  margin-top: 0.5rem;
}
</style>
