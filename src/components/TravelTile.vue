<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = defineProps<{ locked?: boolean }>()

const emit = defineEmits<{
  locked: []
}>()

const router = useRouter()

function open() {
  if (props.locked) {
    emit('locked')
    return
  }
  router.push('/travel')
}
</script>

<template>
  <!-- The Travel Agency: a map of Uzbekistan you explore place by place -->
  <button
    class="tile"
    :class="{ 'tile--locked': locked }"
    :aria-disabled="locked"
    :aria-label="`${$t('travel.title')}${locked ? ', ' + $t('common.locked') : ''}`"
    @click="open"
  >
    <div class="tile__icon-wrap" aria-hidden="true">
      <!-- Map pin over a little globe -->
      <svg class="tile__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M12 2C8.7 2 6 4.7 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6z" fill="#fbeee6" />
        <circle cx="12" cy="8" r="2.4" fill="currentColor" stroke="none" />
      </svg>
    </div>
    <span class="tile__name" lang="uz">{{ $t('travel.tileSubtitle') }}</span>
    <span class="tile__name-uz">{{ $t('travel.title') }}</span>
  </button>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  background: #fdf3ee;
  border: 1.5px solid var(--color-terracotta);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  box-shadow: var(--shadow-sm);
  width: 100%;
  min-width: 0;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
}

.tile:not(.tile--locked):hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.tile--locked {
  opacity: 0.5;
  cursor: pointer;
  filter: grayscale(0.7);
}

.tile__icon-wrap {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tile__icon {
  width: 30px;
  height: 30px;
  color: var(--color-terracotta);
}

.tile__name {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-terracotta);
  line-height: 1.2;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile__name-uz {
  font-size: 0.58rem;
  color: var(--color-text-muted);
  line-height: 1.2;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
