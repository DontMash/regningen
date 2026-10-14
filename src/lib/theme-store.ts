import { Store } from '@tanstack/store'

export type ThemeMode = 'auto' | 'light' | 'dark'

export const themeModeLabels: Record<ThemeMode, string> = {
  auto: 'System',
  light: 'Hell',
  dark: 'Dunkel',
}

type ThemeState = {
  mode: ThemeMode
}

export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'theme'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark'
}

export function createThemeStore() {
  const store = new Store<ThemeState>({ mode: 'auto' })

  function setMode(mode: ThemeMode, storage?: ThemeStorage) {
    store.setState(() => ({ mode }))
    storage?.setItem(STORAGE_KEY, mode)
  }

  function restore(storage: ThemeStorage): ThemeMode {
    const savedMode = storage.getItem(STORAGE_KEY)
    const mode = isThemeMode(savedMode) ? savedMode : 'auto'

    store.setState(() => ({ mode }))

    return mode
  }

  function cycle(storage?: ThemeStorage): ThemeMode {
    const nextMode =
      store.state.mode === 'auto'
        ? 'light'
        : store.state.mode === 'light'
          ? 'dark'
          : 'auto'

    setMode(nextMode, storage)

    return nextMode
  }

  return { store, restore, cycle, setMode }
}

export const themeStore = createThemeStore()

export function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.style.colorScheme = resolved
}
