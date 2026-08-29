<script setup lang="ts">
/**
 * The bonus round that rewards a finished daily practice: one of the
 * mini-games in the roster, picked at random when this mounts — or a named
 * one, when the caller wants a particular game (Settings offers each of them,
 * so a learner can go straight to the one they meant rather than reroll until
 * it turns up).
 *
 * Bubble trouble always draws its ten colours from the Colours vocabulary set,
 * whatever the session happened to drill — the game teaches that set, not the
 * words just tested. If those colours cannot be loaded the round falls back to
 * the snake rather than opening an empty arena.
 */
import { ref, onMounted } from 'vue'
import { loadGroup } from '@/db/groups'
import type { Word } from '@/db/types'
import { pickMiniGame, type MiniGameId } from '@/exercises/miniGames'
import { coloursFromWords } from '@/exercises/bubbles'
import SnakeGame from '@/components/SnakeGame.vue'
import BubbleGame from '@/components/BubbleGame.vue'
import BazarGame from '@/components/BazarGame.vue'
import TaxiGame from '@/components/TaxiGame.vue'

/** Omit to toss for it, which is what the post-practice bonus round does. */
const props = defineProps<{ game?: MiniGameId }>()
const emit = defineEmits<{ done: [] }>()

const COLOURS_GROUP = 'colours'

const game = ref<MiniGameId>(props.game ?? pickMiniGame())
const colourWords = ref<Word[] | null>(null)

onMounted(async () => {
  if (game.value !== 'bubbles') return
  try {
    const group = await loadGroup(COLOURS_GROUP)
    const words = group?.words ?? []
    if (coloursFromWords(words).length) colourWords.value = words
    else game.value = 'snake'
  } catch {
    game.value = 'snake'
  }
})
</script>

<template>
  <SnakeGame v-if="game === 'snake'" @done="emit('done')" />
  <BazarGame v-else-if="game === 'bazar'" @done="emit('done')" />
  <TaxiGame v-else-if="game === 'taxi'" @done="emit('done')" />
  <BubbleGame v-else-if="colourWords" :words="colourWords" @done="emit('done')" />
</template>
