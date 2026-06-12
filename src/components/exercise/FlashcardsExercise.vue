<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Word } from '@/db/types'
import { pickFlashcardWords } from '@/exercises/words'
import { shuffle } from '@/exercises/validate'
import { useProgressStore } from '@/stores/progress'
import { speakUzbek } from '@/audio/audio'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

const progress = useProgressStore()

const words = ref<Word[]>([])
const leftOrder = ref<Word[]>([])
const rightOrder = ref<Word[]>([])
/** Sound-only mode: the Uzbek column plays audio instead of showing text. */
const soundMode = ref(false)
const loading = ref(true)

/** rightWordId keyed by leftWordId, in match order. */
const pairs = ref(new Map<string, string>())
const selected = ref<{ side: 'left' | 'right'; id: string } | null>(null)
const checked = ref(false)
/** Per-left-word correctness after checking. */
const results = ref(new Map<string, boolean>())

onMounted(async () => {
  words.value = await pickFlashcardWords(props.locationId)
  leftOrder.value = shuffle(words.value)
  rightOrder.value = shuffle(words.value)
  soundMode.value = Math.random() < 0.4
  loading.value = false
})

const byId = (id: string) => words.value.find((w) => w.id === id)!
const pairedRight = computed(() => new Set(pairs.value.values()))
const allPaired = computed(() => words.value.length > 0 && pairs.value.size === words.value.length)
const correctCount = computed(() => [...results.value.values()].filter(Boolean).length)

interface Row {
  left: Word
  right: Word | null
  matched: boolean
}

/**
 * Matched pairs float to the top, side by side; unmatched cards fill the
 * rows below. TransitionGroup animates every reshuffle.
 */
const rows = computed<Row[]>(() => {
  const matched: Row[] = [...pairs.value.entries()].map(([l, r]) => ({
    left: byId(l),
    right: byId(r),
    matched: true,
  }))
  const lefts = leftOrder.value.filter((w) => !pairs.value.has(w.id))
  const rights = rightOrder.value.filter((w) => !pairedRight.value.has(w.id))
  const open: Row[] = lefts.map((left, i) => ({ left, right: rights[i] ?? null, matched: false }))
  return [...matched, ...open]
})

interface Cell {
  key: string
  kind: 'left' | 'connector' | 'right'
  word: Word | null
  row: Row
}

/** One keyed element per grid cell so TransitionGroup can FLIP-animate each. */
const cells = computed<Cell[]>(() =>
  rows.value.flatMap((row): Cell[] => [
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

function unmatch(leftId: string) {
  const next = new Map(pairs.value)
  next.delete(leftId)
  pairs.value = next
}

function tap(side: 'left' | 'right', word: Word) {
  if (checked.value) return

  if (side === 'left') void speakUzbek(word.uzbek)

  // Tapping a matched card dissolves that pair
  if (side === 'left' && pairs.value.has(word.id)) {
    unmatch(word.id)
    return
  }
  if (side === 'right' && pairedRight.value.has(word.id)) {
    const entry = [...pairs.value.entries()].find(([, r]) => r === word.id)
    if (entry) unmatch(entry[0])
    return
  }

  if (!selected.value) {
    selected.value = { side, id: word.id }
    return
  }
  if (selected.value.side === side) {
    selected.value = selected.value.id === word.id ? null : { side, id: word.id }
    return
  }
  // Opposite sides: form the pair
  const leftId = side === 'left' ? word.id : selected.value.id
  const rightId = side === 'right' ? word.id : selected.value.id
  pairs.value = new Map(pairs.value).set(leftId, rightId)
  selected.value = null
}

function isSelected(side: 'left' | 'right', id: string): boolean {
  return selected.value?.side === side && selected.value.id === id
}

async function check() {
  const graded = new Map<string, boolean>()
  for (const [leftId, rightId] of pairs.value) {
    graded.set(leftId, leftId === rightId)
  }
  results.value = graded
  checked.value = true
  await Promise.all(
    [...graded.entries()].map(([wordId, correct]) => progress.recordMatchResult(wordId, correct)),
  )
}

function gradeClass(row: Row): string {
  if (!checked.value || !row.matched) return ''
  return results.value.get(row.left.id) ? 'is-correct' : 'is-wrong'
}
</script>

<template>
  <div class="flashcards">
    <p class="flashcards__instruction">
      <template v-if="soundMode"
        >Listen, then pair each <strong>sound</strong> with its English meaning.</template
      >
      <template v-else>Pair each <strong>Uzbek</strong> word with its English meaning.</template>
    </p>

    <p v-if="loading" class="flashcards__loading" aria-live="polite">Loading cards…</p>

    <TransitionGroup v-else name="match" tag="div" class="flashcards__grid">
      <div v-for="cell in cells" :key="cell.key" class="cell">
        <span v-if="cell.kind === 'connector'" class="connector" aria-hidden="true">
          <span v-if="cell.row.matched" class="connector__line" :class="gradeClass(cell.row)" />
        </span>

        <button
          v-else-if="cell.word"
          class="card"
          :class="[
            gradeClass(cell.row),
            {
              'card--selected': isSelected(cell.kind, cell.word.id),
              'card--matched': cell.row.matched,
            },
          ]"
          type="button"
          @click="tap(cell.kind, cell.word)"
        >
          <template v-if="cell.kind === 'left'">
            <svg v-if="soundMode" class="card__speaker" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round" />
            </svg>
            <span v-else lang="uz">{{ cell.word.uzbek }}</span>
          </template>
          <span v-else>{{ cell.word.english }}</span>
        </button>
      </div>
    </TransitionGroup>

    <p v-if="!checked && !loading" class="flashcards__hint">
      Tap a card on each side to pair it — tap a pair to undo it.
    </p>

    <p v-if="checked" class="flashcards__score" aria-live="polite">
      {{ correctCount }} of {{ words.length }} correct
      <template v-if="correctCount === words.length"> — ajoyib! 🎉</template>
    </p>

    <div class="flashcards__footer">
      <button
        v-if="!checked"
        class="btn btn--primary"
        type="button"
        :disabled="!allPaired"
        @click="check"
      >
        Check matches
      </button>
      <button v-else class="btn btn--primary" type="button" @click="emit('complete')">
        Continue
      </button>
    </div>
  </div>
</template>

<style scoped>
.flashcards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.flashcards__instruction {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.flashcards__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.flashcards__grid {
  display: grid;
  grid-template-columns: 1fr 26px 1fr;
  row-gap: 0.6rem;
  align-items: stretch;
  position: relative;
}

/* FLIP reordering */
.match-move {
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.cell {
  display: flex;
  align-items: stretch;
  min-width: 0;
}

.cell > .card {
  flex: 1;
}

.cell > .connector {
  flex: 1;
}

.card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 56px;
  padding: 0.6rem 0.7rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.12s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
  text-align: center;
}

.card:hover {
  transform: translateY(-1px);
}

.card--selected {
  border-color: var(--color-primary);
  background: #f2f7fc;
  box-shadow: 0 0 0 2px rgb(27 79 138 / 0.18);
}

.card--matched {
  border-color: var(--color-primary-light);
}

.card.is-correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
  animation: pop 0.3s ease;
}

.card.is-wrong {
  border-color: var(--color-terracotta);
  background: #fbf1ec;
  animation: shake 0.35s ease;
}

.connector {
  display: flex;
  align-items: center;
  min-height: 56px;
}

.connector__line {
  display: block;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: var(--color-primary-light);
  transform-origin: left center;
  animation: draw 0.35s ease;
}

.connector__line.is-correct {
  background: var(--color-teal);
}

.connector__line.is-wrong {
  background: var(--color-terracotta);
}

@keyframes draw {
  from {
    transform: scaleX(0);
  }
}

@keyframes pop {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}

.flashcards__hint {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  text-align: center;
  font-style: italic;
  margin: 0;
}

.flashcards__score {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-primary);
  text-align: center;
  margin: 0;
}

.flashcards__footer {
  margin-top: auto;
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
}

.card__speaker {
  width: 20px;
  height: 20px;
  color: var(--color-primary);
}
</style>
