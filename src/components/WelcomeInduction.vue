<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLiveQuery, db } from '@/db/useDb'
import { WELCOME_CENTER_ID } from '@/db/progress'

/**
 * The city's front door. It inducts a new learner — explaining how an area of
 * the city works — and teaches the handful of survival words everyone needs.
 * It stays available afterwards as a place to refresh those basics.
 */
const emit = defineEmits<{ start: [] }>()

const router = useRouter()

const stats = useLiveQuery(
  async () => {
    const words = await db.words.where('theme').equals(WELCOME_CENTER_ID).toArray()
    const progress = await db.wordProgress.bulkGet(words.map((w) => w.id))
    return { seen: progress.filter((p) => p?.seenAt).length, total: words.length }
  },
  { seen: 0, total: 0 },
)

const complete = computed(() => stats.value.total > 0 && stats.value.seen >= stats.value.total)
const started = computed(() => stats.value.seen > 0)
const fraction = computed(() =>
  stats.value.total ? Math.min(1, stats.value.seen / stats.value.total) : 0,
)

const STEPS = [
  { icon: '🏙️', key: 'tap' },
  { icon: '🎲', key: 'activities' },
  { icon: '⭕', key: 'ring' },
  { icon: '🎓', key: 'meta' },
] as const

function goToCity() {
  router.push('/')
}
</script>

<template>
  <main class="welcome">
    <button class="back-btn" :aria-label="$t('common.backToCity')" type="button" @click="goToCity">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ $t('common.city') }}
    </button>

    <div class="welcome__body">
      <header class="welcome__hero">
        <span class="welcome__badge" aria-hidden="true">🛎️</span>
        <h1 class="welcome__title">{{ $t('welcome.title') }}</h1>
        <p class="welcome__subtitle">{{ $t('welcome.subtitle') }}</p>
        <p class="welcome__intro">{{ $t('welcome.intro') }}</p>
      </header>

      <section class="progress-card" :class="{ 'progress-card--done': complete }">
        <div class="progress-card__top">
          <span class="progress-card__label">{{
            $t('welcome.progress', { seen: stats.seen, total: stats.total })
          }}</span>
          <span v-if="complete" class="progress-card__check" aria-hidden="true">✓</span>
        </div>
        <div
          class="progress-card__bar"
          role="progressbar"
          :aria-valuenow="stats.seen"
          :aria-valuemin="0"
          :aria-valuemax="stats.total"
        >
          <span class="progress-card__fill" :style="{ width: `${fraction * 100}%` }" />
        </div>

        <p v-if="complete" class="progress-card__done-text">{{ $t('welcome.completeTitle') }}</p>

        <div class="progress-card__actions">
          <button
            v-if="!complete"
            class="btn btn--primary"
            type="button"
            @click="emit('start')"
          >
            {{ started ? $t('welcome.continue') : $t('welcome.start') }}
          </button>
          <template v-else>
            <button class="btn btn--primary" type="button" @click="goToCity">
              {{ $t('welcome.toCity') }}
            </button>
            <button class="btn btn--ghost" type="button" @click="emit('start')">
              {{ $t('welcome.refresh') }}
            </button>
          </template>
        </div>
      </section>

      <p v-if="complete" class="welcome__complete-body">{{ $t('welcome.completeBody') }}</p>

      <section class="how">
        <h2 class="how__title">{{ $t('welcome.howTitle') }}</h2>
        <ul class="how__list">
          <li v-for="step in STEPS" :key="step.key" class="how__item">
            <span class="how__icon" aria-hidden="true">{{ step.icon }}</span>
            <div class="how__text">
              <h3 class="how__heading">{{ $t(`welcome.steps.${step.key}Title`) }}</h3>
              <p class="how__body">{{ $t(`welcome.steps.${step.key}Body`) }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.welcome {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem 3rem;
  background: var(--color-bg);
  gap: 1.25rem;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem 0.4rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
  align-self: flex-start;
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.back-btn:hover {
  box-shadow: var(--shadow-md);
}

.welcome__body {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.welcome__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  text-align: center;
}

.welcome__badge {
  font-size: 2.6rem;
  line-height: 1;
}

.welcome__title {
  font-size: clamp(1.6rem, 6vw, 2.1rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.welcome__subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 0;
}

.welcome__intro {
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--color-text);
  margin: 0.4rem 0 0;
}

/* Progress + primary call to action */
.progress-card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1rem 1.1rem 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.progress-card--done {
  border-color: var(--color-gold);
  background: #fffcf0;
}

.progress-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-card__label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.progress-card__check {
  color: var(--color-gold);
  font-weight: 800;
}

.progress-card__bar {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--color-border);
  overflow: hidden;
}

.progress-card__fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--color-gold);
  transition: width 0.35s ease;
}

.progress-card__done-text {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.progress-card__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.2rem;
}

.welcome__complete-body {
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--color-text);
  margin: -0.4rem 0 0;
  text-align: center;
}

/* How the city works */
.how__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0 0 0.75rem;
  text-align: center;
}

.how__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.how__item {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 0.8rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.how__icon {
  font-size: 1.5rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.how__text {
  min-width: 0;
}

.how__heading {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.2rem;
}

.how__body {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text-muted);
  margin: 0;
}
</style>
