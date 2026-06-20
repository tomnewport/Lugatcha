<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Word } from '@/db/types'
import { foldTyping, typingTarget } from '@/exercises/test'
import { useContentLang } from '@/i18n/content'
import { speakUzbek } from '@/audio/audio'
import UzbekKeyboard from './UzbekKeyboard.vue'

const props = defineProps<{ word: Word }>()
/** Reports the spelling score: 1 for a tip-free spelling, down to 0 (gave up). */
const emit = defineEmits<{ answered: [score: number] }>()
const { gloss } = useContentLang()

/** Display spelling and its folded form for matching. */
const target = computed(() => typingTarget(props.word.uzbek))
const folded = computed(() => foldTyping(target.value))
/** Tips available — roughly one per letter; spending them all drains the bar. */
const tipBudget = computed(() => Math.max(1, folded.value.replace(/\s/g, '').length))

const keys = ref<string[]>([]) // pressed keys, kept as units so backspace is clean
const tipsUsed = ref(0)
const litKeys = ref<string[] | null>(null)
const status = ref<'typing' | 'passed' | 'failed'>('typing')
const score = ref(0)

const typed = computed(() => keys.value.join(''))
const foldedTyped = computed(() => foldTyping(typed.value))
/** Whether what's typed so far is still a correct prefix of the target. */
const onTrack = computed(() => folded.value.startsWith(foldedTyped.value))
const offTrack = computed(() => foldedTyped.value.length > 0 && !onTrack.value)
/** How much of the target the typing matches from the start (the tip anchor). */
const correctLen = computed(() => {
  const a = foldedTyped.value
  const b = folded.value
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
})

const tipsLeft = computed(() => Math.max(0, tipBudget.value - tipsUsed.value))
/** Continuous fill of the tip bar, 0–1; also the score if spelled right now. */
const meterPct = computed(() => tipsLeft.value / tipBudget.value)
const scorePercent = computed(() => Math.round(score.value * 100))

const answerClass = computed(() => `type-q__answer--${status.value}`)

const ALL_KEYS = [
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t',
  'u','v','w','x','y','z','oʻ','gʻ','ʼ','sh','ch','ng',' ',
]

/** Keys whose press would extend the correct prefix by one step. */
function validNextKeys(): string[] {
  const prefix = folded.value.slice(0, correctLen.value)
  return ALL_KEYS.filter((k) => folded.value.startsWith(prefix + foldTyping(k)))
}

function press(value: string) {
  if (status.value !== 'typing') return
  keys.value.push(value)
  litKeys.value = null // a tip lasts one keystroke, then the board reopens
  if (foldedTyped.value === folded.value) {
    score.value = meterPct.value
    finish('passed')
  }
}

function backspace() {
  if (status.value !== 'typing') return
  keys.value.pop()
  litKeys.value = null
}

/** The hint button: spends a tip to narrow the keyboard, or — once the bar is
 *  empty — gives up, revealing the answer and scoring the attempt zero. */
function useTip() {
  if (status.value !== 'typing') return
  if (tipsLeft.value === 0) {
    score.value = 0
    finish('failed')
    return
  }
  tipsUsed.value++
  // Each tip cuts the lit keys down toward the one(s) that come next, so
  // repeated tips close in: the full board narrows to a few keys, then one.
  const valid = new Set(validNextKeys())
  const current = litKeys.value ?? ALL_KEYS
  const keep = Math.max(valid.size, Math.floor(current.length / 3))
  const others = current.filter((k) => !valid.has(k)).sort(() => Math.random() - 0.5)
  while (valid.size < keep && others.length) valid.add(others.pop()!)
  litKeys.value = [...valid]
}

function finish(result: 'passed' | 'failed') {
  status.value = result
  litKeys.value = null
  void speakUzbek(props.word.uzbek) // read the word aloud the moment it's revealed
  emit('answered', score.value)
}
</script>

<template>
  <div class="type-q">
    <p class="type-q__instruction">{{ $t('exercise.type.prompt') }}</p>
    <p class="type-q__english">{{ gloss(word) }}</p>

    <div class="type-q__answer" :class="answerClass" lang="uz" aria-live="polite">
      <template v-if="status === 'typing'">
        <span class="type-q__typed" :class="{ 'type-q__typed--off': offTrack }">{{ typed }}</span>
        <span class="type-q__caret" aria-hidden="true" />
      </template>
      <span v-else class="type-q__typed">{{ target }}</span>
    </div>

    <p
      v-if="status !== 'typing'"
      class="type-q__score"
      :class="score >= 1 ? 'type-q__score--full' : 'type-q__score--partial'"
    >
      {{ $t('exercise.type.score', { percent: scorePercent }) }}
    </p>

    <UzbekKeyboard
      :lit-keys="litKeys"
      :disabled="status !== 'typing'"
      @press="press"
      @backspace="backspace"
    />

    <!-- The tip meter and its trigger are one control: each tip drains the bar
         and lowers the score it would award; emptying it turns the button into
         a give-up that reveals the answer. -->
    <div class="type-q__hint">
      <span
        class="type-q__hinticon"
        role="img"
        tabindex="0"
        :title="$t('exercise.type.tipExplainer')"
        :aria-label="$t('exercise.type.tipExplainer')"
      >
        <span class="type-q__hinticon-kb" aria-hidden="true">⌨️</span>
        <span class="type-q__hinticon-bolt" aria-hidden="true">⚡</span>
      </span>
      <div
        class="type-q__tipbar"
        role="meter"
        :aria-valuenow="Math.round(meterPct * 100)"
        :aria-label="$t('exercise.type.tipMeter', { percent: Math.round(meterPct * 100) })"
      >
        <span class="type-q__tipfill" :style="{ width: `${meterPct * 100}%` }" />
      </div>
      <button
        class="btn btn--ghost type-q__tipbtn"
        :class="{ 'type-q__tipbtn--pass': tipsLeft === 0 }"
        type="button"
        :disabled="status !== 'typing'"
        @click="useTip"
      >
        {{ tipsLeft > 0 ? $t('exercise.type.useTip') : $t('exercise.type.pass') }}
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

.type-q__typed--off {
  color: var(--color-terracotta);
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

.type-q__score {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
}

.type-q__score--full {
  color: var(--color-teal);
}

.type-q__score--partial {
  color: var(--color-gold);
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

.type-q__tipbar {
  flex: 1;
  height: 7px;
  border-radius: 4px;
  background: var(--color-border);
  overflow: hidden;
}

.type-q__tipfill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--color-gold);
  transition: width 0.3s ease;
}

.type-q__tipbtn {
  flex-shrink: 0;
  font-size: 0.9rem;
  padding: 0.5rem 1rem;
}

.type-q__tipbtn--pass {
  color: var(--color-terracotta);
  border-color: var(--color-terracotta);
}
</style>
