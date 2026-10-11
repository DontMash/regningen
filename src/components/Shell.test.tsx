// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Header from './Header'
import ThemeToggle from './ThemeToggle'
import { themeStore } from '@/lib/theme-store'
import { BUSINESS_PROFILE_STORAGE_KEY } from '@/features/invoicing/business-profile-repository'
import { disposeTestRouters, renderAtRoute } from '../../tests/helpers/render'

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

function mediaQuery(initiallyDark: boolean) {
  let matches = initiallyDark
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const media = {
    media: '(prefers-color-scheme: dark)',
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
    setDark: (value: boolean) => {
      matches = value
      for (const listener of listeners)
        listener({ matches } as MediaQueryListEvent)
    },
  }
  return media as unknown as MediaQueryList & {
    setDark: (value: boolean) => void
  }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.localStorage.clear()
  themeStore.store.setState(() => ({ mode: 'auto' }))
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  cleanup()
  disposeTestRouters()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('application shell', () => {
  it('shows navigation without a profile name and then shows the saved business name', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery(false)),
    )
    await renderAtRoute('/', Header)
    expect(
      await screen.findByRole('navigation', { name: 'Hauptnavigation' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Rechnung' })).toHaveAttribute(
      'href',
      '/invoice',
    )
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/business-profile',
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
    media.setDark(false)
    media.setDark(true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('title', 'Darstellung: Dunkel')
    expect(window.localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })
    media.setDark(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('title', 'Darstellung: System')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })
    media.setDark(true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })
  })
})
