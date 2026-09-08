<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { db } from '@/db'
import type { VocabGroup } from '@/db/types'
import { useProgressStore } from '@/stores/progress'
import { useContentLang } from '@/i18n/content'
import LessonSectionCard from './LessonSectionCard.vue'
import AudioButton from '@/components/AudioButton.vue'
import CyrillicSub from '@/components/CyrillicSub.vue'
import VerbFormStrip from '@/components/VerbFormStrip.vue'

const props = defineProps<{ group: VocabGroup }>()
const emit = defineEmits<{ done: [] }>()
const { gloss } = useContentLang()

const progress = useProgressStore()

/**
 * Whether this article had already been read before this visit. Snapshotted on
 * mount, *before* this visit is recorded, so the "you've seen this" note
 * reflects earlier reading rather than the read now in progress.
 */
const seenBefore = ref(false)

onMounted(async () => {
  const prior = await db.groupProgress.get(props.group.id)
  seenBefore.value = Boolean(prior?.reviewedAt)
  // Reading the article counts as meeting the words, so they enter the normal
  // review-and-test rotation alongside the rest of your vocabulary.
  void progress.markWordsSeen(props.group.words.map((w) => w.id))
  // …and the set itself is marked reviewed, so the menu can tick it off.
  void progress.recordGroupReview(props.group.id)
})
</script>

<template>
  <div class="review">
    <p v-if="seenBefore" class="review__seen">
      <span class="review__tick" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2.5 8l4 4 7-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      {{ $t('group.seenBefore') }}
    </p>

    <LessonSectionCard
      v-for="(section, i) in group.article"
      :key="i"
      :section="section"
    />

    <section class="gallery">
      <h2 class="gallery__heading">{{ $t('group.theWords') }}</h2>
      <ul class="gallery__list">
        <li v-for="word in group.words" :key="word.id" class="word">
          <span
            v-if="word.swatch"
            class="word__swatch"
            :style="{ background: word.swatch }"
            aria-hidden="true"
          />
          <div class="word__text">
            <span class="word__uzbek" lang="uz">{{ word.uzbek }}</span>
            <CyrillicSub :latin="word.uzbek" :cyrillic="word.cyrillic" />
            <span class="word__english">{{ gloss(word) }}</span>
            <VerbFormStrip v-if="word.verb" class="word__verb" :verb="word.verb" compact />
          </div>
          <AudioButton :text="word.uzbek" />
        </li>
      </ul>
    </section>

    <button class="btn btn--primary review__cta" type="button" @click="emit('done')">
      {{ $t('group.readyTest') }}
    </button>
  </div>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.review__seen {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.55rem 0.8rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-teal);
  background: var(--color-surface);
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-md);
}

.review__tick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-teal);
  color: #fff;
}

.review__tick svg {
  width: 12px;
  height: 12px;
}

.gallery__heading {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0 0 0.6rem;
}

.gallery__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.word {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.word__swatch {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
  border: 1.5px solid var(--color-border);
}

.word__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.word__uzbek {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-primary);
}

.word__english {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.word__verb {
  margin-top: 0.35rem;
}

.review__cta {
  margin-top: 0.4rem;
}
</style>
