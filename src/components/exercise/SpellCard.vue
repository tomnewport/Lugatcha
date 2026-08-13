<script setup lang="ts">
/**
 * The interstitial shown before a word's spelling is tested for the first time
 * — or again after a spelling was given up on. It gives the learner everything
 * the typing question will ask them to reproduce from memory: the meaning, both
 * scripts, and the word broken into the keys that spell it. A few questions
 * follow before the spelling is asked (exercises/spellCards.ts), so this is a
 * study card rather than a peek at the answer.
 */
import { computed } from 'vue'
import type { Word } from '@/db/types'
import { spellingUnits } from '@/exercises/test'
import { useContentLang } from '@/i18n/content'
import { latinToCyrillic } from '@/exercises/transliterate'
import AudioButton from '@/components/AudioButton.vue'

const props = defineProps<{ word: Word }>()
const emit = defineEmits<{ continue: [] }>()

const { base, gloss } = useContentLang()

const cyrillic = computed(() => props.word.cyrillic?.trim() || latinToCyrillic(props.word.uzbek))
/**
 * The gloss in the other base language, when it adds something: loanwords often
 * repeat the meaning already shown, or match the Cyrillic spelling below it
 * (bagaj → багаж), and a row that just says it twice is noise.
 */
const otherGloss = computed(() => {
  const other = base.value === 'ru' ? props.word.english : props.word.russian
  if (!other) return null
  const same = [gloss(props.word), cyrillic.value].some(
    (t) => t.localeCompare(other, undefined, { sensitivity: 'base' }) === 0,
  )
  return same ? null : other
})
const units = computed(() => spellingUnits(props.word.uzbek))
</script>

<template>
  <div class="spell-card">
    <span class="spell-card__eyebrow">{{ $t('exercise.spellCard.eyebrow') }}</span>

    <span class="spell-card__uz" lang="uz">{{ word.uzbek }}</span>
    <AudioButton :text="word.uzbek" large />

    <dl class="spell-card__rows">
      <div class="spell-card__row">
        <dt>{{ $t('exercise.spellCard.meaning') }}</dt>
        <dd>{{ gloss(word) }}</dd>
      </div>
      <div v-if="otherGloss" class="spell-card__row">
        <dt>{{ $t('exercise.spellCard.otherLanguage') }}</dt>
        <dd>{{ otherGloss }}</dd>
      </div>
      <div class="spell-card__row">
        <dt>{{ $t('exercise.spellCard.cyrillic') }}</dt>
        <dd lang="uz">{{ cyrillic }}</dd>
      </div>
      <div class="spell-card__row">
        <dt>{{ $t('exercise.spellCard.spelling') }}</dt>
        <dd>
          <span class="spell-card__units" lang="uz">
            <span
              v-for="(unit, i) in units"
              :key="`${i}-${unit}`"
              class="spell-card__unit"
              :class="{ 'spell-card__unit--space': unit === ' ' }"
              >{{ unit === ' ' ? '␣' : unit }}</span
            >
          </span>
        </dd>
      </div>
    </dl>

    <p class="spell-card__hint">{{ $t('exercise.spellCard.intro') }}</p>
    <button class="btn btn--primary" type="button" @click="emit('continue')">
      {{ $t('exercise.spellCard.continue') }}
    </button>
  </div>
</template>

<style scoped>
.spell-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.3rem 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.spell-card__eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--color-teal);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.spell-card__uz {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--color-primary);
}

.spell-card__rows {
  width: 100%;
  margin: 0.5rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.spell-card__row {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--color-border);
  text-align: left;
}

.spell-card__row dt {
  flex-shrink: 0;
  width: 5.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.spell-card__row dd {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  color: var(--color-text);
}

.spell-card__units {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.spell-card__unit {
  padding: 0.15rem 0.4rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-wash);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.spell-card__unit--space {
  color: var(--color-text-muted);
}

.spell-card__hint {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0.4rem 0 0;
  line-height: 1.5;
}

.spell-card .btn {
  margin-top: 0.4rem;
  align-self: stretch;
}
</style>
