<script setup lang="ts">
/**
 * The bonus round that rewards a finished daily practice: one of the
 * mini-games in the roster, picked at random when this mounts.
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

const emit = defineEmits<{ done: [] }>()

const COLOURS_GROUP = 'colours'

const game = ref<MiniGameId>(pickMiniGame())
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
  <BubbleGame v-else-if="colourWords" :words="colourWords" @done="emit('done')" />
</template>
