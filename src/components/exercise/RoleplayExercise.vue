<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { db } from '@/db'
import type { Roleplay, RoleplayVariant, RoleplayTurn } from '@/db/types'
import { tokenize, buildDecoys, shuffle } from '@/exercises/validate'
import { speakUzbek, stopSpeaking } from '@/audio/audio'
import AudioButton from '@/components/AudioButton.vue'
import TokenAssembly, { type AssemblyResult } from './TokenAssembly.vue'

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()

const roleplay = ref<Roleplay | null>(null)
const stage = ref<'select' | 'play' | 'done'>('select')
const turns = ref<RoleplayTurn[]>([])
const currentIndex = ref(0)
const npcSpeaking = ref(false)
const loading = ref(true)
const logEl = ref<HTMLElement | null>(null)

/** Bumped on restart/unmount so stale async NPC turns stop advancing. */
let runId = 0

onMounted(async () => {
  // A location can have several scenarios — serve a random one each session
  const scenarios = await db.roleplay.where('theme').equals(props.locationId).toArray()
  roleplay.value = shuffle(scenarios)[0] ?? null
  loading.value = false
})

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
  stage.value = 'select'
}
</script>

<template>
  <div class="roleplay">
    <p v-if="loading" class="roleplay__loading" aria-live="polite">Loading scenario…</p>

    <div v-else-if="!roleplay" class="roleplay__empty">
      <p class="roleplay__loading">
        No roleplay for this location yet — it'll arrive in a content update.
      </p>
      <button class="btn btn--primary" type="button" @click="emit('complete')">Continue</button>
    </div>

    <!-- Variant selector -->
    <template v-else-if="stage === 'select'">
      <div class="scenario-card">
        <h2 class="scenario-card__title">{{ roleplay.title.en }}</h2>
        <p class="scenario-card__title-uz" lang="uz">{{ roleplay.title.uz }}</p>
        <p class="scenario-card__desc">{{ roleplay.scenario }}</p>
      </div>

      <p class="roleplay__pick-label">Choose how it goes:</p>
      <ul class="variant-list">
        <li v-for="(variant, i) in roleplay.variants" :key="variant.id">
          <button class="variant-btn" type="button" @click="startVariant(variant)">
            <span class="variant-btn__tag" :class="{ 'variant-btn__tag--base': i === 0 }">
              {{ i === 0 ? 'Start here' : 'Twist' }}
            </span>
            <span class="variant-btn__desc">{{ variant.description }}</span>
          </button>
        </li>
      </ul>
    </template>

    <!-- Conversation -->
    <template v-else>
      <div ref="logEl" class="chat-log" aria-live="polite">
        <div
          v-for="(turn, i) in visibleTurns"
          :key="i"
          class="bubble"
          :class="turn.speaker === 'npc' ? 'bubble--npc' : 'bubble--user'"
        >
          <p class="bubble__uzbek" lang="uz">
            {{ turn.uzbek }}
            <AudioButton :text="turn.uzbek" />
          </p>
          <p class="bubble__english">{{ turn.english }}</p>
        </div>

        <!-- Current NPC turn while speaking -->
        <div v-if="currentTurn?.speaker === 'npc' && npcSpeaking" class="bubble bubble--npc">
          <p class="bubble__uzbek" lang="uz">{{ currentTurn.uzbek }}</p>
          <p class="bubble__english">{{ currentTurn.english }}</p>
        </div>
      </div>

      <!-- User turn input -->
      <div v-if="stage === 'play' && currentTurn?.speaker === 'user'" class="user-turn">
        <p class="user-turn__prompt">
          💬 Say: <strong>“{{ currentTurn.english }}”</strong>
        </p>
        <TokenAssembly
          :key="currentIndex"
          :tokens="turnTokens(currentTurn)"
          :decoys="buildDecoys(turnTokens(currentTurn), decoyPool, 3)"
          mode="strict"
          checkLabel="Say it"
          @result="onUserResult"
        />
      </div>

      <!-- Completion -->
      <div v-if="stage === 'done'" class="roleplay__done">
        <p class="roleplay__done-msg">Suhbat tugadi — conversation complete! 🎉</p>
        <button class="btn btn--primary" type="button" @click="emit('complete')">Finish</button>
        <button class="btn btn--ghost" type="button" @click="restart">Try another variant</button>
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

.roleplay__pick-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
  margin: 0;
}

.variant-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.variant-btn {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.75rem 0.9rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.variant-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.variant-btn__tag {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.variant-btn__tag--base {
  background: var(--color-gold);
  color: #fff;
  border-color: var(--color-gold);
}

.variant-btn__desc {
  font-size: 0.88rem;
  color: var(--color-text);
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
  align-items: center;
  gap: 0.4rem;
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
