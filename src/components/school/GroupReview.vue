<script setup lang="ts">
import { onMounted } from 'vue'
import type { VocabGroup } from '@/db/types'
import { useProgressStore } from '@/stores/progress'
import { useContentLang } from '@/i18n/content'
import LessonSectionCard from './LessonSectionCard.vue'
import AudioButton from '@/components/AudioButton.vue'
import CyrillicSub from '@/components/CyrillicSub.vue'

const props = defineProps<{ group: VocabGroup }>()
const emit = defineEmits<{ done: [] }>()
const { gloss } = useContentLang()

const progress = useProgressStore()

// Reading the article counts as meeting the words, so they enter the normal
// review-and-test rotation alongside the rest of your vocabulary.
onMounted(() => {
  void progress.markWordsSeen(props.group.words.map((w) => w.id))
})
</script>

<template>
  <div class="review">
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
          <span class="word__text">
            <span class="word__uzbek" lang="uz">{{ word.uzbek }}</span>
            <CyrillicSub :latin="word.uzbek" :cyrillic="word.cyrillic" />
            <span class="word__english">{{ gloss(word) }}</span>
          </span>
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

.review__cta {
  margin-top: 0.4rem;
}
</style>
