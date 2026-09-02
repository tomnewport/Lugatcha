<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount, watch, nextTick, onUnmounted } from 'vue'
import { getBreakdown, ensureBreakdownIndex } from '@/exercises/deagglutination'
import { spokenWordForm } from '@/exercises/validate'
import { createSpeaker } from '@/audio/audio'
import {
  closeWordTooltip,
  isWordOpen,
  nextTooltipId,
  toggleWordTooltip,
} from '@/components/wordTooltip'

/** Speaks this component's own words, and silences only those — a word left
 * sounding as the learner moves on is cut off, the word that replaced it is
 * not. See `createSpeaker`. */
const speaker = createSpeaker()
onUnmounted(speaker.stop)

const props = defineProps<{
  word: string
  meaning?: string
  noHint?: boolean
}>()

const id = Symbol('uz-word')
// Teleporting the tooltip to <body> breaks its DOM adjacency to the button, so
// the two are tied together explicitly for screen readers.
const tipId = nextTooltipId()
// The sentence this word belongs to, when it is part of one (UzbekWord is also
// used on its own in the word-intro exercise).
const owner = inject<symbol | null>('uz-sentence', null)
const isOpen = computed(() => isWordOpen(id))

onMounted(() => {
  void ensureBreakdownIndex()
})

onBeforeUnmount(() => {
  closeWordTooltip(id)
  stopTracking()
})

// The next phrase, story sentence or roleplay turn reuses this component with
// new text, so an open tooltip would otherwise survive into content it no
// longer describes.
watch(
  () => [props.word, props.meaning],
  () => closeWordTooltip(id),
)

const breakdown = computed(() => getBreakdown(props.word))
const isMultiMorpheme = computed(() => (breakdown.value?.breakdown.length ?? 0) > 1)
const isAgglutinated = computed(() => breakdown.value !== null)
const hasTooltip = computed(() => !props.noHint && (isAgglutinated.value || !!props.meaning))

// Full assembled-word meaning shown under the morpheme grid. Prefer the curated
// lesson gloss; fall back to the sentence glossary lookup passed via `meaning`.
const fullMeaning = computed(() => breakdown.value?.meaning ?? props.meaning)

function toggle() {
  void speaker.speak(spokenWordForm(props.word))
  if (!hasTooltip.value) return
  toggleWordTooltip(id, owner)
}

/* ── Positioning ─────────────────────────────────────────────────────────────
   The tooltip is teleported to <body> and positioned in viewport coordinates:
   anchored inside the sentence it was clipped by scroll containers (the
   roleplay chat log) and by the edge of the screen. */

const btnEl = ref<HTMLElement | null>(null)
const tipEl = ref<HTMLElement | null>(null)
const placement = ref({ left: 0, top: 0, arrow: 0, below: false, hidden: true })

/** Gap between word and tooltip, and the closest the tooltip comes to an edge. */
const GAP = 7
const EDGE = 8

function place() {
  const btn = btnEl.value
  const tip = tipEl.value
  if (!btn || !tip) return
  const anchor = btn.getBoundingClientRect()
  const box = tip.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Keep the box on screen horizontally, then point the arrow back at the word.
  const wanted = anchor.left + anchor.width / 2 - box.width / 2
  const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, vw - box.width - EDGE))

  // Above the word by default; flip below when there isn't room up there.
  const below = anchor.top - box.height - GAP < EDGE && anchor.bottom + box.height + GAP < vh
  const top = below ? anchor.bottom + GAP : anchor.top - box.height - GAP

  const centre = anchor.left + anchor.width / 2 - left
  placement.value = {
    left,
    top,
    arrow: Math.min(Math.max(10, centre), Math.max(10, box.width - 10)),
    below,
    hidden: isClipped(btn, anchor),
  }
}

/**
 * True when the word itself has been scrolled out of sight — inside the chat
 * log, or off the page. A tooltip anchored to something invisible would float
 * loose over the rest of the screen.
 */
function isClipped(el: HTMLElement, rect: DOMRect): boolean {
  if (rect.bottom < 0 || rect.top > window.innerHeight) return true
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).overflow === 'visible') continue
    const clip = node.getBoundingClientRect()
    if (rect.bottom < clip.top || rect.top > clip.bottom) return true
    if (rect.right < clip.left || rect.left > clip.right) return true
  }
  return false
}

let tracking = false

function startTracking() {
  if (tracking) return
  tracking = true
  // Capture phase so scrolling of inner containers (the chat log) is seen too.
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
}

function stopTracking() {
  if (!tracking) return
  tracking = false
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
}

watch(isOpen, async (open) => {
  if (!open) {
    stopTracking()
    placement.value = { ...placement.value, hidden: true }
    return
  }
  await nextTick()
  place()
  startTracking()
})

// The gloss index loads asynchronously, so an open tooltip can gain a morpheme
// grid after it was first measured.
watch(breakdown, () => {
  if (isOpen.value) void nextTick(place)
})

const tooltipStyle = computed(() => ({
  left: `${placement.value.left}px`,
  top: `${placement.value.top}px`,
  visibility: placement.value.hidden ? ('hidden' as const) : ('visible' as const),
}))

const arrowStyle = computed(() => ({ left: `${placement.value.arrow}px` }))
</script>

<template>
  <span
    class="uz-word"
    lang="uz"
    :class="{
      'uz-word--agglutinated': isMultiMorpheme,
      'uz-word--meaning': !isMultiMorpheme && (isAgglutinated || !!meaning),
      'uz-word--open': isOpen,
    }"
  >
    <button
      ref="btnEl"
      class="uz-word__btn"
      type="button"
      :aria-expanded="hasTooltip ? isOpen : undefined"
      :aria-describedby="isOpen && hasTooltip ? tipId : undefined"
      @click.stop="toggle"
    >{{ word }}</button>

    <Teleport to="body">
      <span
        v-if="isOpen && hasTooltip"
        :id="tipId"
        ref="tipEl"
        class="uz-word__tooltip"
        :class="[
          isMultiMorpheme && breakdown ? 'uz-word__tooltip--breakdown' : 'uz-word__tooltip--meaning',
          placement.below ? 'uz-word__tooltip--below' : 'uz-word__tooltip--above',
        ]"
        :style="tooltipStyle"
        role="tooltip"
      >
        <!-- Multi-morpheme breakdown (teal, morpheme grid) -->
        <template v-if="isMultiMorpheme && breakdown">
          <span class="bk-row">
            <template v-for="(part, i) in breakdown.breakdown" :key="i">
              <span v-if="i > 0" class="bk-plus" aria-hidden="true">+</span>
              <span class="bk-morpheme">
                <span class="bk-morpheme__part" lang="uz">{{ part }}</span>
                <span class="bk-morpheme__gloss">{{ breakdown.gloss[i] }}</span>
              </span>
            </template>
          </span>
          <span v-if="fullMeaning" class="bk-meaning">
            <span lang="uz">{{ word }}</span> = {{ fullMeaning }}
          </span>
        </template>

        <!-- Single-morpheme vocab match: "word = meaning" pill -->
        <template v-else-if="breakdown">
          <span lang="uz">{{ word }}</span> = {{ breakdown.gloss[0] }}
        </template>

        <!-- Fallback: meaning prop only -->
        <template v-else>{{ meaning }}</template>

        <span class="uz-word__arrow" :style="arrowStyle" aria-hidden="true" />
      </span>
    </Teleport>
  </span>
</template>

<style scoped>
.uz-word {
  position: relative;
  display: inline-block;
}

.uz-word__btn {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0 1px 2px;
  cursor: pointer;
  line-height: inherit;
}

.uz-word--meaning .uz-word__btn {
  border-bottom: 1.5px dotted var(--color-primary-light);
}

.uz-word--agglutinated .uz-word__btn {
  border-bottom: 2px solid var(--color-teal);
}

.uz-word--open .uz-word__btn {
  background: rgb(27 79 138 / 0.07);
  border-radius: 3px;
}

/* Base tooltip. Teleported to <body> and placed in viewport coordinates by
   place(), so no ancestor's overflow can clip it. */
.uz-word__tooltip {
  position: fixed;
  z-index: 60;
  width: max-content;
  max-width: min(300px, calc(100vw - 16px));
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  white-space: normal;
  text-align: left;
}

.uz-word__arrow {
  position: absolute;
  width: 0;
  height: 0;
  margin-left: -5px;
  border: 5px solid transparent;
}

.uz-word__tooltip--above .uz-word__arrow {
  top: 100%;
}

.uz-word__tooltip--below .uz-word__arrow {
  bottom: 100%;
}

/* Meaning tooltip */
.uz-word__tooltip--meaning {
  padding: 0.35rem 0.6rem;
  font-size: 0.76rem;
  font-weight: 600;
  font-family: var(--font-sans, inherit);
  color: #fff;
  background: var(--color-text);
}

.uz-word__tooltip--meaning.uz-word__tooltip--above .uz-word__arrow {
  border-top-color: var(--color-text);
}

.uz-word__tooltip--meaning.uz-word__tooltip--below .uz-word__arrow {
  border-bottom-color: var(--color-text);
}

/* Breakdown tooltip */
.uz-word__tooltip--breakdown {
  padding: 0.5rem 0.7rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-teal);
}

.uz-word__tooltip--breakdown.uz-word__tooltip--above .uz-word__arrow {
  border-top-color: var(--color-teal);
}

.uz-word__tooltip--breakdown.uz-word__tooltip--below .uz-word__arrow {
  border-bottom-color: var(--color-teal);
}

.bk-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px 3px;
}

.bk-plus {
  align-self: flex-start;
  margin-top: 0.28rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-text-muted);
  font-family: var(--font-sans, inherit);
}

.bk-morpheme {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.bk-morpheme__part {
  padding: 0.18rem 0.42rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-teal);
  background: #f0f7f5;
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-sm);
}

.bk-morpheme:first-child .bk-morpheme__part {
  color: var(--color-primary);
  background: #f2f7fc;
  border-color: var(--color-primary-light);
}

.bk-morpheme__gloss {
  font-size: 0.59rem;
  font-family: var(--font-sans, inherit);
  color: var(--color-text-muted);
  text-align: center;
  max-width: 72px;
  line-height: 1.2;
}

/* Full-word meaning footer under the morpheme grid */
.bk-meaning {
  display: block;
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--color-teal);
  font-size: 0.72rem;
  font-weight: 600;
  font-family: var(--font-sans, inherit);
  color: var(--color-text);
  text-align: center;
  line-height: 1.25;
}

.bk-meaning [lang='uz'] {
  font-weight: 700;
  color: var(--color-primary);
}
</style>
