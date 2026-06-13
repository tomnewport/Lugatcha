<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { speakUzbek, stopSpeaking } from '@/audio/audio'

const props = defineProps<{
  text: string
  label?: string
  large?: boolean
}>()

const emit = defineEmits<{ played: [] }>()

const playing = ref(false)
// Cycles normal → slow → normal on successive clicks.
const nextSlow = ref(false)

async function play() {
  if (playing.value) return
  playing.value = true
  const slow = nextSlow.value
  try {
    await speakUzbek(props.text, { slow })
  } finally {
    playing.value = false
    nextSlow.value = !slow
    emit('played')
  }
}

onUnmounted(stopSpeaking)
</script>

<template>
  <button
    class="audio-btn"
    :class="{ 'audio-btn--playing': playing, 'audio-btn--large': large, 'audio-btn--slow': nextSlow && !playing }"
    :aria-label="label ?? $t('audio.play', { text })"
    :title="nextSlow && !playing ? $t('audio.playSlow') : undefined"
    type="button"
    @click.stop="play"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round" />
      <path d="M18.5 6a9 9 0 0 1 0 12" stroke-linecap="round" />
    </svg>
  </button>
</template>

<style scoped>
.audio-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-primary);
  flex-shrink: 0;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  box-shadow: var(--shadow-sm);
}

.audio-btn svg {
  width: 18px;
  height: 18px;
}

.audio-btn--large {
  width: 56px;
  height: 56px;
}

.audio-btn--large svg {
  width: 28px;
  height: 28px;
}

.audio-btn:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.audio-btn--playing {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
  animation: pulse 1s ease infinite;
}

/* Subtle teal tint signals "next click = slow speed". */
.audio-btn--slow {
  border-color: var(--color-teal, #2a9d8f);
  color: var(--color-teal, #2a9d8f);
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}
</style>
