<script setup lang="ts">
import { computed, onBeforeUnmount, provide, watch } from 'vue'
import UzbekWord from '@/components/UzbekWord.vue'
import { closeWordTooltipsIn } from '@/components/wordTooltip'
import { tokenize, normalizeToken } from '@/exercises/validate'
import { i18n } from '@/i18n'

const props = defineProps<{
  uzbek: string
  glossary?: Map<string, string>
  noHint?: boolean
}>()

const tokens = computed(() => tokenize(props.uzbek))

// Exercises reuse one sentence for the next phrase, story line or roleplay
// turn. Words are keyed by position, so a tooltip left open would otherwise
// hang over a word that has since been replaced.
const owner = Symbol('uz-sentence')
provide('uz-sentence', owner)
watch(
  () => props.uzbek,
  () => closeWordTooltipsIn(owner),
)
onBeforeUnmount(() => closeWordTooltipsIn(owner))

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
      bestGloss = `${gloss} ${i18n.global.t('exercise.suffix')}`
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
      :no-hint="noHint"
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
