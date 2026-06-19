<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Word } from '@/db/types'
import { foldTyping, typingTarget } from '@/exercises/test'
import { useContentLang } from '@/i18n/content'
import UzbekKeyboard from './UzbekKeyboard.vue'

const props = defineProps<{ word: Word }>()
const emit = defineEmits<{ answered: [correct: boolean] }>()
const { gloss } = useContentLang()

/** Display spelling and its folded form for matching. */
const target = computed(() => typingTarget(props.word.uzbek))
const folded = computed(() => foldTyping(target.value))
/** Characters the learner actually has to press (spaces auto-fill). */
const charCount = computed(() => folded.value.replace(/ /g, '').length)

const typed = ref('') // folded text entered so far
const litKeys = ref<string[] | null>(null)
const hintsUsed = ref(0)
const status = ref<'typing' | 'passed' | 'failed'>('typing')

/** One hint press allowed per character; depleting the bar fails the question. */
const hintBudget = computed(() => charCount.value)
const hintsLeft = computed(() => Math.max(0, hintBudget.value - hintsUsed.value))

onMounted(() => advancePastSpaces())

/** Spaces are filled automatically so the learner never types them. */
function advancePastSpaces() {
  while (folded.value[typed.value.length] === ' ') {
    typed.value += ' '
  }
}

/** The visible word so far, in the target's own (cased) spelling. */
const shownText = computed(() => target.value.slice(0, typed.value.length))
const remaining = computed(() => folded.value.slice(typed.value.length))

const ALL_KEYS = ['a','b','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','x','y','z','oʻ','gʻ','ʼ','sh','ch','ng',' ']

/** Keys whose one press keeps the answer on track from where we are now. */
function validNextKeys(): string[] {
  return ALL_KEYS.filter((k) => folded.value.startsWith(typed.value + foldTyping(k)))
}

function press(value: string) {
  if (status.value !== 'typing') return
  const candidate = typed.value + foldTyping(value)
  if (!folded.value.startsWith(candidate)) return // wrong key — quietly ignored
  typed.value = candidate
  litKeys.value = null // brighten the whole keyboard again for the next letter
  advancePastSpaces()
  if (typed.value === folded.value) {
    status.value = 'passed'
    emit('answered', true)
  }
}

function useHint() {
  if (status.value !== 'typing' || hintsLeft.value === 0) return
  hintsUsed.value++
  if (hintsUsed.value >= hintBudget.value) {
    status.value = 'failed'
    litKeys.value = null
    emit('answered', false)
    return
  }
  // Each press cuts the *currently lit* keys down to about a third — always
  // keeping the key(s) that actually come next — so repeated hints close in:
  // the full board narrows to roughly nine keys, then three, then the one key.
  const valid = new Set(validNextKeys())
  const current = litKeys.value ?? ALL_KEYS
  const keep = Math.max(valid.size, Math.floor(current.length / 3))
  const others = current.filter((k) => !valid.has(k)).sort(() => Math.random() - 0.5)
  while (valid.size < keep && others.length) valid.add(others.pop()!)
  litKeys.value = [...valid]
}
</script>

<template>
  <div class="type-q">
    <p class="type-q__instruction">{{ $t('exercise.type.prompt') }}</p>
    <p class="type-q__english">{{ gloss(word) }}</p>

    <div class="type-q__answer" :class="`type-q__answer--${status}`" lang="uz" aria-live="polite">
      <span class="type-q__typed">{{ shownText }}</span>
      <span v-if="status === 'typing'" class="type-q__caret" aria-hidden="true" />
      <span v-for="(_, i) in remaining" :key="i" class="type-q__slot" aria-hidden="true" />
    </div>

    <p v-if="status === 'failed'" class="type-q__reveal" lang="uz">{{ target }}</p>

    <UzbekKeyboard :lit-keys="litKeys" :disabled="status !== 'typing'" @press="press" />

    <!-- Hint meter and its trigger live together so it reads as one control:
         tapping the button spends a segment of the bar beside it. -->
    <div class="type-q__hint">
      <span
        class="type-q__hinticon"
        role="img"
        tabindex="0"
        :title="$t('exercise.type.hintExplainer')"
        :aria-label="$t('exercise.type.hintExplainer')"
      >
        <span class="type-q__hinticon-kb" aria-hidden="true">⌨️</span>
        <span class="type-q__hinticon-bolt" aria-hidden="true">⚡</span>
      </span>
      <div class="type-q__hintbar" :aria-label="$t('exercise.type.hintsLeft', { count: hintsLeft })">
        <span
          v-for="i in hintBudget"
          :key="i"
          class="type-q__hintseg"
          :class="{ 'type-q__hintseg--spent': i > hintsLeft }"
        />
      </div>
      <button
        class="btn btn--ghost type-q__hintbtn"
        type="button"
        :disabled="status !== 'typing' || hintsLeft === 0"
        @click="useHint"
      >
        {{ $t('exercise.type.hint', { count: hintsLeft }) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.type-q {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  flex: 1;
}

.type-q__instruction {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.type-q__english {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--color-primary);
  text-align: center;
  margin: 0;
}

.type-q__answer {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  min-height: 2.4rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
}

.type-q__answer--passed {
  color: var(--color-teal);
}

.type-q__answer--failed {
  color: var(--color-terracotta);
}

.type-q__slot {
  width: 14px;
  border-bottom: 3px solid var(--color-border);
  margin-bottom: 4px;
}

.type-q__caret {
  width: 2px;
  height: 1.5rem;
  background: var(--color-primary);
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.type-q__reveal {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-terracotta);
  margin: 0;
}

.type-q__hint {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  max-width: 340px;
}

.type-q__hinticon {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  font-size: 1.05rem;
  line-height: 1;
  cursor: help;
}

.type-q__hinticon-bolt {
  position: absolute;
  top: -3px;
  right: -5px;
  font-size: 0.7rem;
  filter: drop-shadow(0 0 1px var(--color-surface));
}

.type-q__hintbar {
  display: flex;
  gap: 3px;
  flex: 1;
  height: 7px;
}

.type-q__hintseg {
  flex: 1;
  border-radius: 3px;
  background: var(--color-gold);
  transition: background-color 0.25s ease;
}

.type-q__hintseg--spent {
  background: var(--color-border);
}

.type-q__hintbtn {
  flex-shrink: 0;
  font-size: 0.9rem;
  padding: 0.5rem 1rem;
}
</style>
