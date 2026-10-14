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
import { themeStore } from '@/lib/theme-store'
import { PwaProvider } from '@/features/pwa/PwaProvider'
import { disposeInvoiceDraftPersistence } from '@/features/invoicing/invoice-draft-store'
import { resetPwaRegisterMock } from '../../../tests/support/vitest/pwa-register'
import GeneralSettingsPage from './GeneralSettingsPage'
import { saveBusinessProfile } from '../../../tests/support/vitest/business-profile'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import { createBrowserBusinessProfileRepository } from '@/features/invoicing/business-profile-repository'

beforeEach(() => {
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

it('applies and persists explicit appearance choices and can return to System mode', async () => {
  const user = userEvent.setup()
  render(
    <PwaProvider>
      <GeneralSettingsPage />
    </PwaProvider>,
  )
  await user.click(await screen.findByRole('button', { name: 'Dunkel' }))
  expect(screen.getByRole('button', { name: 'Dunkel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(window.localStorage.getItem('theme')).toBe('dark')
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
