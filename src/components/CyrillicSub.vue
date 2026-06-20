<script setup lang="ts">
import { computed } from 'vue'
import { latinToCyrillic } from '@/exercises/transliterate'

/**
 * Small Cyrillic spelling shown under an Uzbek Latin headword wherever a word
 * is being presented or revealed (word lists, the intro "listen" step, lesson
 * examples). Deliberately NOT used in exercises that test reading a word in a
 * given script (the Test exercise, sight-Cyrillic, spelling) so it can't give
 * the answer away.
 *
 * Prefers a pre-built `cyrillic` when the source carries one, falling back to
 * the runtime transliteration for strings (e.g. place names) that don't.
 */
const props = defineProps<{ latin: string; cyrillic?: string }>()

const text = computed(() => props.cyrillic?.trim() || latinToCyrillic(props.latin))
</script>

<template>
  <span class="cyrillic-sub" lang="uz" aria-hidden="true">{{ text }}</span>
</template>

<style scoped>
.cyrillic-sub {
  display: block;
  font-size: 0.78em;
  font-weight: 500;
  color: var(--color-text-muted);
  line-height: 1.15;
}
</style>
