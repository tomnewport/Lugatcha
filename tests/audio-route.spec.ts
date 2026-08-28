import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

/**
 * The audio context following the phone onto a Bluetooth headset — see
 * src/audio/context.ts. None of this exists under Node, so the browser side of
 * it is stubbed: a context that records the sinks it is pointed at, a document
 * that can be hidden and shown, and a device list that can change.
 */

type SinkTarget = string | { readonly type: 'none' }

interface StubContext {
  state: string
  closed: boolean
  sinks: SinkTarget[]
  resume(): Promise<void>
  close(): Promise<void>
  setSinkId?: (target: SinkTarget) => Promise<void>
}

let opened: StubContext[] = []
/** Set to hold `setSinkId` open, for the tests about overlapping refreshes. */
let sinkGate: Promise<void> | null = null

function contextClass({ routable }: { routable: boolean }) {
  return class {
    state = 'suspended'
    closed = false
    sinks: SinkTarget[] = []
    constructor() {
      opened.push(this as unknown as StubContext)
    }
    resume(): Promise<void> {
      this.state = 'running'
      return Promise.resolve()
    }
    close(): Promise<void> {
      this.closed = true
      this.state = 'closed'
      return Promise.resolve()
    }
    setSinkId = routable
      ? async (target: SinkTarget): Promise<void> => {
          if (sinkGate) await sinkGate
          this.sinks.push(target)
        }
      : undefined
  }
}

const mediaDevices = new EventTarget()
const doc = new EventTarget() as EventTarget & { hidden: boolean }
const realNavigator = globalThis.navigator

function install({ routable = true }: { routable?: boolean } = {}): void {
  opened = []
  sinkGate = null
  doc.hidden = false
  globalThis.document = doc as unknown as Document
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices },
    configurable: true,
  })
  globalThis.window = { AudioContext: contextClass({ routable }) } as unknown as Window &
    typeof globalThis
}

/** Lets the refresh's promise chain run to the end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function load() {
  vi.resetModules()
  return import('@/audio/context')
}

beforeEach(() => {
  install()
})

afterAll(() => {
  Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true })
  delete (globalThis as { document?: unknown }).document
  delete (globalThis as { window?: unknown }).window
})

describe('audioContext', () => {
  it('opens one context and hands the same one to every caller', async () => {
    const { audioContext } = await load()
    const first = audioContext()
    expect(audioContext()).toBe(first)
    expect(opened).toHaveLength(1)
  })

  it('resumes a suspended context rather than handing back a silent one', async () => {
    const { audioContext } = await load()
    audioContext()
    expect(opened[0].state).toBe('running')
  })
})

describe('refreshAudioRoute', () => {
  it('leaves and returns to the default sink, since staying put is a no-op', async () => {
    const { audioContext, refreshAudioRoute } = await load()
    audioContext()
    await refreshAudioRoute()
    expect(opened[0].sinks).toEqual([{ type: 'none' }, ''])
  })

  it('has no context to correct before one has been opened', async () => {
    const { refreshAudioRoute } = await load()
    await refreshAudioRoute()
    expect(opened).toHaveLength(0)
  })

  it('announces the change to anything else holding an output open', async () => {
    const { audioContext, refreshAudioRoute, onAudioRouteChange } = await load()
    const told: string[] = []
    onAudioRouteChange(() => told.push('route'))

    audioContext()
    await refreshAudioRoute()
    expect(told).toEqual(['route'])
  })

  it('announces it even with no context open, for the elements\' sake', async () => {
    const { refreshAudioRoute, onAudioRouteChange } = await load()
    let told = 0
    onAudioRouteChange(() => told++)

    // The app can go a whole session on `<audio>` elements alone; they are on
    // the wrong device too, and nothing else would tell them so.
    await refreshAudioRoute()
    expect(told).toBe(1)
  })

  it('announces before it starts, so nothing opens on the old device', async () => {
    const { audioContext, refreshAudioRoute } = await load()
    audioContext()
    let release = (): void => {}
    sinkGate = new Promise((resolve) => (release = () => resolve()))

    const order: string[] = []
    const { onAudioRouteChange } = await import('@/audio/context')
    onAudioRouteChange(() => order.push('told'))
    void refreshAudioRoute()
    order.push('refresh returned')

    sinkGate = null
    release()
    await settle()
    expect(order).toEqual(['told', 'refresh returned'])
  })

  it('runs when the set of audio devices changes', async () => {
    const { audioContext } = await load()
    audioContext()
    mediaDevices.dispatchEvent(new Event('devicechange'))
    await settle()
    expect(opened[0].sinks).toEqual([{ type: 'none' }, ''])
  })

  it('runs when the app comes back to the foreground, but not as it leaves', async () => {
    const { audioContext } = await load()
    audioContext()

    doc.hidden = true
    doc.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(opened[0].sinks).toEqual([])

    doc.hidden = false
    doc.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(opened[0].sinks).toEqual([{ type: 'none' }, ''])
  })

  it('collapses overlapping refreshes into one, then repeats once', async () => {
    const { audioContext, refreshAudioRoute } = await load()
    audioContext()
    let release = (): void => {}
    sinkGate = new Promise((resolve) => (release = () => resolve()))

    void refreshAudioRoute()
    void refreshAudioRoute()
    void refreshAudioRoute()
    sinkGate = null
    release()
    await settle()

    // Three asks, two passes: the one that was running, and one for everything
    // that arrived while it was — never three overlapping sink changes.
    expect(opened[0].sinks).toEqual([{ type: 'none' }, '', { type: 'none' }, ''])
  })
})

describe('refreshAudioRoute without setSinkId', () => {
  beforeEach(() => {
    install({ routable: false })
  })

  it('closes the context and opens another, which picks the device afresh', async () => {
    const { audioContext, refreshAudioRoute } = await load()
    const first = audioContext()
    await refreshAudioRoute()

    expect(opened).toHaveLength(2)
    expect(opened[0].closed).toBe(true)
    expect(audioContext()).not.toBe(first)
    expect(audioContext()).toBe(opened[1] as unknown as AudioContext)
  })

  it('tells the rest of the audio that its nodes are on a dead context', async () => {
    const { audioContext, refreshAudioRoute, onAudioContextReset } = await load()
    const told: string[] = []
    onAudioContextReset(() => told.push('reset'))

    audioContext()
    await refreshAudioRoute()

    expect(told).toEqual(['reset'])
    // Warned before the replacement is playing, never after.
    expect(opened).toHaveLength(2)
  })
})
