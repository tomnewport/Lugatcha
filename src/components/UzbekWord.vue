<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import type { Ref } from 'vue'
import { breakdownIndex, ensureBreakdownIndex } from '@/exercises/deagglutination'
import { normalizeToken } from '@/exercises/validate'
import { speakUzbek } from '@/audio/audio'

const props = defineProps<{
  word: string
  meaning?: string
}>()

// Sentence-level coordination: only one tooltip open at a time within a sentence.
// UzbekSentence provides this ref; standalone UzbekWord gets its own isolated ref.
const sentenceActive = inject<Ref<symbol | null>>('uz-active', ref(null))
const id = Symbol()

const localOpen = ref(false)
const isOpen = computed(() =>
  sentenceActive !== null
    ? sentenceActive.value === id
    : localOpen.value,
)

onMounted(() => {
  void ensureBreakdownIndex()
})

const breakdown = computed(() => breakdownIndex.value.get(normalizeToken(props.word)) ?? null)
const isAgglutinated = computed(() => breakdown.value !== null)
const hasTooltip = computed(() => isAgglutinated.value || !!props.meaning)

function toggle() {
  void speakUzbek(props.word)
  if (!hasTooltip.value) return
  if (sentenceActive !== null) {
    sentenceActive.value = sentenceActive.value === id ? null : id
  } else {
    localOpen.value = !localOpen.value
  }
}
</script>

<template>
  <span
    class="uz-word"
    lang="uz"
    :class="{
      'uz-word--agglutinated': isAgglutinated,
      'uz-word--meaning': !isAgglutinated && !!meaning,
      'uz-word--open': isOpen,
    }"
  >
    <button
      class="uz-word__btn"
      type="button"
      :aria-expanded="hasTooltip ? isOpen : undefined"
      @click.stop="toggle"
    >{{ word }}</button>

    <!-- Breakdown tooltip -->
    <span
      v-if="isOpen && isAgglutinated && breakdown"
      class="uz-word__tooltip uz-word__tooltip--breakdown"
      role="tooltip"
    >
      <span class="bk-row">
        <template v-for="(part, i) in breakdown.breakdown" :key="i">
          <span v-if="i > 0" class="bk-plus" aria-hidden="true">+</span>
          <span class="bk-morpheme">
            <span class="bk-morpheme__part" lang="uz">{{ part }}</span>
            <span class="bk-morpheme__gloss">{{ breakdown.gloss[i] }}</span>
          </span>
        </template>
      </span>
    </span>

    <!-- Meaning tooltip -->
    <span
      v-else-if="isOpen && !isAgglutinated && meaning"
      class="uz-word__tooltip uz-word__tooltip--meaning"
      role="tooltip"
    >{{ meaning }}</span>
  </span>
</template>

<style scoped>
.uz-word {
  position: relative;
  display: inline-block;
}

.uz-word__btn {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0 1px 2px;
  cursor: pointer;
  line-height: inherit;
}

.uz-word--meaning .uz-word__btn {
  border-bottom: 1.5px dotted var(--color-primary-light);
}

.uz-word--agglutinated .uz-word__btn {
  border-bottom: 2px solid var(--color-teal);
}

.uz-word--open .uz-word__btn {
  background: rgb(27 79 138 / 0.07);
  border-radius: 3px;
}

/* Base tooltip */
.uz-word__tooltip {
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  width: max-content;
  max-width: min(300px, 88vw);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  white-space: normal;
  /* small arrow pointing down */
}

.uz-word__tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
}

/* Meaning tooltip */
.uz-word__tooltip--meaning {
  padding: 0.35rem 0.6rem;
  font-size: 0.76rem;
  font-weight: 600;
  font-family: var(--font-sans, inherit);
  color: #fff;
  background: var(--color-text);
}

.uz-word__tooltip--meaning::after {
  border-top-color: var(--color-text);
}

/* Breakdown tooltip */
.uz-word__tooltip--breakdown {
  padding: 0.5rem 0.7rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-teal);
}

.uz-word__tooltip--breakdown::after {
  border-top-color: var(--color-teal);
}

.bk-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px 3px;
}

.bk-plus {
  align-self: flex-start;
  margin-top: 0.28rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-text-muted);
  font-family: var(--font-sans, inherit);
}

.bk-morpheme {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.bk-morpheme__part {
  padding: 0.18rem 0.42rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-teal);
  background: #f0f7f5;
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-sm);
}

.bk-morpheme:first-child .bk-morpheme__part {
  color: var(--color-primary);
  background: #f2f7fc;
  border-color: var(--color-primary-light);
}

.bk-morpheme__gloss {
  font-size: 0.59rem;
  font-family: var(--font-sans, inherit);
  color: var(--color-text-muted);
  text-align: center;
  max-width: 72px;
  line-height: 1.2;
}
</style>
