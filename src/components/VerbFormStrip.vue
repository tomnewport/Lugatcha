<script setup lang="ts">
/**
 * The paradigm behind a verb card: *olmoq — to take*, then **men olaman**,
 * **siz olasiz** and **iltimos, oling**. A verb is drilled one form at a time,
 * but a form on its own doesn't show a learner how to say the same thing about
 * themselves or to someone else — so every verb card carries its whole set,
 * with the form being taught marked.
 *
 * The second person is always the polite *siz*: the register a visitor should
 * use with everyone (see the group's article).
 */
import { computed } from 'vue'
import type { VerbFormKey, VerbForms } from '@/db/types'
import { useContentLang } from '@/i18n/content'
import AudioButton from '@/components/AudioButton.vue'

const props = defineProps<{ verb: VerbForms; compact?: boolean }>()
const { pick } = useContentLang()

interface Row {
  key: VerbFormKey
  /** Uzbek pronoun or lead-in shown before the form. */
  lead: string
  form: string
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [
    { key: 'i', lead: 'men', form: props.verb.i },
    { key: 'you', lead: 'siz', form: props.verb.you },
  ]
  if (props.verb.request) out.push({ key: 'request', lead: 'iltimos,', form: props.verb.request })
  return out
})
</script>

<template>
  <div class="verb" :class="{ 'verb--compact': compact }">
    <p class="verb__infinitive">
      <span lang="uz">{{ verb.infinitive }}</span>
      <span class="verb__gloss">{{ pick(verb.gloss, verb.glossRu) }}</span>
    </p>
    <ul class="verb__forms">
      <li
        v-for="row in rows"
        :key="row.key"
        class="verb__row"
        :class="{ 'verb__row--current': row.key === verb.form }"
      >
        <span class="verb__lead" lang="uz">{{ row.lead }}</span>
        <span class="verb__form" lang="uz">{{ row.form }}</span>
        <AudioButton v-if="!compact" :text="row.form" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.verb {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem 0.6rem;
  background: var(--color-primary-wash);
  border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.verb__infinitive {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
  flex-wrap: wrap;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-primary);
}

.verb__gloss {
  font-weight: 500;
  color: var(--color-text-muted);
}

.verb__forms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.verb__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.verb__row--current .verb__form {
  color: var(--color-primary);
  font-weight: 800;
}

.verb__lead {
  min-width: 3.6em;
  opacity: 0.75;
}

.verb--compact .verb__row {
  font-size: 0.8rem;
}
</style>
