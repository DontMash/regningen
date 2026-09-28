import { useEffect, useState } from 'react'
import { IconSun, IconMoon, IconDeviceDesktop } from '@tabler/icons-react'
import { useSelector } from '@tanstack/react-store'
import type { ThemeMode } from '@/lib/theme-store'
import { themeModeLabels, themeStore } from '@/lib/theme-store'
import { Button } from '@/components/ui/button'

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode

  document.documentElement.setAttribute('data-theme', resolved)

  document.documentElement.style.colorScheme = resolved
}

export default function ThemeToggle() {
  const mode = useSelector(themeStore.store, (state) => state.mode)
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
    <Button
      variant="outline"
      size="icon"
      type="button"
      disabled={!isHydrated}
      onClick={toggleMode}
      aria-label="Darstellung umschalten"
      title={`Darstellung: ${themeModeLabels[mode]}`}
    >
      {mode === 'light' && <IconSun data-icon="inline-start" />}
      {mode === 'dark' && <IconMoon data-icon="inline-start" />}
      {mode === 'auto' && <IconDeviceDesktop data-icon="inline-start" />}
    </Button>
  )
}
