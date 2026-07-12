<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { db } from '@/db'
import type { Roleplay, RoleplayVariant, RoleplayTurn } from '@/db/types'
import { tokenize, buildDecoys } from '@/exercises/validate'
import { pickLeastRecentlyShown } from '@/exercises/contentPicker'
import { loadRoleplayShownMap } from '@/db/progress'
import { phraseKey } from '@/exercises/phrases'
import { speakUzbek, stopSpeaking } from '@/audio/audio'
import { useContentLang } from '@/i18n/content'
import { useProgressStore } from '@/stores/progress'
import AudioButton from '@/components/AudioButton.vue'
import TokenAssembly, { type AssemblyResult } from './TokenAssembly.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()
const { name, pick } = useContentLang()
const progress = useProgressStore()

const roleplay = ref<Roleplay | null>(null)
const stage = ref<'play' | 'done'>('play')
const turns = ref<RoleplayTurn[]>([])
const currentIndex = ref(0)
const npcSpeaking = ref(false)
const loading = ref(true)
const logEl = ref<HTMLElement | null>(null)

/** Every conversation path across the location's scenarios, tagged with its scenario. */
interface VariantRef {
  id: string
  scenario: Roleplay
  variant: RoleplayVariant
}
const variantRefs = ref<VariantRef[]>([])

/** Bumped on restart/unmount so stale async NPC turns stop advancing. */
let runId = 0

onMounted(async () => {
  const found = await db.roleplay.where('theme').equals(props.locationId).toArray()
  variantRefs.value = found.flatMap((scenario) =>
    scenario.variants.map((variant) => ({ id: variant.id, scenario, variant })),
  )
  loading.value = false
  await pickAndPlay()
})

/**
 * Play the least-recently-shown path across every scenario here, then record it
 * so it isn't served again until the rest have been seen. Nothing is shown on a
 * first visit, so the picker returns the opening scenario's first path in list
 * order — a gentle introduction — and "try another" walks on to the next unseen
 * path rather than re-rolling one at random.
 */
async function pickAndPlay() {
  const refs = variantRefs.value
  if (refs.length === 0) return
  const shownAt = await loadRoleplayShownMap(
    db,
    refs.map((r) => r.id),
  )
  const chosen = pickLeastRecentlyShown(refs, shownAt)
  if (!chosen) return
  roleplay.value = chosen.scenario
  void progress.recordRoleplayShown(chosen.id)
  startVariant(chosen.variant)
}

onUnmounted(() => {
  runId++
  stopSpeaking()
})

const visibleTurns = computed(() => turns.value.slice(0, currentIndex.value))
const currentTurn = computed(() => turns.value[currentIndex.value])

const decoyPool = computed(() => {
  if (!roleplay.value) return []
  return roleplay.value.variants.flatMap((v) =>
    v.turns.filter((t) => t.speaker === 'user').flatMap((t) => t.tokens ?? tokenize(t.uzbek)),
  )
})

function turnTokens(turn: RoleplayTurn): string[] {
  return turn.tokens ?? tokenize(turn.uzbek)
}

async function scrollLog() {
  await nextTick()
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight, behavior: 'smooth' })
}

function startVariant(variant: RoleplayVariant) {
  runId++
  turns.value = variant.turns
  currentIndex.value = 0
  stage.value = 'play'
  processTurn()
}

async function processTurn() {
  const myRun = runId
  const turn = turns.value[currentIndex.value]
  if (!turn) {
    stage.value = 'done'
    return
  }
  if (turn.speaker === 'npc') {
    npcSpeaking.value = true
    await scrollLog()
    await speakUzbek(turn.uzbek)
    await new Promise((r) => setTimeout(r, 600))
    if (myRun !== runId) return
    npcSpeaking.value = false
    currentIndex.value++
    processTurn()
  } else {
    await scrollLog()
  }
}

async function onUserResult(result: AssemblyResult) {
  const myRun = runId
  const turn = currentTurn.value
  // A built turn is a phrase-building answer — enrol it in spaced repetition.
  void progress.recordPhraseResult(phraseKey(turn.uzbek), result.correct && !result.revealed)
  if (result.correct) {
    await speakUzbek(turn.uzbek)
    if (myRun !== runId) return
  }
  currentIndex.value++
  processTurn()
}

function restart() {
  runId++
  stopSpeaking()
  void pickAndPlay()
}
</script>

<template>
  <div class="roleplay">
    <p v-if="loading" class="roleplay__loading" aria-live="polite">{{ $t('exercise.roleplay.loading') }}</p>

    <div v-else-if="!roleplay" class="roleplay__empty">
      <p class="roleplay__loading">
        {{ $t('exercise.roleplay.empty') }}
      </p>
      <button class="btn btn--primary" type="button" @click="emit('complete')">{{ $t('common.continue') }}</button>
    </div>

    <!-- Conversation -->
    <template v-else>
      <div class="scenario-card">
        <h2 class="scenario-card__title">{{ name(roleplay.title) }}</h2>
        <p class="scenario-card__title-uz" lang="uz">{{ roleplay.title.uz }}</p>
        <p class="scenario-card__desc">{{ pick(roleplay.scenario, roleplay.scenarioRu) }}</p>
      </div>

      <div ref="logEl" class="chat-log" aria-live="polite">
        <div
          v-for="(turn, i) in visibleTurns"
          :key="i"
          class="bubble"
          :class="turn.speaker === 'npc' ? 'bubble--npc' : 'bubble--user'"
        >
          <p class="bubble__uzbek">
            <UzbekSentence :uzbek="turn.uzbek" />
            <AudioButton :text="turn.uzbek" />
          </p>
          <p class="bubble__english">{{ pick(turn.english, turn.russian) }}</p>
        </div>

        <!-- Current NPC turn while speaking -->
        <div v-if="currentTurn?.speaker === 'npc' && npcSpeaking" class="bubble bubble--npc">
          <p class="bubble__uzbek">
            <UzbekSentence :uzbek="currentTurn.uzbek" />
          </p>
          <p class="bubble__english">{{ pick(currentTurn.english, currentTurn.russian) }}</p>
        </div>
      </div>

      <!-- User turn input -->
      <div v-if="stage === 'play' && currentTurn?.speaker === 'user'" class="user-turn">
        <p class="user-turn__prompt">
          💬 {{ $t('exercise.roleplay.say') }} <strong>“{{ pick(currentTurn.english, currentTurn.russian) }}”</strong>
        </p>
        <TokenAssembly
          :key="currentIndex"
          :tokens="turnTokens(currentTurn)"
          :decoys="buildDecoys(turnTokens(currentTurn), decoyPool, 3)"
          mode="strict"
          :check-label="$t('exercise.roleplay.sayIt')"
          @result="onUserResult"
        />
      </div>

      <!-- Completion -->
      <div v-if="stage === 'done'" class="roleplay__done">
        <p class="roleplay__done-msg">{{ $t('exercise.roleplay.done') }}</p>
        <button class="btn btn--primary" type="button" @click="emit('complete')">{{ $t('common.finish') }}</button>
        <button class="btn btn--ghost" type="button" @click="restart">{{ $t('exercise.roleplay.tryAnother') }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.roleplay {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.roleplay__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.roleplay__empty {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.scenario-card {
  padding: 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.scenario-card__title {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.scenario-card__title-uz {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: 0 0 0.6rem;
}

.scenario-card__desc {
  font-size: 0.92rem;
  color: var(--color-text);
  margin: 0;
}

.chat-log {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow-y: auto;
  max-height: 45dvh;
  padding: 0.25rem;
}

.bubble {
  max-width: 85%;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.bubble--npc {
  align-self: flex-start;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-bottom-left-radius: 4px;
}

.bubble--user {
  align-self: flex-end;
  background: #f2f7fc;
  border: 1.5px solid var(--color-primary-light);
  border-bottom-right-radius: 4px;
}

.bubble__uzbek {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.bubble__english {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin: 0.2rem 0 0;
}

.user-turn {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-top: 0.5rem;
  border-top: 1.5px dashed var(--color-border);
}

.user-turn__prompt {
  font-size: 0.95rem;
  color: var(--color-text);
  margin: 0;
  text-align: center;
}

.roleplay__done {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: stretch;
  padding: 1rem;
  background: #fffcf0;
  border: 1.5px solid var(--color-gold);
  border-radius: var(--radius-md);
  text-align: center;
}

.roleplay__done-msg {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0 0 0.4rem;
}
</style>
