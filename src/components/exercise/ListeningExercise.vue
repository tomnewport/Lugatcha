<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db } from '@/db'
import { normalizeToken, shuffle, tokenize } from '@/exercises/validate'
import { speakUzbek, stopSpeaking } from '@/audio/audio'
import { useContentLang } from '@/i18n/content'
import AudioButton from '@/components/AudioButton.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()
const { pick } = useContentLang()

interface Phrase {
  uzbek: string
  translation: string
}

const PHRASES_PER_SESSION = 5

const phrases = ref<Phrase[]>([])
const index = ref(0)
const loading = ref(true)

onMounted(async () => {
  const roleplays = await db.roleplay.where('theme').equals(props.locationId).toArray()
  const seen = new Set<string>()
  const pool: Phrase[] = []
  for (const rp of roleplays) {
    for (const variant of rp.variants) {
      for (const turn of variant.turns) {
        const key = normalizeToken(turn.uzbek)
        if (seen.has(key)) continue
        seen.add(key)
        pool.push({ uzbek: turn.uzbek, translation: pick(turn.english, turn.russian) })
      }
    }
  }
  // Shorter phrases first — gentler listening on early visits
  phrases.value = shuffle(pool)
    .slice(0, PHRASES_PER_SESSION)
    .sort((a, b) => tokenize(a.uzbek).length - tokenize(b.uzbek).length)
  loading.value = false
  if (phrases.value.length > 0) speakUzbek(phrases.value[0].uzbek)
})

onUnmounted(() => {
  stopSpeaking()
})

const current = computed(() => phrases.value[index.value])
const isLast = computed(() => index.value >= phrases.value.length - 1)

function next() {
  if (isLast.value) {
    emit('complete')
    return
  }
  index.value++
  // The tap on Next is a user gesture, so playback is allowed
  speakUzbek(phrases.value[index.value].uzbek)
}
</script>

<template>
  <div class="listening">
    <p v-if="loading" class="listening__loading" aria-live="polite">{{ $t('exercise.listening.loading') }}</p>

    <template v-else-if="current">
      <p class="listening__counter">{{ $t('exercise.listening.counter', { current: index + 1, total: phrases.length }) }}</p>
      <p class="listening__instruction">
        {{ $t('exercise.listening.justListen') }}
      </p>

      <div class="listening__card">
        <AudioButton :text="current.uzbek" large :label="$t('audio.playPhrase')" />
        <p class="listening__uzbek">
          <UzbekSentence :uzbek="current.uzbek" />
        </p>
        <p class="listening__english">{{ current.translation }}</p>
      </div>

      <div class="listening__footer">
        <button class="btn btn--primary" type="button" @click="next">
          {{ isLast ? $t('exercise.listening.finish') : $t('exercise.listening.nextPhrase') }}
        </button>
      </div>
    </template>

    <div v-else class="listening__empty">
      <p class="listening__loading">
        {{ $t('exercise.listening.empty') }}
      </p>
      <button class="btn btn--primary" type="button" @click="emit('complete')">{{ $t('common.continue') }}</button>
    </div>
  </div>
</template>

<style scoped>
.listening {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.listening__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.listening__counter {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  margin: 0;
}

.listening__instruction {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.listening__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  padding: 1.8rem 1.2rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.listening__uzbek {
  display: flex;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.listening__english {
  font-size: 0.95rem;
  color: var(--color-text-muted);
  margin: 0;
}

.listening__footer {
  margin-top: auto;
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
}

.listening__empty {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}
</style>
