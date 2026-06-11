<script setup lang="ts">
import { capturedErrors, dismissError, buildIssueUrl } from '@/errors/reporter'
</script>

<template>
  <TransitionGroup
    v-if="capturedErrors.length"
    name="toast"
    tag="div"
    class="toasts"
    role="alert"
    aria-live="assertive"
  >
    <div v-for="error in capturedErrors" :key="error.id" class="toast">
      <div class="toast__body">
        <p class="toast__title">
          Something went wrong
          <span v-if="error.count > 1" class="toast__count">×{{ error.count }}</span>
        </p>
        <p class="toast__message">{{ error.message }}</p>
      </div>
      <div class="toast__actions">
        <a
          class="toast__report"
          :href="buildIssueUrl(error)"
          target="_blank"
          rel="noopener noreferrer"
        >
          Report
        </a>
        <button
          class="toast__dismiss"
          type="button"
          aria-label="Dismiss error"
          @click="dismissError(error.id)"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(94vw, 480px);
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem 0.9rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-terracotta);
  border-left-width: 5px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.toast__body {
  flex: 1;
  min-width: 0;
}

.toast__title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-terracotta);
  margin: 0;
}

.toast__count {
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  background: var(--color-terracotta);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  margin-left: 0.3rem;
}

.toast__message {
  font-size: 0.8rem;
  color: var(--color-text);
  margin: 0.15rem 0 0;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.toast__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.toast__report {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #fff;
  background: var(--color-terracotta);
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
}

.toast__report:hover {
  box-shadow: var(--shadow-md);
}

.toast__dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.toast__dismiss svg {
  width: 12px;
  height: 12px;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
