<script setup lang="ts">
/**
 * A top-of-screen banner shown whenever the device's storage is a threat to a
 * learner's progress (see db/storageHealth.ts):
 *
 *  - **full** — a write has already failed with a quota error, so new progress
 *    is silently not being saved. Red and urgent.
 *  - **low** — storage is near the quota and eviction is a risk. Amber, a nudge.
 *
 * The one action is "Back up now", which writes a file via the OS share sheet or
 * download — outside origin storage — so it works even when IndexedDB can't be
 * written. It's app-wide (mounted in App.vue) because writes happen inside
 * exercises, not just on the home screen, so the warning must be able to appear
 * anywhere.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storageHealth, refreshEstimate } from '@/db/storageHealth'
import { collectBackup } from '@/db/backup'
import { saveBackup } from '@/db/backupIO'
import { markBackedUp } from '@/db/backupReminder'
import { db } from '@/db'

const dismissed = ref(false)
const backingUp = ref(false)
const backedUp = ref(false)

// "full" is the more serious state and wins the styling and message.
const level = computed<'full' | 'low' | null>(() =>
  storageHealth.full ? 'full' : storageHealth.low ? 'low' : null,
)
const visible = computed(() => level.value !== null && !dismissed.value)

async function backupNow() {
  backingUp.value = true
  backedUp.value = false
  try {
    const shared = await saveBackup(await collectBackup(db))
    if (shared) {
      markBackedUp()
      backedUp.value = true
    }
  } finally {
    backingUp.value = false
  }
}

// Re-check the estimate when the app returns to the foreground: the learner may
// have just freed (or used up) space in another app.
function onVisibility() {
  if (document.visibilityState === 'visible') void refreshEstimate()
}

onMounted(() => {
  void refreshEstimate()
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility))
</script>

<template>
  <Transition name="storage-warn">
    <div
      v-if="visible"
      class="storage-warn"
      :class="`storage-warn--${level}`"
      role="alert"
      aria-live="assertive"
    >
      <div class="storage-warn__body">
        <p class="storage-warn__title">
          {{ level === 'full' ? $t('storageWarning.fullTitle') : $t('storageWarning.lowTitle') }}
        </p>
        <p class="storage-warn__text">
          {{ level === 'full' ? $t('storageWarning.fullBody') : $t('storageWarning.lowBody') }}
        </p>
      </div>
      <div class="storage-warn__actions">
        <button
          class="storage-warn__backup"
          type="button"
          :disabled="backingUp"
          @click="backupNow"
        >
          {{
            backedUp
              ? $t('storageWarning.backedUp')
              : backingUp
                ? $t('storageWarning.backingUp')
                : $t('storageWarning.backup')
          }}
        </button>
        <button
          class="storage-warn__dismiss"
          type="button"
          :aria-label="$t('common.close')"
          @click="dismissed = true"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.storage-warn {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 110;
  width: min(100vw, 560px);
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: calc(0.7rem + env(safe-area-inset-top)) 0.9rem 0.7rem;
  border-bottom: 3px solid;
  box-shadow: var(--shadow-md);
}

.storage-warn--full {
  background: var(--color-terracotta);
  border-color: color-mix(in srgb, var(--color-terracotta) 70%, black);
  color: #fff;
}

.storage-warn--low {
  background: var(--color-surface);
  border-color: var(--color-terracotta);
  color: var(--color-text);
}

.storage-warn__body {
  flex: 1;
  min-width: 0;
}

.storage-warn__title {
  font-size: 0.9rem;
  font-weight: 800;
  margin: 0;
}

.storage-warn__text {
  font-size: 0.8rem;
  margin: 0.15rem 0 0;
  line-height: 1.4;
  opacity: 0.95;
}

.storage-warn__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.storage-warn__backup {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  border: 1.5px solid currentColor;
  background: transparent;
  color: inherit;
  white-space: nowrap;
}

.storage-warn--full .storage-warn__backup {
  background: #fff;
  color: var(--color-terracotta);
  border-color: #fff;
}

.storage-warn__backup:disabled {
  opacity: 0.7;
}

.storage-warn__dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  background: transparent;
  color: inherit;
  opacity: 0.85;
}

.storage-warn__dismiss svg {
  width: 12px;
  height: 12px;
}

.storage-warn-enter-active,
.storage-warn-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.storage-warn-enter-from,
.storage-warn-leave-to {
  opacity: 0;
  transform: translate(-50%, -100%);
}
</style>
