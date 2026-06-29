<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { planIncrement, streakChips, type Chip, type Merge } from '@/streak'
import ConfettiBurst from '@/components/ConfettiBurst.vue'

const props = defineProps<{ from: number; to: number }>()
const emit = defineEmits<{ done: [] }>()

const plan = planIncrement(props.from)
const finalChips = computed<Chip[]>(() => streakChips(props.to))

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// --- Scene state -----------------------------------------------------------
// One scene is on the stage at a time: first the new chip pops in, then each
// carry merge plays (components fly into a growing, pulsing higher-tier chip),
// then the full new streak is revealed.
type Scene = { kind: 'add' } | { kind: 'merge'; merge: Merge }

const scene = ref<Scene>({ kind: 'add' })
const addPopped = ref(false)

// Per-component "has joined the centre" flags for the active merge.
const joined = ref<boolean[]>([])
// Centre chip scale — transitioned, so each bump reads as a pulse.
const targetScale = ref(0)
const targetVisible = ref(false)

const showFinal = ref(false)
const finalRevealed = ref(false)
const confetti = ref(false)

const title = computed(() => (props.to === 1 ? 'streak.started' : 'streak.extended'))

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Horizontal offset (px) of merge component `i` of `n`, centred as a group. */
function componentOffset(i: number, n: number): number {
  const gap = 48
  return (i - (n - 1) / 2) * gap
}

async function playMerge(merge: Merge) {
  scene.value = { kind: 'merge', merge }
  joined.value = merge.components.map(() => false)
  targetScale.value = 0
  targetVisible.value = false
  await wait(reducedMotion ? 0 : 320)

  const n = merge.components.length
  for (let i = 0; i < n; i++) {
    targetVisible.value = true
    joined.value = joined.value.map((v, idx) => (idx === i ? true : v))
    const base = 0.55 + (i + 1) * 0.16
    // Pop past the resting scale, then settle — the transition makes it pulse.
    targetScale.value = base + 0.28
    await wait(reducedMotion ? 0 : 150)
    targetScale.value = base
    await wait(reducedMotion ? 0 : 200)
  }
  // Final flourish on the freshly fused chip.
  targetScale.value = 1.9
  await wait(reducedMotion ? 0 : 180)
  targetScale.value = 1.6
  await wait(reducedMotion ? 0 : 360)
}

async function play() {
  // Scene 1 — the new single chip pops in.
  scene.value = { kind: 'add' }
  await wait(20)
  addPopped.value = true
  await wait(reducedMotion ? 0 : 650)

  // Scene 2 — carry merges, lowest tier first.
  for (const merge of plan.merges) {
    await playMerge(merge)
  }

  // Scene 3 — reveal the full streak.
  showFinal.value = true
  confetti.value = true
  await wait(20)
  finalRevealed.value = true
}

onMounted(play)

function close() {
  emit('done')
}
</script>

<template>
  <div class="streak" role="dialog" :aria-label="$t('streak.aria')">
    <ConfettiBurst v-if="confetti" :pieces="70" @done="confetti = false" />

    <div class="streak__card">
      <p class="streak__title">{{ $t(title) }}</p>

      <div class="streak__stage" aria-hidden="true">
        <!-- Scene 1: the new chip pops in. -->
        <div v-if="scene.kind === 'add' && !showFinal" class="streak__add">
          <span class="streak__chip streak__chip--pop" :class="{ 'is-in': addPopped }">
            {{ plan.added.symbol }}
          </span>
        </div>

        <!-- Scene 2: five chips fuse into one higher-tier chip. -->
        <div v-else-if="scene.kind === 'merge' && !showFinal" class="streak__merge">
          <span
            v-for="(c, i) in scene.merge.components"
            :key="`c-${i}`"
            class="streak__chip streak__chip--component"
            :style="{
              transform: joined[i]
                ? 'translate(-50%, -50%) scale(0.2)'
                : `translate(calc(-50% + ${componentOffset(i, scene.merge.components.length)}px), -50%)`,
              opacity: joined[i] ? 0 : 1,
            }"
          >
            {{ c.symbol }}
          </span>
          <span
            class="streak__chip streak__chip--target"
            :style="{
              transform: `translate(-50%, -50%) scale(${targetScale})`,
              opacity: targetVisible ? 1 : 0,
            }"
          >
            {{ scene.merge.result.symbol }}
          </span>
        </div>

        <!-- Scene 3: the whole streak, chips popping in left to right. -->
        <div v-else class="streak__final" :class="{ 'is-in': finalRevealed }">
          <span
            v-for="(c, i) in finalChips"
            :key="`f-${i}`"
            class="streak__chip streak__chip--final"
            :style="{ transitionDelay: `${i * 70}ms` }"
          >
            {{ c.symbol }}
          </span>
        </div>
      </div>

      <p class="streak__count">{{ $t('streak.days', { count: to }) }}</p>

      <button class="btn btn--primary streak__btn" type="button" @click="close">
        {{ $t('common.continue') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.streak {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(37, 28, 18, 0.55);
  backdrop-filter: blur(4px);
}

.streak__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  max-width: 360px;
  padding: 1.6rem 1.25rem 1.4rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  animation: card-in 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes card-in {
  from {
    transform: scale(0.85) translateY(12px);
    opacity: 0;
  }
}

.streak__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--color-primary);
  text-align: center;
}

.streak__stage {
  position: relative;
  width: 100%;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.streak__chip {
  line-height: 1;
  font-size: 2.4rem;
  /* Emoji render flat-coloured rather than glyph-default. */
  filter: drop-shadow(0 2px 3px rgba(37, 28, 18, 0.25));
}

/* Scene 1 — pop in */
.streak__add {
  display: flex;
}

.streak__chip--pop {
  transform: scale(0);
  transition: transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.streak__chip--pop.is-in {
  transform: scale(1);
}

/* Scene 2 — merge */
.streak__merge {
  position: relative;
  width: 100%;
  height: 100%;
}

.streak__chip--component {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 2rem;
  transition:
    transform 0.32s cubic-bezier(0.55, 0, 0.45, 1),
    opacity 0.32s ease;
}

.streak__chip--target {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 2.8rem;
  transition: transform 0.16s ease-out;
  filter: drop-shadow(0 0 10px rgba(201, 168, 76, 0.7))
    drop-shadow(0 2px 3px rgba(37, 28, 18, 0.25));
}

/* Scene 3 — final reveal */
.streak__final {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.15rem 0.05rem;
  max-width: 320px;
}

.streak__chip--final {
  font-size: 2rem;
  transform: scale(0);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.streak__final.is-in .streak__chip--final {
  transform: scale(1);
}

.streak__count {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-gold);
}

.streak__btn {
  margin-top: 0.6rem;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .streak__card {
    animation: none;
  }
  .streak__chip--pop,
  .streak__chip--final {
    transition-duration: 0.01ms;
  }
}
</style>
