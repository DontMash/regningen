// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { selectThemeMode, themeStore } from '@/lib/theme-store'
import { PwaProvider } from '@/features/pwa/PwaProvider'
import { disposeInvoiceDraftPersistence } from '@/features/invoicing/invoice-draft-store'
import { resetPwaRegisterMock } from '../../../tests/support/vitest/pwa-register'
import GeneralSettingsPage from './GeneralSettingsPage'
import ThemeToggle from '@/components/ThemeToggle'
import { Toaster } from '@/components/ui/toast'
import { setLocale } from '@/paraglide/runtime'
import { saveBusinessProfile } from '../../../tests/support/vitest/business-profile'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import { createBrowserBusinessProfileRepository } from '@/features/invoicing/business-profile-repository'

beforeEach(() => {
  setLocale('de', { reload: false })
  window.localStorage.clear()
  window.sessionStorage.clear()
  themeStore.store.setState(() => ({ mode: 'auto' }))
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})
afterEach(async () => {
  cleanup()
  await disposeInvoiceDraftPersistence()
  resetPwaRegisterMock()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('focuses Cancel and preserves the saved Business Profile when application reset is cancelled', async () => {
  const user = userEvent.setup()
  const profile = createBusinessProfileScenario()
  saveBusinessProfile(profile)
  render(
    <PwaProvider>
      <GeneralSettingsPage />
    </PwaProvider>,
  )
  await user.click(
    await screen.findByRole('button', { name: 'Anwendung zurücksetzen' }),
  )
  const cancel = screen.getByRole('button', { name: 'Abbrechen' })
  await waitFor(() => expect(cancel).toHaveFocus())
  await user.click(cancel)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(await createBrowserBusinessProfileRepository().loadProfile()).toEqual(
    profile,
  )
})

it('reports an incomplete reset without losing the settings page and permits retry', async () => {
  const user = userEvent.setup()
  saveBusinessProfile(createBusinessProfileScenario())
  const remove = Storage.prototype.removeItem
  const fault = vi
    .spyOn(Storage.prototype, 'removeItem')
    .mockImplementation(function (this: Storage, key: string) {
      if (key === 'regningen.business-profile')
        throw new Error('Löschen blockiert')
      remove.call(this, key)
    })
  render(
    <PwaProvider>
      <GeneralSettingsPage />
    </PwaProvider>,
  )
  await user.click(
    screen.getByRole('button', { name: 'Anwendung zurücksetzen' }),
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Anwendung zurücksetzen',
    }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Anwendung nicht vollständig zurückgesetzt',
  )
  expect(screen.getByRole('heading', { name: 'Allgemein' })).toBeVisible()
  fault.mockRestore()
  await user.click(
    screen.getByRole('button', { name: 'Anwendung zurücksetzen' }),
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Anwendung zurücksetzen',
    }),
  )
  await waitFor(async () =>
    expect(
      await createBrowserBusinessProfileRepository().loadProfile(),
    ).toBeNull(),
  )
})

it('retains a fixed Invoice Language across remounts and can restore automatic following', async () => {
  const user = userEvent.setup()
  const settings = () =>
    render(
      <PwaProvider>
        <GeneralSettingsPage />
      </PwaProvider>,
    )
  settings()
  const invoiceLanguage = () =>
    screen.getByRole('combobox', { name: 'Rechnungssprache' })
  expect(invoiceLanguage()).toHaveTextContent('Oberflächensprache folgen')
  await user.click(invoiceLanguage())
  await user.click(await screen.findByRole('option', { name: 'English' }))
  expect(invoiceLanguage()).toHaveTextContent('English')
  cleanup()
  settings()
  await waitFor(() => expect(invoiceLanguage()).toHaveTextContent('English'))
  await user.click(invoiceLanguage())
  await user.click(
    await screen.findByRole('option', {
      name: 'Oberflächensprache folgen',
    }),
  )
  expect(invoiceLanguage()).toHaveTextContent('Oberflächensprache folgen')
})

it('presents General Settings and both language choices in English', async () => {
  setLocale('en', { reload: false })
  render(
    <PwaProvider>
      <GeneralSettingsPage />
    </PwaProvider>,
  )
  expect(screen.getByRole('heading', { name: 'General' })).toBeVisible()
  expect(
    screen.getByRole('combobox', { name: 'Interface language' }),
  ).toHaveTextContent('English')
  expect(
    screen.getByRole('combobox', { name: 'Invoice language' }),
  ).toHaveTextContent('Follow interface language')
})

for (const locale of ['de', 'en'] as const) {
  for (const control of ['header', 'settings'] as const) {
    it.each(['access', 'write'] as const)(
      `keeps ${control} and mounted appearance controls coherent after %s failure (${locale})`,
      async (fault) => {
        setLocale(locale, { reload: false })
        const user = userEvent.setup()
        vi.stubGlobal(
          'matchMedia',
          vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          })),
        )
        render(
          <Toaster>
            <PwaProvider>
              <ThemeToggle />
              <GeneralSettingsPage />
            </PwaProvider>
          </Toaster>,
        )
        const toggleName =
          locale === 'de' ? 'Darstellung umschalten' : 'Toggle appearance'
        const lightName = locale === 'de' ? 'Hell' : 'Light'
        const title =
          locale === 'de' ? 'Darstellung: Hell' : 'Appearance: Light'
        const toggle = await screen.findByRole('button', { name: toggleName })
        await waitFor(() => expect(toggle).toBeEnabled())
        expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
        const failure = new DOMException(
          `Injected ${fault} failure`,
          fault === 'access' ? 'SecurityError' : 'QuotaExceededError',
        )
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        if (fault === 'access') {
          vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw failure
          })
        } else {
          vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw failure
          })
        }
        await user.click(
          control === 'header'
            ? toggle
            : screen.getByRole('button', { name: lightName }),
        )
        expect(toggle).toHaveAttribute('title', title)
        expect(screen.getByRole('button', { name: lightName })).toHaveAttribute(
          'aria-pressed',
          'true',
        )
        expect(document.documentElement).toHaveAttribute('data-theme', 'light')
        expect(document.documentElement.style.colorScheme).toBe('light')
        expect(await screen.findByRole('alert')).toHaveTextContent(
          locale === 'de'
            ? 'Darstellung konnte nicht gespeichert werden. Die Auswahl gilt für diese Sitzung.'
            : 'Appearance could not be saved. Your choice applies for this session.',
        )
        expect(warn).toHaveBeenCalledWith(
          'Appearance preference persistence failed',
          { mode: 'light', cause: failure },
        )
        cleanup()
        render(<ThemeToggle />)
        expect(
          await screen.findByRole('button', { name: toggleName }),
        ).toHaveAttribute('title', title)
        expect(document.documentElement).toHaveAttribute('data-theme', 'light')
      },
    )
  }
}

it('does not conceal a programming defect in preference persistence', () => {
  const failure = new TypeError('Unexpected implementation defect')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw failure
  })
  expect(() => selectThemeMode('dark')).toThrow(failure)
})

it('applies and persists explicit appearance choices and can return to System mode', async () => {
  const user = userEvent.setup()
  render(
    <PwaProvider>
      <ThemeToggle />
      <GeneralSettingsPage />
    </PwaProvider>,
  )
  const toggle = await screen.findByRole('button', {
    name: 'Darstellung umschalten',
  })
  await waitFor(() => expect(toggle).toBeEnabled())
  await user.click(toggle)
  expect(toggle).toHaveAttribute('title', 'Darstellung: Hell')
  expect(screen.getByRole('button', { name: 'Hell' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  expect(window.localStorage.getItem('theme')).toBe('light')
  await user.click(await screen.findByRole('button', { name: 'Dunkel' }))
  expect(screen.getByRole('button', { name: 'Dunkel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(window.localStorage.getItem('theme')).toBe('dark')
  expect(toggle).toHaveAttribute('title', 'Darstellung: Dunkel')
  await user.click(screen.getByRole('button', { name: 'System' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  )
  expect(window.localStorage.getItem('theme')).toBe('auto')
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
})
