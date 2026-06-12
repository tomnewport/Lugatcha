<script setup lang="ts">
/**
 * On-screen keyboard optimised for Uzbek Latin: the 24 base letters plus the
 * characters English keyboards lack — oʻ, gʻ, the sh/ch digraphs, and the
 * tutuq belgisi (ʼ). A key's `value` is what it types; its label is what shows.
 *
 * When `litKeys` is non-null, only those values stay bright and the rest dim —
 * that's how a hint narrows the keyboard down.
 */
const props = defineProps<{
  litKeys?: string[] | null
  disabled?: boolean
}>()

const emit = defineEmits<{ press: [value: string] }>()

interface Key {
  value: string
  label: string
}

const ROWS: Key[][] = [
  ['a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((v) => ({ value: v, label: v })),
  ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'].map((v) => ({ value: v, label: v })),
  ['t', 'u', 'v', 'x', 'y', 'z'].map((v) => ({ value: v, label: v })).concat([
    { value: 'oʻ', label: 'oʻ' },
    { value: 'gʻ', label: 'gʻ' },
    { value: 'ʼ', label: 'ʼ' },
  ]),
  [
    { value: 'sh', label: 'sh' },
    { value: 'ch', label: 'ch' },
    { value: 'ng', label: 'ng' },
    { value: ' ', label: '␣' },
  ],
]

function isLit(value: string): boolean {
  return !props.litKeys || props.litKeys.includes(value)
}

function press(value: string) {
  if (props.disabled || !isLit(value)) return
  emit('press', value)
}
</script>

<template>
  <div class="keyboard" :class="{ 'keyboard--disabled': disabled }">
    <div v-for="(row, r) in ROWS" :key="r" class="keyboard__row">
      <button
        v-for="key in row"
        :key="key.value"
        class="key"
        :class="{ 'key--dim': !isLit(key.value), 'key--space': key.value === ' ' }"
        type="button"
        lang="uz"
        :disabled="disabled"
        @click="press(key.value)"
      >
        {{ key.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.keyboard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.keyboard__row {
  display: flex;
  justify-content: center;
  gap: 5px;
}

.key {
  flex: 1 1 0;
  min-width: 0;
  max-width: 44px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  transition:
    opacity 0.18s ease,
    transform 0.08s ease,
    background-color 0.12s ease;
}

.key--space {
  flex: 2 1 0;
  max-width: 120px;
}

.key:not(:disabled):active {
  transform: translateY(1px);
  background: #f2f7fc;
}

.key--dim {
  opacity: 0.22;
  pointer-events: none;
}

.keyboard--disabled .key {
  opacity: 0.4;
}
</style>
