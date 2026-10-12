import { describe, expect, it } from 'vitest'
import {
  consumeUpdateAcknowledgment,
  UPDATE_ACKNOWLEDGMENT_KEY,
} from './update-session'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('update acknowledgment session marker', () => {
  it('acknowledges only after the tab reloads into the intended release', () => {
    const storage = createStorage()
    storage.setItem(UPDATE_ACKNOWLEDGMENT_KEY, '2.1.0')

    expect(consumeUpdateAcknowledgment(storage, '2.1.0')).toBe(true)
    expect(storage.getItem(UPDATE_ACKNOWLEDGMENT_KEY)).toBeNull()
  })

  it('does not acknowledge a release that failed to become the running version', () => {
    const storage = createStorage()
    storage.setItem(UPDATE_ACKNOWLEDGMENT_KEY, '2.1.0')

    expect(consumeUpdateAcknowledgment(storage, '2.0.0')).toBe(false)
    expect(storage.getItem(UPDATE_ACKNOWLEDGMENT_KEY)).toBeNull()
    expect(consumeUpdateAcknowledgment(storage, '2.0.0')).toBe(false)
  })

  it('leaves ordinary launches without an acceptance marker unacknowledged', () => {
    const storage = createStorage()

    expect(consumeUpdateAcknowledgment(storage, '2.1.0')).toBe(false)
  })

  it('propagates session-storage failures rather than claiming acknowledgment', () => {
    const storage = {
      getItem() {
        throw new Error('session storage blocked')
      },
      setItem() {},
      removeItem() {},
    }

    expect(() => consumeUpdateAcknowledgment(storage, '2.1.0')).toThrow(
      'session storage blocked',
    )
  })
})
