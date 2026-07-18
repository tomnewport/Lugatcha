<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { feedbackState } from '@/feedback/activityContext'
import {
  buildFeedbackIssueUrl,
  collectClientInfo,
  activityDetailRows,
  hasActivityContext,
  type FeedbackScope,
} from '@/feedback/issue'

const open = ref(false)
const scope = ref<FeedbackScope>('general')
const comment = ref('')
const showDetails = ref(false)
const textarea = ref<HTMLTextAreaElement | null>(null)

const canScopeActivity = computed(() => hasActivityContext())

/** Label of the activity offered as the "what I'm doing" scope. */
const activityLabel = computed(() => feedbackState.activity?.label ?? '')

/** Rows previewed under "included automatically". */
const activityRows = computed(() => (scope.value === 'activity' ? activityDetailRows() : null))
const clientRows = computed(() => (open.value ? collectClientInfo() : []))

/** The prefilled GitHub issue link, recomputed as the form changes. */
const issueUrl = computed(() => buildFeedbackIssueUrl(scope.value, comment.value))

function openForm() {
  // Default to the activity scope when there's something specific to report.
  scope.value = canScopeActivity.value ? 'activity' : 'general'
  comment.value = ''
  showDetails.value = false
  open.value = true
}

function close() {
  open.value = false
}

function submit() {
  // The <a> handles opening GitHub in a new tab; just dismiss the form after.
  close()
}

// Focus the comment field and support Escape-to-close while the dialog is open.
watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    textarea.value?.focus()
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
</script>

<template>
  <button
    class="raise-btn"
    type="button"
    :aria-label="$t('feedback.buttonAria')"
    @click="openForm"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 7v4" stroke-linecap="round" />
      <circle cx="12" cy="14.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
    <span class="raise-btn__label">{{ $t('feedback.button') }}</span>
  </button>

  <Teleport to="body">
    <Transition name="raise-fade">
      <div
        v-if="open"
        class="raise-overlay"
        @click.self="close"
        @keydown="onKeydown"
      >
        <div class="raise-panel" role="dialog" aria-modal="true" :aria-label="$t('feedback.dialogTitle')">
          <header class="raise-panel__head">
            <h2 class="raise-panel__title">{{ $t('feedback.dialogTitle') }}</h2>
            <button
              class="raise-panel__close"
              type="button"
              :aria-label="$t('common.close')"
              @click="close"
            >
              ✕
            </button>
          </header>

          <div class="raise-panel__body">
            <fieldset class="raise-scope">
              <legend class="raise-scope__legend">{{ $t('feedback.scopeQuestion') }}</legend>

              <label
                class="raise-scope__option"
                :class="{ 'raise-scope__option--active': scope === 'activity' }"
                :aria-disabled="!canScopeActivity"
              >
                <input
                  type="radio"
                  name="feedback-scope"
                  value="activity"
                  :checked="scope === 'activity'"
                  :disabled="!canScopeActivity"
                  @change="scope = 'activity'"
                />
                <span class="raise-scope__text">
                  <span class="raise-scope__title">{{ $t('feedback.scopeActivity') }}</span>
                  <span class="raise-scope__hint">
                    {{ canScopeActivity ? activityLabel : $t('feedback.scopeActivityNone') }}
                  </span>
                </span>
              </label>

              <label
                class="raise-scope__option"
                :class="{ 'raise-scope__option--active': scope === 'general' }"
              >
                <input
                  type="radio"
                  name="feedback-scope"
                  value="general"
                  :checked="scope === 'general'"
                  @change="scope = 'general'"
                />
                <span class="raise-scope__text">
                  <span class="raise-scope__title">{{ $t('feedback.scopeGeneral') }}</span>
                  <span class="raise-scope__hint">{{ $t('feedback.scopeGeneralHint') }}</span>
                </span>
              </label>
            </fieldset>

            <label class="raise-field">
              <span class="raise-field__label">{{ $t('feedback.commentLabel') }}</span>
              <textarea
                ref="textarea"
                v-model="comment"
                class="raise-field__input"
                rows="4"
                :placeholder="$t('feedback.commentPlaceholder')"
              ></textarea>
            </label>

            <div class="raise-included">
              <button
                type="button"
                class="raise-included__toggle"
                :aria-expanded="showDetails"
                @click="showDetails = !showDetails"
              >
                <span class="raise-included__chevron" :class="{ 'raise-included__chevron--open': showDetails }" aria-hidden="true">▸</span>
                {{ $t('feedback.includedTitle') }}
              </button>
              <p class="raise-included__note">{{ $t('feedback.includedNote') }}</p>

              <dl v-if="showDetails" class="raise-included__list">
                <template v-if="activityRows">
                  <div v-for="row in activityRows" :key="`a-${row.label}`" class="raise-included__row">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                </template>
                <div v-for="row in clientRows" :key="`c-${row.label}`" class="raise-included__row">
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <footer class="raise-panel__foot">
            <button type="button" class="btn btn--ghost" @click="close">
              {{ $t('common.cancel') }}
            </button>
            <a
              class="btn btn--primary raise-submit"
              :href="issueUrl"
              target="_blank"
              rel="noopener noreferrer"
              @click="submit"
            >
              {{ $t('feedback.submit') }}
            </a>
          </footer>
          <p class="raise-panel__foot-hint">{{ $t('feedback.submitHint') }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.raise-btn {
  position: fixed;
  right: 0.75rem;
  bottom: calc(4.75rem + env(safe-area-inset-bottom));
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.7rem;
  border: 1.5px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  box-shadow: var(--shadow-sm);
  font-size: 0.78rem;
  font-weight: 700;
}

.raise-btn:hover {
  box-shadow: var(--shadow-md);
  color: var(--color-primary);
}

.raise-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.raise-btn__label {
  line-height: 1;
}

.raise-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 0.4);
}

.raise-panel {
  width: 100%;
  max-width: 520px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-lg);
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
}

.raise-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.raise-panel__title {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.raise-panel__close {
  width: 32px;
  height: 32px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.raise-panel__body {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.25rem 0.1rem;
}

/* ── Scope choice ─────────────────────────────────────────────────────────── */
.raise-scope {
  border: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.raise-scope__legend {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
  padding: 0;
  margin-bottom: 0.25rem;
}

.raise-scope__option {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.7rem 0.8rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
}

.raise-scope__option--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.raise-scope__option[aria-disabled='true'] {
  opacity: 0.55;
  cursor: not-allowed;
}

.raise-scope__option input {
  margin-top: 0.15rem;
  flex-shrink: 0;
}

.raise-scope__text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.raise-scope__title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.raise-scope__hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  word-break: break-word;
}

/* ── Comment field ────────────────────────────────────────────────────────── */
.raise-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.raise-field__label {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.raise-field__input {
  width: 100%;
  resize: vertical;
  padding: 0.6rem 0.7rem;
  font: inherit;
  font-size: 0.9rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
}

.raise-field__input:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* ── Included details ─────────────────────────────────────────────────────── */
.raise-included__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-primary);
}

.raise-included__chevron {
  display: inline-block;
  transition: transform 0.15s ease;
}

.raise-included__chevron--open {
  transform: rotate(90deg);
}

.raise-included__note {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  margin: 0.3rem 0 0;
  line-height: 1.45;
}

.raise-included__list {
  margin: 0.6rem 0 0;
  padding: 0.6rem 0.7rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.raise-included__row {
  display: flex;
  gap: 0.6rem;
  font-size: 0.78rem;
}

.raise-included__row dt {
  flex-shrink: 0;
  min-width: 7.5rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.raise-included__row dd {
  margin: 0;
  color: var(--color-text);
  word-break: break-word;
  min-width: 0;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.raise-panel__foot {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.9rem;
}

.raise-panel__foot .btn {
  flex: 1;
  text-align: center;
}

.raise-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.raise-panel__foot-hint {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0.4rem 0 0;
}

.raise-fade-enter-active,
.raise-fade-leave-active {
  transition: opacity 0.2s ease;
}

.raise-fade-enter-from,
.raise-fade-leave-to {
  opacity: 0;
}
</style>
