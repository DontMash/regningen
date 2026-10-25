import { Store } from '@tanstack/store'
import * as m from '@/paraglide/messages'
import { toast } from '@/components/ui/toast'

import {
  THEME_STORAGE_KEY,
  applyThemeModeToRoot,
  defaultThemeMode,
  normalizeThemeMode,
} from './theme-policy'
import type { ThemeMode } from './theme-policy'

export { isThemeMode } from './theme-policy'
export type { ThemeMode } from './theme-policy'

export const themeModeLabels: Record<ThemeMode, string> = {
  get auto() {
    return m.shell_theme_system()
  },
  get light() {
    return m.shell_theme_light()
  },
  get dark() {
    return m.shell_theme_dark()
  },
}

type ThemeState = {
  mode: ThemeMode
  selectedInSession?: boolean
}

export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

export function createThemeStore() {
  const store = new Store<ThemeState>({ mode: defaultThemeMode })

  function setMode(mode: ThemeMode, storage?: ThemeStorage) {
    store.setState(() => ({ mode, selectedInSession: true }))
    storage?.setItem(THEME_STORAGE_KEY, mode)
  }

  function restore(storage: ThemeStorage): ThemeMode {
    // Opening the mobile menu mounts another shortcut. A session choice must
    // not be replaced by an older preference after a failed write.
    if (store.state.selectedInSession) return store.state.mode
    const mode = normalizeThemeMode(storage.getItem(THEME_STORAGE_KEY))

    store.setState(() => ({ mode }))

    return mode
  }

  function cycle(storage?: ThemeStorage): ThemeMode {
    const nextMode = nextThemeMode(store.state.mode)

    setMode(nextMode, storage)

    return nextMode
  }

  return { store, restore, cycle, setMode }
}

export const themeStore = createThemeStore()

function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'
}

function isStorageUnavailable(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'SecurityError' || error.name === 'QuotaExceededError')
  )
}

/** Both controls commit the session choice before attempting optional persistence.
 * Omitting the mode selects the header shortcut's next mode.
 */
export function selectThemeMode(
  mode = nextThemeMode(themeStore.store.state.mode),
) {
  applyThemeMode(mode)
  themeStore.setMode(mode)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error
    console.warn('Appearance preference persistence failed', {
      mode,
      cause: error,
    })
    toast.add({
      title: m.settings_theme_failed(),
      type: 'warning',
      priority: 'high',
    })
  }
}

export function restoreBrowserTheme() {
  let mode = themeStore.store.state.mode
  if (!themeStore.store.state.selectedInSession) {
    try {
      mode = themeStore.restore(window.localStorage)
    } catch (error) {
      if (!isStorageUnavailable(error)) throw error
      console.warn('Appearance preference restoration failed', { cause: error })
    }
  }
  applyThemeMode(mode)
}

export function applyThemeMode(mode: ThemeMode) {
  applyThemeModeToRoot(mode, window, document.documentElement)
}
