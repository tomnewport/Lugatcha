<script setup lang="ts">
import type { LessonSection } from '@/db/types'
import AudioButton from '@/components/AudioButton.vue'

defineProps<{ section: LessonSection }>()

/** Tiny formatter: escape HTML, then **bold**. Lesson data is first-party. */
function renderBody(paragraph: string): string {
  const escaped = paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
</script>

<template>
  <div class="section">
    <h2 v-if="section.heading" class="section__heading">{{ section.heading }}</h2>
    <!-- eslint-disable-next-line vue/no-v-html — first-party lesson data, escaped above -->
    <p v-for="(para, i) in section.body" :key="i" class="section__para" v-html="renderBody(para)" />

    <ul v-if="section.examples?.length" class="examples">
      <li v-for="(ex, i) in section.examples" :key="i" class="example">
        <div class="example__row">
          <div class="example__text">
            <span class="example__uzbek" lang="uz">{{ ex.uzbek }}</span>
            <span class="example__english">{{ ex.english }}</span>
          </div>
          <AudioButton :text="ex.uzbek" />
        </div>
        <div v-if="ex.breakdown" class="example__breakdown" aria-label="Word breakdown">
          <template v-for="(part, j) in ex.breakdown" :key="j">
            <span v-if="j > 0" class="example__plus" aria-hidden="true">+</span>
            <span class="morpheme">
              <span class="morpheme__part" lang="uz">{{ part }}</span>
              <span v-if="ex.gloss?.[j]" class="morpheme__gloss">{{ ex.gloss[j] }}</span>
            </span>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.section__heading {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.section__para {
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--color-text);
  margin: 0;
}

.examples {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.example {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.8rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.example__row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.example__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.example__uzbek {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-primary);
}

.example__english {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.example__breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: flex-start;
}

.morpheme {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.morpheme__part {
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-teal);
  background: #f0f7f5;
  border: 1.5px solid var(--color-teal);
  border-radius: var(--radius-sm);
}

.morpheme:first-child .morpheme__part {
  color: var(--color-primary);
  background: #f2f7fc;
  border-color: var(--color-primary-light);
}

.morpheme__gloss {
  font-size: 0.62rem;
  color: var(--color-text-muted);
  text-align: center;
  max-width: 76px;
}

.example__plus {
  margin-top: 0.3rem;
  color: var(--color-text-muted);
  font-weight: 700;
}
</style>
