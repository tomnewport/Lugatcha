<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useContentLang } from '@/i18n/content'
import {
  loadContinueLearningData,
  pickContinueTarget,
  shouldReviewFirst,
  isLocationComplete,
  type LocationSummary,
  type ContinueSuggestion,
} from '@/exercises/progression'
import LocationCrop from '@/components/LocationCrop.vue'

/** How many Continue Learning sessions have been launched — drives the review rotation. */
const CONTINUE_COUNT_KEY = 'lugatcha.continueCount'
const LAST_TRIED_KEY = 'lugatcha.lastTriedLocation'

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const { name } = useContentLang()

const loading = ref(true)
const summaries = ref<LocationSummary[]>([])
const dueCount = ref(0)
const target = ref<ContinueSuggestion | null>(null)
const reviewFirst = ref(false)
const pickerOpen = ref(false)

function readRotation(): number {
  try {
    return parseInt(localStorage.getItem(CONTINUE_COUNT_KEY) ?? '0', 10) || 0
  } catch {
    return 0
  }
}

onMounted(async () => {
  const data = await loadContinueLearningData()
  summaries.value = data.summaries
  dueCount.value = data.dueCount
  target.value = pickContinueTarget(data.summaries)
  reviewFirst.value = shouldReviewFirst(data.dueCount, readRotation())
  loading.value = false
})

/** Locations still worth visiting — the override picker (excludes finished areas). */
const pickable = computed(() => summaries.value.filter((s) => !isLocationComplete(s)))

/** A short "8 / 12 words learned" line for the suggested location. */
const targetSummary = computed(() =>
  target.value ? summaries.value.find((s) => s.location.id === target.value!.location.id) ?? null : null,
)

function bumpRotation() {
  try {
    localStorage.setItem(CONTINUE_COUNT_KEY, String(readRotation() + 1))
  } catch {
    // private mode
  }
}

function goReview() {
  bumpRotation()
  router.push('/practice?continue=1')
}

function goLocation(id: string) {
  bumpRotation()
  try {
    localStorage.setItem(LAST_TRIED_KEY, id)
  } catch {
    // private mode
  }
  router.push(`/location/${id}`)
}
</script>

<template>
  <Teleport to="body">
  <div class="cl" role="dialog" aria-modal="true" :aria-label="$t('continue.title')">
    <div class="cl__scrim" @click="emit('close')" />
    <div class="cl__sheet">
      <header class="cl__header">
        <h2 class="cl__title">{{ $t('continue.title') }}</h2>
        <button class="cl__close" type="button" :aria-label="$t('common.close')" @click="emit('close')">✕</button>
      </header>

      <p v-if="loading" class="cl__loading" aria-live="polite">{{ $t('continue.loading') }}</p>

      <template v-else>
        <!-- A spaced-repetition review, mixed in to keep learned words fresh. -->
        <button
          v-if="dueCount > 0"
          class="cl__card cl__card--review"
          :class="{ 'cl__card--primary': reviewFirst }"
          type="button"
          @click="goReview"
        >
          <span class="cl__review-icon" aria-hidden="true">🎯</span>
          <span class="cl__card-body">
            <span class="cl__eyebrow">{{ $t('continue.reviewEyebrow') }}</span>
            <span class="cl__card-title">{{ $t('continue.reviewTitle') }}</span>
            <span class="cl__card-sub">{{ $t('continue.reviewBody', { count: dueCount }) }}</span>
          </span>
          <span class="cl__chevron" aria-hidden="true">›</span>
        </button>

        <!-- The next place to learn, framed as a visual crop of the city map. -->
        <div v-if="target" class="cl__card cl__card--place" :class="{ 'cl__card--primary': !reviewFirst }">
          <LocationCrop
            class="cl__crop"
            :location-id="target.location.id"
            :fallback-label="name(target.location.name).charAt(0)"
          />
          <div class="cl__place-body">
            <span class="cl__eyebrow">
              {{ target.kind === 'new' ? $t('continue.newEyebrow') : $t('continue.resumeEyebrow') }}
            </span>
            <span class="cl__place-name" lang="uz">{{ target.location.name.uz }}</span>
            <span class="cl__place-sub">{{ name(target.location.name) }}</span>
            <span v-if="targetSummary && targetSummary.totalWords > 0" class="cl__progress">
              {{ $t('continue.progressWords', { known: targetSummary.knownWords, total: targetSummary.totalWords }) }}
            </span>
            <button class="btn btn--primary cl__go" type="button" @click="goLocation(target.location.id)">
              {{ target.kind === 'new' ? $t('continue.go') : $t('continue.continueCta') }}
            </button>
          </div>
        </div>

        <!-- Everything is finished: celebrate, review stays available above. -->
        <div v-else class="cl__alldone">
          <span class="cl__alldone-icon" aria-hidden="true">🎉</span>
          <p class="cl__alldone-title">{{ $t('continue.allDoneTitle') }}</p>
          <p class="cl__alldone-body">{{ $t('continue.allDoneBody') }}</p>
        </div>

        <!-- Override: pick any unfinished place instead. -->
        <button
          v-if="pickable.length > 1"
          class="cl__elsewhere"
          type="button"
          @click="pickerOpen = !pickerOpen"
        >
          {{ pickerOpen ? $t('continue.hidePicker') : $t('continue.elsewhere') }}
        </button>

        <div v-if="pickerOpen" class="cl__picker">
          <p class="cl__picker-prompt">{{ $t('continue.pickPrompt') }}</p>
          <div class="cl__grid">
            <button
              v-for="s in pickable"
              :key="s.location.id"
              class="cl__pick"
              type="button"
              @click="goLocation(s.location.id)"
            >
              <LocationCrop
                class="cl__pick-crop"
                :location-id="s.location.id"
                :zoom="2.9"
                :fallback-label="name(s.location.name).charAt(0)"
              />
              <span class="cl__pick-name" lang="uz">{{ s.location.name.uz }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.cl {
  position: fixed;
  inset: 0;
  /* Above the fixed language-selector footer (z-index 10); teleported to body
     so it isn't trapped in the home view's stacking context. */
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.cl__scrim {
  position: absolute;
  inset: 0;
  background: rgba(37, 28, 18, 0.5);
  backdrop-filter: blur(2px);
}

.cl__sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90dvh;
  overflow-y: auto;
  padding: 1.1rem 1.1rem calc(1.4rem + env(safe-area-inset-bottom));
  background: var(--color-bg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  animation: cl-rise 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (min-width: 520px) {
  .cl {
    align-items: center;
  }
  .cl__sheet {
    border-radius: var(--radius-lg);
    margin: 1rem;
  }
}

@keyframes cl-rise {
  from {
    transform: translateY(16px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cl__sheet {
    animation: none;
  }
}

.cl__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.cl__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-primary);
}

.cl__close {
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 1rem;
  line-height: 1;
  padding: 0.3rem 0.4rem;
  cursor: pointer;
}

.cl__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  padding: 1.5rem 0;
}

.cl__card {
  display: flex;
  gap: 0.85rem;
  width: 100%;
  text-align: left;
  padding: 0.85rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.cl__card--primary {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}

.cl__card--review {
  align-items: center;
  cursor: pointer;
}

.cl__review-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.cl__card-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.cl__chevron {
  align-self: center;
  font-size: 1.4rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.cl__eyebrow {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  font-weight: 700;
}

.cl__card-title {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--color-text);
}

.cl__card-sub {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.cl__card--place {
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.cl__crop {
  width: 100%;
  border-radius: 0;
}

.cl__place-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.9rem;
}

.cl__place-name {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1.1;
}

.cl__place-sub {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.cl__progress {
  margin-top: 0.15rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-teal);
}

.cl__go {
  margin-top: 0.7rem;
  align-self: flex-start;
}

.cl__alldone {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.35rem;
  padding: 1.2rem 0.5rem;
}

.cl__alldone-icon {
  font-size: 2.2rem;
}

.cl__alldone-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-primary);
}

.cl__alldone-body {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  max-width: 320px;
}

.cl__elsewhere {
  align-self: center;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.3rem;
  cursor: pointer;
  text-decoration: underline;
}

.cl__picker-prompt {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cl__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
}

.cl__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  min-width: 0;
}

.cl__pick:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.cl__pick-crop {
  width: 100%;
}

.cl__pick-name {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.1;
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
