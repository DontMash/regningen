import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { Link } from '@tanstack/react-router'
import { IconFile, IconMenu2, IconSettings, IconX } from '@tabler/icons-react'
import {
  useBusinessProfile,
  useProfileStorageSync,
} from '@/features/invoicing/business-profile-query'
import ThemeToggle from './ThemeToggle'
import { LanguageSelect } from '@/components/LanguageSelect'
import * as m from '@/paraglide/messages'
import { buttonVariants } from './ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from './ui/drawer'

function InvoiceLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/invoice" onClick={onClick} className={buttonVariants()}>
      <IconFile data-icon="inline-start" />
      {m.shell_invoice()}
    </Link>
  )
}

function SettingsShortcut({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      to="/settings"
      onClick={onClick}
      aria-label={m.shell_settings()}
      title={m.shell_settings()}
      className={buttonVariants({ variant: 'outline', size: 'icon' })}
    >
      <IconSettings aria-hidden="true" />
    </Link>
  )
}

export default function Header() {
  const { data: profile } = useBusinessProfile()
  useProfileStorageSync()
  const businessName = profile?.businessName.trim()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeFocus = useRef<'trigger' | 'content' | 'none'>('trigger')

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) {
        closeFocus.current = 'none'
        setMenuOpen(false)
      }
    }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  function closeForNavigation() {
    closeFocus.current = 'content'
    setMenuOpen(false)
  }

  return (
    <header id="top" className="border-b bg-background">
      <nav
        aria-label={m.shell_main_navigation()}
        className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="wordmark shrink-0 text-foreground no-underline"
          >
            regningen
          </Link>
          {businessName && (
            <span
              className="paragraph-small hidden max-w-24 truncate text-muted-foreground sm:max-w-48 lg:inline"
              title={businessName}
            >
              {businessName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 lg:flex">
            <InvoiceLink />
            <SettingsShortcut />
            <ThemeToggle />
          </div>
          <LanguageSelect compact />
          <Drawer
            open={menuOpen}
            onOpenChange={(open) => {
              if (open) closeFocus.current = 'trigger'
              setMenuOpen(open)
            }}
            swipeDirection="right"
            onOpenChangeComplete={(open) => {
              if (
                !open &&
                closeFocus.current === 'content' &&
                !document.querySelector('[role="alertdialog"]')
              ) {
                // Focus the stable main region, not a child replaced by route loading.
                document
                  .getElementById('hauptinhalt')
                  ?.focus({ preventScroll: true })
              }
            }}
          >
            <DrawerTrigger
              aria-label={m.shell_open_menu()}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'icon' }),
                'lg:hidden',
              )}
            >
              <IconMenu2 aria-hidden="true" />
            </DrawerTrigger>
            <DrawerContent
              finalFocus={() => closeFocus.current === 'trigger'}
              className="h-dvh data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:24rem] max-sm:data-[swipe-direction=right]:rounded-none"
            >
              <div className="flex shrink-0 items-center justify-end p-4">
                <DrawerTitle className="sr-only">
                  {m.shell_navigation()}
                </DrawerTitle>
                <DrawerClose
                  aria-label={m.shell_close_menu()}
                  className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                >
                  <IconX aria-hidden="true" />
                </DrawerClose>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
                {businessName && (
                  <p className="paragraph-small wrap-anywhere text-muted-foreground">
                    {businessName}
                  </p>
                )}
                <nav
                  aria-label={m.shell_menu_navigation()}
                  className="flex flex-col gap-3"
                >
                  <InvoiceLink onClick={closeForNavigation} />
                </nav>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3 p-4">
                <SettingsShortcut onClick={closeForNavigation} />
                <ThemeToggle />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </nav>
    </header>
  )
}
