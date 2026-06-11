<script setup lang="ts">
import { ref, computed, provide } from 'vue'
import UzbekWord from '@/components/UzbekWord.vue'
import { tokenize, normalizeToken } from '@/exercises/validate'

const props = defineProps<{
  uzbek: string
  glossary?: Map<string, string>
}>()

const tokens = computed(() => tokenize(props.uzbek))

// Only one word tooltip open at a time within this sentence.
const activeSentenceWord = ref<symbol | null>(null)
provide('uz-active', activeSentenceWord)

function meaningFor(token: string): string | undefined {
  if (!props.glossary) return undefined
  const norm = normalizeToken(token)
  const exact = props.glossary.get(norm)
  if (exact) return exact
  // Stem-based fallback: find the longest matching root for inflected forms.
  let bestStem = ''
  let bestGloss: string | undefined
  for (const [stem, gloss] of props.glossary) {
    if (stem.length >= 3 && stem.length > bestStem.length && norm.startsWith(stem)) {
      bestStem = stem
      bestGloss = `${gloss} (+ suffix)`
    }
  }
  return bestGloss
}
</script>

<template>
  <span class="uz-sentence">
    <UzbekWord
      v-for="(token, i) in tokens"
      :key="i"
      :word="token"
      :meaning="meaningFor(token)"
    />
  </span>
</template>

<style scoped>
.uz-sentence {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.2em 0.35em;
  align-items: baseline;
}
</style>
