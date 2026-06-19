<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLiveQuery, db } from '@/db/useDb'
import { loadLessonIndex } from '@/db/lessons'
import type { LessonProgress } from '@/db/types'

const props = defineProps<{ locked?: boolean }>()

const emit = defineEmits<{
  locked: []
}>()

const router = useRouter()

function open() {
  if (props.locked) {
    emit('locked')
    return
  }
  router.push('/school')
}

const RADIUS = 18
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const totalLessons = ref(0)
onMounted(async () => {
  totalLessons.value = (await loadLessonIndex()).length
})

const allProgress = useLiveQuery(() => db.lessonProgress.toArray(), [] as LessonProgress[])
const doneCount = computed(() => allProgress.value.filter((p) => p.completedAt).length)
const isComplete = computed(() => totalLessons.value > 0 && doneCount.value >= totalLessons.value)
const dashOffset = computed(() =>
  totalLessons.value === 0
    ? CIRCUMFERENCE
    : CIRCUMFERENCE * (1 - Math.min(doneCount.value / totalLessons.value, 1)),
)
</script>

<template>
  <!-- The School is a meta tile: always unlocked, teaches the language itself -->
  <button
    class="tile"
    :class="{ 'tile--complete': isComplete && !locked, 'tile--locked': locked }"
    :aria-disabled="locked"
    :aria-label="`${$t('school.title')}${locked ? ', ' + $t('common.locked') : ''}`"
    @click="open"
  >
    <div class="tile__ring-wrap" aria-hidden="true">
      <svg class="tile__svg" viewBox="0 0 44 44">
        <circle cx="22" cy="22" :r="RADIUS" class="ring-track" fill="none" stroke-width="3" />
        <circle
          v-if="doneCount > 0"
          cx="22"
          cy="22"
          :r="RADIUS"
          class="ring-fill"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
          transform="rotate(-90 22 22)"
        />
      </svg>
      <!-- Open book icon -->
      <svg
        v-if="!locked"
        class="tile__icon"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        aria-hidden="true"
      >
        <path
          d="M8 3.5C6.8 2.6 5 2.3 3 2.5v10c2-.2 3.8.1 5 1 1.2-.9 3-1.2 5-1v-10c-2-.2-3.8.1-5 1z"
        />
        <path d="M8 3.5v10" />
      </svg>
      <span v-else class="tile__icon tile__icon--no-entry" aria-hidden="true">⛔</span>
    </div>
    <span class="tile__name">{{ $t('school.title') }}</span>
    <span class="tile__name-uz" lang="uz">{{ $t('school.subtitle') }}</span>
  </button>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  background: #f3f8f6;
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  box-shadow: var(--shadow-sm);
  width: 100%;
  min-width: 0;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
}

.tile:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.tile--locked {
  opacity: 0.5;
  cursor: pointer;
  filter: grayscale(0.7);
}

.tile--complete {
  border-color: var(--color-gold);
  background: #fffcf0;
}

.tile__ring-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.tile__svg {
  width: 44px;
  height: 44px;
}

.ring-track {
  stroke: var(--color-border);
}

.ring-fill {
  stroke: var(--color-teal);
  transition: stroke-dashoffset 0.35s ease;
}

.tile--complete .ring-fill {
  stroke: var(--color-gold);
}

.tile__icon {
  position: absolute;
  width: 18px;
  height: 18px;
  color: var(--color-teal);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.tile__icon--no-entry {
  font-size: 1rem;
  line-height: 1;
  width: auto;
  height: auto;
  stroke: none;
  filter: drop-shadow(0 1px 1px rgba(37, 28, 18, 0.35));
}

.tile__name {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-teal);
  line-height: 1.2;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile__name-uz {
  font-size: 0.58rem;
  color: var(--color-text-muted);
  line-height: 1.2;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
