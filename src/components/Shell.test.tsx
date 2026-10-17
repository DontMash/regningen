// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Header from './Header'
import Footer from './Footer'
import ThemeToggle from './ThemeToggle'
import { FieldHint } from './FieldHint'
import { PwaProvider } from '@/features/pwa/PwaProvider'
import { ReleaseNotesProvider } from '@/features/release-notes/ReleaseNotesProvider'
import {
  triggerPwaOfflineReady,
  resetPwaRegisterMock,
} from '../../tests/support/vitest/pwa-register'
import { themeStore } from '@/lib/theme-store'
import { setLocale } from '@/paraglide/runtime'
import { BUSINESS_PROFILE_STORAGE_KEY } from '@/features/invoicing/business-profile-repository'
import {
  disposeTestRouters,
  renderAtRoute,
} from '../../tests/support/vitest/render'

function profileBackup(businessName: string) {
  return JSON.stringify({
    format: 'regningen-business-profile',
    version: 1,
    profile: {
      businessName,
      serviceDescription: '',
      ownerName: 'Erika Beispiel',
      street: 'Hauptstraße 12',
      postalCode: '20095',
      town: 'Hamburg',
      phone: '',
      mobile: '',
      iban: 'DE89370400440532013000',
      vatId: 'DE123456789',
      taxNumber: '',
    },
  })
}

function mediaQuery(
  initialMatches: boolean,
  query = '(prefers-color-scheme: dark)',
) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const media = {
    media: query,
    get matches() {
      return matches
    },
    onchange: null,
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      },
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener)
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    setMatches: (value: boolean) => {
      matches = value
      for (const listener of listeners)
        listener({ matches } as MediaQueryListEvent)
    },
  }
  return media as unknown as MediaQueryList & {
    setMatches: (value: boolean) => void
  }
}

beforeEach(() => {
  setLocale('de', { reload: false })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.localStorage.clear()
  themeStore.store.setState(() => ({ mode: 'auto' }))
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  cleanup()
  resetPwaRegisterMock()
  disposeTestRouters()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('application shell', () => {
  it('labels the theme control in English and resolves mode names in the active render locale', async () => {
    setLocale('en', { reload: false })
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery(false)),
    )
    const { rerender } = render(<ThemeToggle />)

    const toggle = screen.getByRole('button', { name: 'Toggle appearance' })
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).toHaveAttribute('title', 'Appearance: System')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('title', 'Appearance: Light')
    expect(window.localStorage.getItem('theme')).toBe('light')

    setLocale('de', { reload: false })
    rerender(<ThemeToggle />)
    expect(
      screen.getByRole('button', { name: 'Darstellung umschalten' }),
    ).toHaveAttribute('title', 'Darstellung: Hell')
  })

  it('announces a field hint in English while retaining the supplied label and content', async () => {
    setLocale('en', { reload: false })
    const user = userEvent.setup()
    render(
      <FieldHint label="Business name">
        Use the registered business name.
      </FieldHint>,
    )

    await user.click(
      screen.getByRole('button', { name: 'Hint for Business name' }),
    )
    expect(
      await screen.findByText('Use the registered business name.'),
    ).toBeVisible()
  })

  it('provides English desktop and mobile navigation without translating the saved business name', async () => {
    setLocale('en', { reload: false })
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery(false)),
    )
    window.localStorage.setItem(
      BUSINESS_PROFILE_STORAGE_KEY,
      profileBackup('Studio Beispiel'),
    )
    await renderAtRoute('/', Header)

    expect(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Invoice' })).toHaveAttribute(
      'href',
      '/invoice',
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    )
    expect(screen.getByLabelText('Change language')).toBeVisible()
    expect(await screen.findByText('Studio Beispiel')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = await screen.findByRole('dialog', { name: 'Navigation' })
    expect(
      within(menu).getByRole('navigation', { name: 'Menu navigation' }),
    ).toBeVisible()
    expect(within(menu).getByRole('link', { name: 'Invoice' })).toHaveAttribute(
      'href',
      '/invoice',
    )
    expect(
      within(menu).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '/settings')
    await user.click(within(menu).getByRole('button', { name: 'Close menu' }))
    expect(
      screen.queryByRole('dialog', { name: 'Navigation' }),
    ).not.toBeInTheDocument()
  })

  it('uses English footer actions and safe English legal destinations while retaining the brand', async () => {
    setLocale('en', { reload: false })
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery(false)),
    )
    await renderAtRoute('/', function FooterWithProviders() {
      return (
        <PwaProvider>
          <ReleaseNotesProvider>
            <Footer />
          </ReleaseNotesProvider>
        </PwaProvider>
      )
    })
    await user.click(await screen.findByRole('button', { name: 'Understood' }))

    const footer = screen.getByRole('contentinfo')
    expect(
      within(footer).getByRole('link', { name: 'regningen' }),
    ).toHaveAttribute('href', '/')
    expect(
      within(footer).getByRole('navigation', { name: 'Feature navigation' }),
    ).toBeVisible()
    for (const [name, href] of [
      ['Imprint', 'https://www.soren.codes/en/imprint'],
      ['Privacy Policy', 'https://www.soren.codes/en/privacy'],
    ]) {
      const legalLink = within(footer).getByRole('link', { name })
      expect(legalLink).toHaveAttribute('href', href)
      expect(legalLink).toHaveAttribute('target', '_blank')
      expect(legalLink).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(
      within(footer).getByRole('link', { name: 'Back to top' }),
    ).toHaveAttribute('href', '#top')
    expect(footer).toHaveTextContent('Made with love by soren')
    act(() => triggerPwaOfflineReady())
    expect(await within(footer).findByRole('status')).toHaveTextContent(
      'Ready offline',
    )
    await user.click(
      within(footer).getByRole('button', {
        name: /Show release notes for version v/,
      }),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Release notes' }),
    ).toBeVisible()
  })

  it('shows navigation without a profile name and then shows the saved business name', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery(false)),
    )
    await renderAtRoute('/', function HeaderWithPwa() {
      return (
        <PwaProvider>
          <Header />
        </PwaProvider>
      )
    })
    expect(
      await screen.findByRole('navigation', { name: 'Hauptnavigation' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Rechnung' })).toHaveAttribute(
      'href',
      '/invoice',
    )
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute(
      'href',
      '/settings',
    )
    expect(screen.queryByText('Nordlicht Catering')).not.toBeInTheDocument()

    window.localStorage.setItem(
      BUSINESS_PROFILE_STORAGE_KEY,
      profileBackup('Nordlicht Catering'),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    expect(await screen.findByText('Nordlicht Catering')).toBeVisible()
  })

  it('shows saved business context in the named menu, keeps it open for theme changes, and selects the Invoice destination', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery(false)),
    )
    window.localStorage.setItem(
      BUSINESS_PROFILE_STORAGE_KEY,
      profileBackup('Nordlicht Catering'),
    )
    await renderAtRoute('/', Header)
    await user.click(screen.getByRole('button', { name: 'Menü öffnen' }))
    const menu = await screen.findByRole('dialog', { name: 'Navigation' })
    expect(within(menu).getByText('Nordlicht Catering')).toBeVisible()
    expect(
      within(menu).getByRole('link', { name: 'Einstellungen' }),
    ).toHaveAttribute('href', '/settings')
    const theme = within(menu).getByRole('button', {
      name: 'Darstellung umschalten',
    })
    await user.click(theme)
    expect(theme).toHaveAttribute('title', 'Darstellung: Hell')
    expect(menu).toBeVisible()
    await user.click(within(menu).getByRole('link', { name: 'Rechnung' }))
    expect(
      await screen.findByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('dialog', { name: 'Navigation' }),
    ).not.toBeInTheDocument()
  })

  it('dismisses the menu with focus restoration and clears it when the desktop media query matches', async () => {
    const user = userEvent.setup()
    const desktop = mediaQuery(false, '(min-width: 1024px)')
    const systemTheme = mediaQuery(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) =>
        query === desktop.media ? desktop : systemTheme,
      ),
    )
    await renderAtRoute('/', Header)
    const trigger = screen.getByRole('button', { name: 'Menü öffnen' })
    await user.click(trigger)
    const menu = await screen.findByRole('dialog', { name: 'Navigation' })
    await user.click(
      within(menu).getByRole('button', { name: 'Menü schließen' }),
    )
    await waitFor(() => expect(menu).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    expect(
      await screen.findByRole('dialog', { name: 'Navigation' }),
    ).toBeVisible()
    act(() => desktop.setMatches(true))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Navigation' }),
      ).not.toBeInTheDocument(),
    )
    act(() => desktop.setMatches(false))
    expect(
      screen.queryByRole('dialog', { name: 'Navigation' }),
    ).not.toBeInTheDocument()
    await user.click(trigger)
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Navigation' }),
      ).getByRole('link', { name: 'Einstellungen' }),
    )
    expect(
      await screen.findByRole('heading', {
        name: 'Allgemeine Einstellungen geöffnet',
      }),
    ).toBeVisible()
  })

  it('restores the system theme, persists explicit choices, and follows OS changes only in system mode', async () => {
    const user = userEvent.setup()
    const media = mediaQuery(true)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    window.localStorage.setItem('theme', 'unknown')

    render(<ThemeToggle />)
    const toggle = screen.getByRole('button', {
      name: 'Darstellung umschalten',
    })
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).toHaveAttribute('title', 'Darstellung: System')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('title', 'Darstellung: Hell')
    expect(window.localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })
    media.setMatches(false)
    media.setMatches(true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('title', 'Darstellung: Dunkel')
    expect(window.localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })
    media.setMatches(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('title', 'Darstellung: System')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })
    media.setMatches(true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })
  })
})
