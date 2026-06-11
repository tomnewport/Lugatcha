<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/db'
import type { Verdict } from '@/db/types'
import { setVerdict, getAllReviews, clearReviews } from '@/db/reviews'
import { getAudioManifest, isReviewed } from '@/audio/audio'
import {
  getCandidatesManifest,
  candidateUrl,
  buildReviewsJson,
  buildIssueUrl,
  type CandidateVariant,
  type ReviewRecord,
} from '@/audio/review'

interface Entry {
  key: string
  text: string
  variants: CandidateVariant[]
}

const router = useRouter()

const loading = ref(true)
const hadCandidates = ref(false)
const entries = ref<Entry[]>([])
const index = ref(0)
// key -> (profile id -> verdict)
const verdicts = reactive<Record<string, Record<string, Verdict>>>({})

const entry = computed<Entry | undefined>(() => entries.value[index.value])
const total = computed(() => entries.value.length)
const reviewedCount = computed(
  () => Object.values(verdicts).filter((v) => Object.keys(v).length > 0).length,
)
const records = computed<ReviewRecord[]>(() =>
  entries.value
    .filter((e) => verdicts[e.key] && Object.keys(verdicts[e.key]).length > 0)
    .map((e) => ({ key: e.key, text: e.text, verdicts: { ...verdicts[e.key] } })),
)

function shuffle<T>(items: T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

onMounted(async () => {
  const [candidates, manifest, saved] = await Promise.all([
    getCandidatesManifest(),
    getAudioManifest(),
    getAllReviews(db),
  ])
  for (const r of saved) verdicts[r.key] = { ...r.verdicts }
  // Words whose canonical clip is already reviewed drop out of the queue.
  const reviewed = new Set(
    manifest
      ? Object.entries(manifest)
          .filter(([, entry]) => isReviewed(entry))
          .map(([key]) => key)
      : [],
  )
  if (candidates) {
    hadCandidates.value = Object.keys(candidates).length > 0
    entries.value = Object.entries(candidates)
      .filter(([key]) => !reviewed.has(key))
      .map(([key, e]) => ({
        key,
        text: e.text,
        variants: shuffle(e.variants), // blind: position shouldn't bias
      }))
  }
  loading.value = false
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  stop()
})

// --- playback ---------------------------------------------------------------
let current: HTMLAudioElement | null = null
const playingFile = ref<string | null>(null)

function play(file: string) {
  stop()
  const audio = new Audio(candidateUrl(file))
  current = audio
  playingFile.value = file
  const clear = () => {
    if (current === audio) playingFile.value = null
  }
  audio.onended = clear
  audio.onerror = clear
  audio.play().catch(clear)
}

function stop() {
  if (current) {
    current.pause()
    current = null
  }
  playingFile.value = null
}

// --- rating -----------------------------------------------------------------
function verdictOf(key: string, profileId: string): Verdict | undefined {
  return verdicts[key]?.[profileId]
}

async function rate(profileId: string, verdict: Verdict) {
  const e = entry.value
  if (!e) return
  const cur = verdicts[e.key]?.[profileId]
  const next: Verdict | null = cur === verdict ? null : verdict
  if (!verdicts[e.key]) verdicts[e.key] = {}
  if (next === null) delete verdicts[e.key][profileId]
  else verdicts[e.key][profileId] = next
  if (Object.keys(verdicts[e.key]).length === 0) delete verdicts[e.key]
  await setVerdict(db, e.key, profileId, next)
}

function next() {
  if (index.value < total.value - 1) {
    index.value++
    stop()
  }
}
function prev() {
  if (index.value > 0) {
    index.value--
    stop()
  }
}

function onKey(event: KeyboardEvent) {
  const e = entry.value
  if (!e) return
  const vs = e.variants
  const k = event.key.toLowerCase()
  const playKeys: Record<string, number> = { '1': 0, '2': 1, '3': 2 }
  const goodKeys: Record<string, number> = { q: 0, w: 1, e: 2 }
  const badKeys: Record<string, number> = { a: 0, s: 1, d: 2 }
  if (k in playKeys && vs[playKeys[k]]) play(vs[playKeys[k]].file)
  else if (k in goodKeys && vs[goodKeys[k]]) rate(vs[goodKeys[k]].id, 'good')
  else if (k in badKeys && vs[badKeys[k]]) rate(vs[badKeys[k]].id, 'bad')
  else if (k === 'arrowright' || k === 'enter') next()
  else if (k === 'arrowleft') prev()
  else return
  event.preventDefault()
}

// --- export -----------------------------------------------------------------
function downloadJson() {
  const blob = new Blob([buildReviewsJson(records.value)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'reviews.json'
  a.click()
  URL.revokeObjectURL(url)
}

function openIssue() {
  window.open(buildIssueUrl(records.value), '_blank', 'noopener')
}

const confirmingClear = ref(false)
async function resetReviews() {
  await clearReviews(db)
  for (const key of Object.keys(verdicts)) delete verdicts[key]
  confirmingClear.value = false
}
</script>

<template>
  <main class="review">
    <header class="review__bar">
      <button class="back-btn" type="button" @click="router.push('/settings')">‹ Settings</button>
      <span v-if="total" class="review__progress">
        {{ index + 1 }} / {{ total }} · {{ reviewedCount }} rated
      </span>
    </header>

    <p v-if="loading" class="review__msg">Loading candidates…</p>

    <template v-else-if="!total && hadCandidates">
      <h1 class="review__title">All caught up ✓</h1>
      <p class="review__msg">Every word with candidates has been reviewed. Nothing left to rate.</p>
    </template>

    <template v-else-if="!total">
      <h1 class="review__title">No candidates found</h1>
      <p class="review__msg">
        Generate them first, then reload:
        <code>uv run python scripts/generate_audio.py --candidates</code>
        — it writes <code>public/audio/candidates/</code>.
      </p>
    </template>

    <template v-else-if="entry">
      <section class="word-card">
        <p class="word-card__label">Rate each — does it say the word cleanly?</p>
        <h1 class="word-card__text">{{ entry.text }}</h1>

        <ul class="variants">
          <li v-for="(v, i) in entry.variants" :key="v.id" class="variant">
            <button
              class="variant__play"
              :class="{ 'variant__play--on': playingFile === v.file }"
              type="button"
              :aria-label="`Play candidate ${i + 1}`"
              @click="play(v.file)"
            >
              ▶ {{ i + 1 }}
            </button>
            <div class="variant__rate">
              <button
                class="rate rate--good"
                :class="{ 'rate--active': verdictOf(entry.key, v.id) === 'good' }"
                type="button"
                @click="rate(v.id, 'good')"
              >
                Good
              </button>
              <button
                class="rate rate--bad"
                :class="{ 'rate--active': verdictOf(entry.key, v.id) === 'bad' }"
                type="button"
                @click="rate(v.id, 'bad')"
              >
                Bad
              </button>
            </div>
          </li>
        </ul>

        <div class="nav">
          <button class="btn btn--ghost" type="button" :disabled="index === 0" @click="prev">
            ‹ Prev
          </button>
          <button
            class="btn btn--primary"
            type="button"
            :disabled="index >= total - 1"
            @click="next"
          >
            Next ›
          </button>
        </div>
        <p class="word-card__keys">
          Keys: <kbd>1/2/3</kbd> play · <kbd>Q/W/E</kbd> good · <kbd>A/S/D</kbd> bad ·
          <kbd>→</kbd> next
        </p>
      </section>

      <section class="finish">
        <h2 class="finish__title">Finish</h2>
        <p class="finish__desc">{{ records.length }} words rated so far.</p>
        <div class="finish__actions">
          <button
            class="btn btn--primary"
            type="button"
            :disabled="!records.length"
            @click="downloadJson"
          >
            Download reviews.json
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            :disabled="!records.length"
            @click="openIssue"
          >
            Open GitHub issue
          </button>
        </div>
        <p class="finish__note">
          Download the JSON (full data), then open the issue and drag the file in if it asks.
        </p>
        <button
          v-if="!confirmingClear"
          class="finish__reset"
          type="button"
          @click="confirmingClear = true"
        >
          Reset all reviews…
        </button>
        <span v-else class="finish__confirm">
          Sure?
          <button class="btn btn--danger" type="button" @click="resetReviews">Yes</button>
          <button class="btn btn--ghost" type="button" @click="confirmingClear = false">No</button>
        </span>
      </section>
    </template>
  </main>
</template>

<style scoped>
.review {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.25rem 2rem;
  background: var(--color-bg);
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
}

.review__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.back-btn {
  padding: 0.4rem 0.75rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
}

.review__progress {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.review__title {
  font-size: 1.4rem;
  color: var(--color-primary);
  margin: 0;
}

.review__msg {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.review__msg code {
  display: inline-block;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.1rem 0.35rem;
  font-size: 0.8rem;
}

.word-card,
.finish {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.word-card__label {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin: 0;
}

.word-card__text {
  font-size: 1.7rem;
  font-weight: 800;
  color: var(--color-text);
  margin: 0;
  word-break: break-word;
}

.variants {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.variant {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.variant__play {
  flex-shrink: 0;
  width: 56px;
  padding: 0.6rem 0;
  font-weight: 700;
  font-size: 0.95rem;
  background: var(--color-bg);
  color: var(--color-primary);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.variant__play--on {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.variant__rate {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
  flex: 1;
}

.rate {
  padding: 0.6rem 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.rate--good.rate--active {
  background: var(--color-teal, #1aa179);
  border-color: var(--color-teal, #1aa179);
  color: #fff;
}

.rate--bad.rate--active {
  background: var(--color-terracotta, #d4663b);
  border-color: var(--color-terracotta, #d4663b);
  color: #fff;
}

.nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.btn {
  padding: 0.6rem 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
}

.btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.btn--danger {
  background: var(--color-terracotta, #d4663b);
  border-color: var(--color-terracotta, #d4663b);
  color: #fff;
}

.btn:disabled {
  opacity: 0.45;
}

.word-card__keys {
  font-size: 0.74rem;
  color: var(--color-text-muted);
  margin: 0;
}

.word-card__keys kbd {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 0.25rem;
  font-size: 0.72rem;
}

.finish__title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
}

.finish__desc,
.finish__note {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin: 0;
}

.finish__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.finish__reset {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--color-terracotta, #d4663b);
  font-size: 0.82rem;
  padding: 0;
}

.finish__confirm {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}
</style>
