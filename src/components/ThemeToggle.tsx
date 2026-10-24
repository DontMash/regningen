import { useEffect, useState } from 'react'
import { IconSun, IconMoon, IconDeviceDesktop } from '@tabler/icons-react'
import { useSelector } from '@tanstack/react-store'
import {
  applyThemeMode,
  restoreBrowserTheme,
  selectThemeMode,
  themeModeLabels,
  themeStore,
} from '@/lib/theme-store'
import { Button } from '@/components/ui/button'
import * as m from '@/paraglide/messages'

export default function ThemeToggle() {
  const mode = useSelector(themeStore.store, (state) => state.mode)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    restoreBrowserTheme()
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
    selectThemeMode()
  }

  return (
    <Button
      variant="outline"
      size="icon"
      type="button"
      disabled={!isHydrated}
      onClick={toggleMode}
      aria-label={m.shell_theme_toggle()}
      title={m.shell_theme_title({ mode: themeModeLabels[mode] })}
    >
      {mode === 'light' && <IconSun data-icon="inline-start" />}
      {mode === 'dark' && <IconMoon data-icon="inline-start" />}
      {mode === 'auto' && <IconDeviceDesktop data-icon="inline-start" />}
    </Button>
  )
}
