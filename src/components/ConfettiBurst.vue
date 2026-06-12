<script setup lang="ts">
import { onMounted } from 'vue'

const props = withDefaults(defineProps<{ pieces?: number; duration?: number }>(), {
  pieces: 80,
  duration: 1800,
})

const emit = defineEmits<{ done: [] }>()

const COLORS = ['#1b4f8a', '#c9a84c', '#1a5e52', '#c2522a', '#2e6db4']

interface Piece {
  left: number
  delay: number
  duration: number
  color: string
  size: number
  rotate: number
  drift: number
}

const confetti: Piece[] = Array.from({ length: props.pieces }, () => ({
  left: Math.random() * 100,
  delay: Math.random() * 300,
  duration: 1100 + Math.random() * 700,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  size: 6 + Math.random() * 6,
  rotate: Math.random() * 360,
  drift: (Math.random() - 0.5) * 120,
}))

onMounted(() => {
  setTimeout(() => emit('done'), props.duration)
})
</script>

<template>
  <div class="confetti" aria-hidden="true">
    <span
      v-for="(p, i) in confetti"
      :key="i"
      class="confetti__piece"
      :style="{
        left: `${p.left}%`,
        width: `${p.size}px`,
        height: `${p.size * 0.4}px`,
        background: p.color,
        animationDelay: `${p.delay}ms`,
        animationDuration: `${p.duration}ms`,
        '--drift': `${p.drift}px`,
        '--rot': `${p.rotate}deg`,
      }"
    />
  </div>
</template>

<style scoped>
.confetti {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 60;
}

.confetti__piece {
  position: absolute;
  top: -5%;
  border-radius: 1px;
  animation-name: fall;
  animation-timing-function: ease-in;
  animation-fill-mode: forwards;
}

@keyframes fall {
  0% {
    transform: translate(0, 0) rotate(var(--rot));
    opacity: 1;
  }
  100% {
    transform: translate(var(--drift), 105vh) rotate(calc(var(--rot) + 540deg));
    opacity: 0.9;
  }
}
</style>
