import { describe, expect, it } from 'vitest'
import { createThemeStore } from './theme-store'

function createStorage(value: string | null = null) {
  const values = new Map<string, string>()
  if (value !== null) values.set('theme', value)

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, nextValue: string) => {
      values.set(key, nextValue)
    },
  }
}

describe('theme preference store', () => {
  it('restores a saved theme mode', () => {
    const theme = createThemeStore()
    const storage = createStorage('dark')

    expect(theme.restore(storage)).toBe('dark')
    expect(theme.store.state.mode).toBe('dark')
  })

  it('defaults to system mode for an invalid saved value', () => {
    const theme = createThemeStore()
    const storage = createStorage('sepia')

    expect(theme.restore(storage)).toBe('auto')
    expect(theme.store.state.mode).toBe('auto')
  })

  it('cycles through system, light, and dark while persisting each choice', () => {
    const theme = createThemeStore()
    const storage = createStorage()

    expect(theme.cycle(storage)).toBe('light')
    expect(storage.getItem('theme')).toBe('light')
    expect(theme.cycle(storage)).toBe('dark')
    expect(storage.getItem('theme')).toBe('dark')
    expect(theme.cycle(storage)).toBe('auto')
    expect(storage.getItem('theme')).toBe('auto')
  })
})
