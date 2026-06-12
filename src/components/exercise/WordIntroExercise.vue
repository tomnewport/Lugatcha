<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Word } from '@/db/types'
import { pickIntroWords } from '@/exercises/words'
import { shuffle } from '@/exercises/validate'
import { useProgressStore } from '@/stores/progress'
import { db } from '@/db/useDb'
import { speakUzbek } from '@/audio/audio'
import AudioButton from '@/components/AudioButton.vue'
import UzbekWord from '@/components/UzbekWord.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'

type Step = 'listen' | 'quiz' | 'match' | 'phrases'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

const progress = useProgressStore()
const words = ref<Word[]>([])
const loading = ref(true)
const step = ref<Step>('listen')

// ── Step 1: Listen ────────────────────────────────────────────────────────────

const heard = ref(new Set<string>())
const allHeard = computed(
  () => words.value.length > 0 && words.value.every((w) => heard.value.has(w.id)),
)

function markHeard(wordId: string) {
  heard.value = new Set(heard.value).add(wordId)
}

function advanceFromListen() {
  buildQuiz()
  step.value = 'quiz'
}

// ── Step 2: Quiz (multiple-choice per word) ───────────────────────────────────

interface QuizOption {
  text: string
  correct: boolean
}
interface QuizQuestion {
  word: Word
  options: QuizOption[]
}

const quizQuestions = ref<QuizQuestion[]>([])
const quizIndex = ref(0)
const quizSelected = ref<string | null>(null)
const quizRevealed = ref(false)

const currentQuestion = computed(() => quizQuestions.value[quizIndex.value] ?? null)
const isLastQuestion = computed(() => quizIndex.value >= quizQuestions.value.length - 1)

function buildQuiz() {
  quizQuestions.value = words.value.map((word) => {
    const others = words.value.filter((w) => w.id !== word.id)
    const distractors = shuffle(others)
      .slice(0, 3)
      .map((w) => ({ text: w.english, correct: false }))
    return {
      word,
      options: shuffle([{ text: word.english, correct: true }, ...distractors]),
    }
  })
  quizIndex.value = 0
  quizSelected.value = null
  quizRevealed.value = false
}

function selectOption(text: string) {
  if (quizRevealed.value) return
  quizSelected.value = text
  quizRevealed.value = true
}

function nextQuestion() {
  if (!isLastQuestion.value) {
    quizIndex.value++
    quizSelected.value = null
    quizRevealed.value = false
  } else {
    step.value = 'match'
    initMatch()
  }
}

// ── Step 3: Matching ──────────────────────────────────────────────────────────

const matchLeft = ref<Word[]>([])
const matchRight = ref<Word[]>([])
const matchPairs = ref(new Map<string, string>())
const matchSelected = ref<{ side: 'left' | 'right'; id: string } | null>(null)
const matchChecked = ref(false)
const matchResults = ref(new Map<string, boolean>())

const matchPairedRight = computed(() => new Set(matchPairs.value.values()))
const matchAllPaired = computed(
  () => words.value.length > 0 && matchPairs.value.size === words.value.length,
)
const matchCorrectCount = computed(() => [...matchResults.value.values()].filter(Boolean).length)

function initMatch() {
  matchLeft.value = shuffle(words.value)
  matchRight.value = shuffle(words.value)
  matchPairs.value = new Map()
  matchSelected.value = null
  matchChecked.value = false
  matchResults.value = new Map()
}

const matchById = (id: string) => words.value.find((w) => w.id === id)!

interface MatchRow {
  left: Word
  right: Word | null
  matched: boolean
}

/** Matched pairs float to the top; remaining unmatched rows fill below. */
const matchRows = computed<MatchRow[]>(() => {
  const matched: MatchRow[] = [...matchPairs.value.entries()].map(([l, r]) => ({
    left: matchById(l),
    right: matchById(r),
    matched: true,
  }))
  const lefts = matchLeft.value.filter((w) => !matchPairs.value.has(w.id))
  const rights = matchRight.value.filter((w) => !matchPairedRight.value.has(w.id))
  const open: MatchRow[] = lefts.map((left, i) => ({ left, right: rights[i] ?? null, matched: false }))
  return [...matched, ...open]
})

interface MatchCell {
  key: string
  kind: 'left' | 'connector' | 'right'
  word: Word | null
  row: MatchRow
}

/** One keyed element per grid cell so TransitionGroup can FLIP-animate each. */
const matchCells = computed<MatchCell[]>(() =>
  matchRows.value.flatMap((row): MatchCell[] => [
    { key: `l-${row.left.id}`, kind: 'left', word: row.left, row },
    { key: `c-${row.left.id}`, kind: 'connector', word: null, row },
    {
      key: row.right ? `r-${row.right.id}` : `r-empty-${row.left.id}`,
      kind: 'right',
      word: row.right,
      row,
    },
  ]),
)

function matchUnpair(leftId: string) {
  const next = new Map(matchPairs.value)
  next.delete(leftId)
  matchPairs.value = next
}

function matchTap(side: 'left' | 'right', word: Word) {
  if (matchChecked.value) return
  if (side === 'left') void speakUzbek(word.uzbek)
  if (side === 'left' && matchPairs.value.has(word.id)) {
    matchUnpair(word.id)
    return
  }
  if (side === 'right' && matchPairedRight.value.has(word.id)) {
    const entry = [...matchPairs.value.entries()].find(([, r]) => r === word.id)
    if (entry) matchUnpair(entry[0])
    return
  }
  if (!matchSelected.value) {
    matchSelected.value = { side, id: word.id }
    return
  }
  if (matchSelected.value.side === side) {
    matchSelected.value = matchSelected.value.id === word.id ? null : { side, id: word.id }
    return
  }
  const leftId = side === 'left' ? word.id : matchSelected.value.id
  const rightId = side === 'right' ? word.id : matchSelected.value.id
  matchPairs.value = new Map(matchPairs.value).set(leftId, rightId)
  matchSelected.value = null
}

function isMatchSelected(side: 'left' | 'right', id: string) {
  return matchSelected.value?.side === side && matchSelected.value.id === id
}

function matchGradeClass(row: MatchRow): string {
  if (!matchChecked.value || !row.matched) return ''
  return matchResults.value.get(row.left.id) ? 'is-correct' : 'is-wrong'
}

async function checkMatch() {
  const graded = new Map<string, boolean>()
  for (const [leftId, rightId] of matchPairs.value) {
    graded.set(leftId, leftId === rightId)
  }
  matchResults.value = graded
  matchChecked.value = true
  await Promise.all(
    [...graded.entries()].map(([wordId, correct]) => progress.recordMatchResult(wordId, correct)),
  )
}

function retryMatch() {
  const correct = new Map<string, string>()
  for (const [leftId, rightId] of matchPairs.value) {
    if (matchResults.value.get(leftId)) correct.set(leftId, rightId)
  }
  matchPairs.value = correct
  matchChecked.value = false
  matchResults.value = new Map()
  matchSelected.value = null
}

async function advanceFromMatch() {
  await loadPhrases()
  step.value = 'phrases'
}

// ── Step 4: Phrases ───────────────────────────────────────────────────────────

interface Phrase {
  uzbek: string
  english: string
}

const phrases = ref<Phrase[]>([])
const phraseIndex = ref(0)
const phrasesLoading = ref(false)
const currentPhrase = computed(() => phrases.value[phraseIndex.value] ?? null)
const isLastPhrase = computed(() => phraseIndex.value >= phrases.value.length - 1)

async function loadPhrases() {
  phrasesLoading.value = true
  const roleplays = await db.roleplay.where('theme').equals(props.locationId).toArray()
  const pool: Phrase[] = []
  for (const rp of roleplays) {
    for (const variant of rp.variants) {
      for (const turn of variant.turns) {
        pool.push({ uzbek: turn.uzbek, english: turn.english })
      }
    }
  }
  if (pool.length === 0) {
    const stories = await db.stories.where('theme').equals(props.locationId).toArray()
    for (const story of stories) {
      for (const sentence of story.sentences) {
        pool.push({ uzbek: sentence.uzbek, english: sentence.english })
      }
    }
  }
  phrases.value = shuffle(pool).slice(0, 3)
  phraseIndex.value = 0
  phrasesLoading.value = false
}

function nextPhrase() {
  if (!isLastPhrase.value) {
    phraseIndex.value++
  } else {
    finish()
  }
}

// ── Mount & finish ────────────────────────────────────────────────────────────

onMounted(async () => {
  words.value = await pickIntroWords(props.locationId)
  loading.value = false
})

async function finish() {
  await progress.markWordsSeen(words.value.map((w) => w.id))
  emit('complete')
}
</script>

<template>
  <div class="intro">
    <p v-if="loading" class="intro__loading" aria-live="polite">Loading words…</p>

    <!-- ── Step 1: Listen ─────────────────────────────────────────────────── -->
    <template v-else-if="step === 'listen'">
      <p class="intro__instruction">
        Tap <strong>each speaker</strong> to hear the word before continuing.
      </p>

      <ul class="intro__cards">
        <li
          v-for="word in words"
          :key="word.id"
          class="word-card"
          :class="{ 'word-card--heard': heard.has(word.id) }"
        >
          <AudioButton :text="word.uzbek" @played="markHeard(word.id)" />
          <div class="word-card__text">
            <UzbekWord class="word-card__uzbek" :word="word.uzbek" :meaning="word.english" />
            <span class="word-card__english">{{ word.english }}</span>
            <span v-if="word.usageNotes" class="word-card__notes">{{ word.usageNotes }}</span>
          </div>
          <svg
            v-if="heard.has(word.id)"
            class="word-card__check"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M2.5 8l4 4 7-7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </li>
      </ul>

      <div class="intro__footer">
        <button
          class="btn btn--primary"
          type="button"
          :disabled="!allHeard"
          @click="advanceFromListen"
        >
          Continue
        </button>
      </div>
    </template>

    <!-- ── Step 2: Quiz ───────────────────────────────────────────────────── -->
    <template v-else-if="step === 'quiz' && currentQuestion">
      <p class="intro__step-label">Word {{ quizIndex + 1 }} of {{ quizQuestions.length }}</p>
      <p class="intro__instruction">What does this word mean?</p>

      <div class="quiz-card">
        <AudioButton :text="currentQuestion.word.uzbek" />
        <p class="quiz-card__word">
          <UzbekWord :word="currentQuestion.word.uzbek" />
        </p>
      </div>

      <ul class="quiz-options">
        <li v-for="opt in currentQuestion.options" :key="opt.text">
          <button
            class="quiz-option"
            :class="{
              'quiz-option--selected': quizSelected === opt.text && !quizRevealed,
              'quiz-option--correct': quizRevealed && opt.correct,
              'quiz-option--wrong': quizRevealed && quizSelected === opt.text && !opt.correct,
            }"
            type="button"
            :disabled="quizRevealed"
            @click="selectOption(opt.text)"
          >
            {{ opt.text }}
          </button>
        </li>
      </ul>

      <div v-if="quizRevealed" class="intro__footer">
        <button class="btn btn--primary" type="button" @click="nextQuestion">
          {{ isLastQuestion ? 'Continue to matching' : 'Next word' }}
        </button>
      </div>
    </template>

    <!-- ── Step 3: Matching ───────────────────────────────────────────────── -->
    <template v-else-if="step === 'match'">
      <p class="intro__instruction">Pair each Uzbek word with its English meaning.</p>

      <TransitionGroup name="match-move" tag="div" class="match-grid">
        <div v-for="cell in matchCells" :key="cell.key" class="match-cell">
          <span v-if="cell.kind === 'connector'" class="match-connector" aria-hidden="true">
            <span
              v-if="cell.row.matched"
              class="match-connector__line"
              :class="matchGradeClass(cell.row)"
            />
          </span>

          <button
            v-else-if="cell.word"
            class="match-card"
            :class="[
              matchGradeClass(cell.row),
              {
                'match-card--selected': isMatchSelected(cell.kind as 'left' | 'right', cell.word.id),
                'match-card--paired': cell.row.matched,
              },
            ]"
            type="button"
            @click="matchTap(cell.kind as 'left' | 'right', cell.word)"
          >
            <span v-if="cell.kind === 'left'" lang="uz">{{ cell.word.uzbek }}</span>
            <span v-else>{{ cell.word.english }}</span>
          </button>
        </div>
      </TransitionGroup>

      <p v-if="!matchChecked" class="intro__hint">
        Tap a card on each side to pair — tap a paired card to undo.
      </p>

      <p v-if="matchChecked" class="intro__score" aria-live="polite">
        {{ matchCorrectCount }} of {{ words.length }} correct
        <template v-if="matchCorrectCount === words.length"> — ajoyib! 🎉</template>
      </p>

      <div class="intro__footer">
        <button
          v-if="!matchChecked"
          class="btn btn--primary"
          type="button"
          :disabled="!matchAllPaired"
          @click="checkMatch"
        >
          Check matches
        </button>
        <template v-else>
          <button
            v-if="matchCorrectCount < words.length"
            class="btn btn--primary"
            type="button"
            @click="retryMatch"
          >
            Try again
          </button>
          <button class="btn btn--primary" type="button" @click="advanceFromMatch">
            Continue
          </button>
        </template>
      </div>
    </template>

    <!-- ── Step 4: Phrases ────────────────────────────────────────────────── -->
    <template v-else-if="step === 'phrases'">
      <p v-if="phrasesLoading" class="intro__loading" aria-live="polite">Loading phrases…</p>

      <template v-else-if="currentPhrase">
        <p class="intro__step-label">Phrase {{ phraseIndex + 1 }} of {{ phrases.length }}</p>
        <p class="intro__instruction">
          Listen and read. Tap any word to hear it or see its structure.
        </p>

        <div class="phrase-card">
          <AudioButton :text="currentPhrase.uzbek" large label="Play phrase" />
          <p class="phrase-card__uzbek">
            <UzbekSentence :uzbek="currentPhrase.uzbek" />
          </p>
          <div class="phrase-card__translation">
            <span class="phrase-card__translation-label">Translation</span>
            <p class="phrase-card__english">{{ currentPhrase.english }}</p>
          </div>
        </div>

        <div class="intro__footer">
          <button class="btn btn--primary" type="button" @click="nextPhrase">
            {{ isLastPhrase ? 'Finish' : 'Next phrase' }}
          </button>
        </div>
      </template>

      <div v-else class="intro__footer">
        <p class="intro__hint">No phrases available for this location yet.</p>
        <button class="btn btn--primary" type="button" @click="finish">Finish</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.intro {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.intro__instruction {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.intro__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.intro__step-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  margin: 0;
}

.intro__hint {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  text-align: center;
  font-style: italic;
  margin: 0;
}

.intro__score {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-primary);
  text-align: center;
  margin: 0;
}

.intro__footer {
  margin-top: auto;
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* ── Step 1: word cards ─────────────────────────────────────────────────────── */
.intro__cards {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.word-card {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.8rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease;
}

.word-card--heard {
  border-color: var(--color-teal);
}

.word-card__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.word-card__uzbek {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary);
}

.word-card__english {
  font-size: 0.9rem;
  color: var(--color-text);
}

.word-card__notes {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.word-card__check {
  width: 18px;
  height: 18px;
  color: var(--color-teal);
  flex-shrink: 0;
}

/* ── Step 2: quiz ───────────────────────────────────────────────────────────── */
.quiz-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.quiz-card__word {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
  text-align: center;
}

.quiz-options {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.quiz-option {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  text-align: left;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.quiz-option:not(:disabled):hover {
  border-color: var(--color-primary-light);
}

.quiz-option--selected {
  border-color: var(--color-primary);
  background: #f2f7fc;
}

.quiz-option--correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
}

.quiz-option--wrong {
  border-color: var(--color-terracotta);
  background: #fbf1ec;
}

/* ── Step 3: matching ───────────────────────────────────────────────────────── */
.match-grid {
  display: grid;
  grid-template-columns: 1fr 26px 1fr;
  row-gap: 0.6rem;
  align-items: stretch;
  position: relative;
}

/* FLIP reordering */
.match-move-move {
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.match-cell {
  display: flex;
  align-items: stretch;
  min-width: 0;
}

.match-cell > .match-card {
  flex: 1;
}

.match-cell > .match-connector {
  flex: 1;
}

.match-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  padding: 0.6rem 0.7rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: center;
  transition:
    transform 0.12s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.match-card:hover {
  transform: translateY(-1px);
}

.match-card--selected {
  border-color: var(--color-primary);
  background: #f2f7fc;
  box-shadow: 0 0 0 2px rgb(27 79 138 / 0.18);
}

.match-card--paired {
  border-color: var(--color-primary-light);
}

.match-card.is-correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
  animation: match-pop 0.3s ease;
}

.match-card.is-wrong {
  border-color: var(--color-terracotta);
  background: #fbf1ec;
  animation: match-shake 0.35s ease;
}

.match-connector {
  display: flex;
  align-items: center;
  min-height: 56px;
}

.match-connector__line {
  display: block;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: var(--color-primary-light);
  transform-origin: left center;
  animation: match-draw 0.35s ease;
}

.match-connector__line.is-correct {
  background: var(--color-teal);
}

.match-connector__line.is-wrong {
  background: var(--color-terracotta);
}

@keyframes match-draw {
  from { transform: scaleX(0); }
}

@keyframes match-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

@keyframes match-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

/* ── Step 4: phrases ────────────────────────────────────────────────────────── */
.phrase-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  padding: 1.5rem 1.2rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.phrase-card__uzbek {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
  gap: 0.2em;
}

.phrase-card__translation {
  width: 100%;
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.phrase-card__translation-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-muted);
}

.phrase-card__english {
  font-size: 0.95rem;
  color: var(--color-text);
  margin: 0;
  line-height: 1.4;
}
</style>
