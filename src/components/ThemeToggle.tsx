import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import type { ThemeMode } from '#/lib/theme-store'
import { themeModeLabels, themeStore } from '#/lib/theme-store'

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)

  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', mode)
  }

  document.documentElement.style.colorScheme = resolved
}

export default function ThemeToggle() {
  const mode = useStore(themeStore.store, (state) => state.mode)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    applyThemeMode(themeStore.restore(window.localStorage))
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (mode !== 'auto') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeMode('auto')

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  function toggleMode() {
    applyThemeMode(themeStore.cycle(window.localStorage))
  }

  return (
    <button
      type="button"
      disabled={!isHydrated}
      onClick={toggleMode}
      aria-label="Darstellung umschalten"
      title={`Darstellung: ${themeModeLabels[mode]}`}
      className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {themeModeLabels[mode]}
    </button>
  )
}
