// @vitest-environment jsdom
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemeMode,
  createThemeStore,
  restoreBrowserTheme,
  themeStore,
} from './theme-store'
import { THEME_INIT_SCRIPT } from './theme-policy'

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
  it.each(['light', 'dark', 'auto'])(
    'restores a saved %s theme mode',
    (saved) => {
      const theme = createThemeStore()
      const storage = createStorage(saved)

      expect(theme.restore(storage)).toBe(saved)
      expect(theme.store.state.mode).toBe(saved)
    },
  )

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

describe('browser theme restoration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    themeStore.store.setState(() => ({ mode: 'auto' }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['auto', false, 'light'],
    ['auto', true, 'dark'],
    ['sepia', false, 'light'],
    ['sepia', true, 'dark'],
    [null, false, 'light'],
    [null, true, 'dark'],
  ])(
    'runtime and first paint agree for %s with system dark=%s',
    (stored, dark, expected) => {
      vi.stubGlobal('matchMedia', () => ({ matches: dark }))
      if (stored !== null) window.localStorage.setItem('theme', stored)

      runInNewContext(THEME_INIT_SCRIPT, { window, document })
      expect(document.documentElement.getAttribute('data-theme')).toBe(expected)
      expect(document.documentElement.style.colorScheme).toBe(expected)

      document.documentElement.removeAttribute('data-theme')
      document.documentElement.style.colorScheme = ''
      restoreBrowserTheme()

      expect(themeStore.store.state.mode).toBe(
        stored === 'light' || stored === 'dark' ? stored : 'auto',
      )
      expect(document.documentElement.getAttribute('data-theme')).toBe(expected)
      expect(document.documentElement.style.colorScheme).toBe(expected)
    },
  )

  it.each([false, true])(
    'runtime and first paint follow system dark=%s when storage is denied',
    (dark) => {
      vi.stubGlobal('matchMedia', () => ({ matches: dark }))
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError')
      })
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      runInNewContext(THEME_INIT_SCRIPT, { window, document })
      expect(document.documentElement.getAttribute('data-theme')).toBe(
        dark ? 'dark' : 'light',
      )
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.style.colorScheme = ''
      restoreBrowserTheme()

      expect(themeStore.store.state.mode).toBe('auto')
      expect(document.documentElement.getAttribute('data-theme')).toBe(
        dark ? 'dark' : 'light',
      )
      expect(document.documentElement.style.colorScheme).toBe(
        dark ? 'dark' : 'light',
      )
    },
  )

  it('updates automatic mode when the system preference changes', () => {
    const preference = { matches: false }
    vi.stubGlobal('matchMedia', () => preference)
    applyThemeMode('auto')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    preference.matches = true
    applyThemeMode('auto')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
