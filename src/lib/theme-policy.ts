export const THEME_STORAGE_KEY = 'theme'

export type ThemeMode = 'auto' | 'light' | 'dark'

// This factory is serialized into the first-paint script. Keep it closure-free:
// all policy helpers must stay inside it so minification preserves their bindings.
function createThemePolicy() {
  const defaultThemeMode: ThemeMode = 'auto'

  function isThemeMode(value: unknown): value is ThemeMode {
    return value === 'auto' || value === 'light' || value === 'dark'
  }

  function normalizeThemeMode(value: unknown): ThemeMode {
    return isThemeMode(value) ? value : defaultThemeMode
  }

  function applyThemeModeToRoot(
    mode: ThemeMode,
    browser: Pick<Window, 'matchMedia'>,
    root: HTMLElement,
  ) {
    const prefersDark = browser.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
    root.setAttribute('data-theme', resolved)
    root.style.colorScheme = resolved
  }

  return {
    defaultThemeMode,
    isThemeMode,
    normalizeThemeMode,
    applyThemeModeToRoot,
  }
}

export const {
  defaultThemeMode,
  isThemeMode,
  normalizeThemeMode,
  applyThemeModeToRoot,
} = createThemePolicy()

function initializeTheme(
  policy: ReturnType<typeof createThemePolicy>,
  storageKey: string,
) {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(storageKey)
  } catch {
    // Denied storage still permits the system preference on the first paint.
  }
  try {
    policy.applyThemeModeToRoot(
      policy.normalizeThemeMode(stored),
      window,
      document.documentElement,
    )
  } catch {
    // First-paint enhancement must not interrupt startup if browser APIs fail.
  }
}

// Serialize the complete helper scope, not individual functions with free names.
// No browser globals are accessed until this script executes in the document.
export const THEME_INIT_SCRIPT = `(${initializeTheme.toString()})((${createThemePolicy.toString()})(),${JSON.stringify(THEME_STORAGE_KEY)});`
