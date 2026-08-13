import { ref } from 'vue'

/**
 * One word tooltip is open at a time, app-wide. A sentence isn't a big enough
 * scope: a roleplay renders one UzbekSentence per chat bubble, and tapping a
 * word in a new bubble has to close the tooltip left open in an older one.
 *
 * `owner` identifies the sentence the open word belongs to, so a sentence can
 * dismiss its own tooltip when its text changes without disturbing one the
 * learner opened elsewhere on the page.
 */
const openWord = ref<symbol | null>(null)
let openOwner: symbol | null = null

/** True while `id` owns the open tooltip. */
export function isWordOpen(id: symbol): boolean {
  return openWord.value === id
}

export function openWordTooltip(id: symbol, owner: symbol | null = null): void {
  openWord.value = id
  openOwner = owner
  listen()
}

/** Close the open tooltip; pass an id to close it only if that word owns it. */
export function closeWordTooltip(id?: symbol): void {
  if (id && openWord.value !== id) return
  openWord.value = null
  openOwner = null
}

export function toggleWordTooltip(id: symbol, owner: symbol | null = null): void {
  if (openWord.value === id) closeWordTooltip(id)
  else openWordTooltip(id, owner)
}

/** Close the open tooltip only if it belongs to the given sentence. */
export function closeWordTooltipsIn(owner: symbol): void {
  if (openOwner === owner) closeWordTooltip()
}

let listening = false

/**
 * Dismissal that no single word component can own: a tap anywhere else, or
 * Escape. Taps on a word button are left alone so the button's own click
 * handler can toggle it — pointerdown runs first and would otherwise close the
 * tooltip the tap is about to open.
 */
function listen(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as Element | null
  if (target?.closest?.('.uz-word__btn')) return
  closeWordTooltip()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeWordTooltip()
}
