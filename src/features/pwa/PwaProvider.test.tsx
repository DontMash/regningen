// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallButton, NotificationControl } from './PwaControls'
import { PwaProvider, usePwa } from './PwaProvider'
import { disposeInvoiceDraftPersistence } from '@/features/invoicing/invoice-draft-store'
import {
  getPwaRegistration,
  getPwaUpdateServiceWorkerCalls,
  resetPwaRegisterMock,
  setPwaUpdateServiceWorkerError,
  triggerPwaOfflineReady,
  triggerPwaRegisterError,
  triggerPwaUpdateAvailable,
} from '../../../tests/support/vitest/pwa-register'

function PwaStatus() {
  const pwa = usePwa()
  return (
    <>
      <p>offline:{String(pwa.offlineReady)}</p>
      <p>update:{String(pwa.updateAvailable)}</p>
      <p>update-error:{pwa.updateError ?? ''}</p>
      <button onClick={pwa.openUpdatePrompt}>Update verfügbar</button>
      <button onClick={() => void pwa.reportPdfExport('Rechnung_test.pdf')}>
        PDF export
      </button>
    </>
  )
}

function stubMatchMedia(standalone = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        query === '(display-mode: standalone)'
          ? standalone
          : query.includes('min-width: 768px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  )
}

function stubNotificationSupport({
  permission = 'default',
  requestPermission,
  userAgent = 'Vitest desktop browser',
}: {
  permission?: NotificationPermission
  requestPermission?: () => Promise<NotificationPermission>
  userAgent?: string
} = {}) {
  let currentPermission = permission
  const request = requestPermission ?? vi.fn(async () => 'granted' as const)
  vi.stubGlobal('Notification', {
    get permission() {
      return currentPermission
    },
    requestPermission: async () => {
      currentPermission = await request()
      return currentPermission
    },
  })
  vi.stubGlobal('navigator', {
    userAgent,
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
    serviceWorker: {},
  })
  return request
}

function renderPwa() {
  return render(
    <PwaProvider>
      <InstallButton />
      <NotificationControl />
      <PwaStatus />
    </PwaProvider>,
  )
}

beforeEach(() => stubMatchMedia())

afterEach(async () => {
  cleanup()
  await disposeInvoiceDraftPersistence()
  resetPwaRegisterMock()
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('application PWA controls', () => {
  it('keeps installation explicit and offers manual browser guidance when no native event is available', async () => {
    const user = userEvent.setup()
    renderPwa()

    await user.click(
      await screen.findByRole('button', { name: 'Installieren' }),
    )

    expect(
      await screen.findByRole('dialog', { name: 'regningen installieren' }),
    ).toBeVisible()
    expect(screen.getByText(/keine native Installation bereit/)).toBeVisible()
  })

  it('uses a single native installation prompt and does not prompt again after dismissal', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn(async () => {})
    const installEvent = Object.assign(
      new Event('beforeinstallprompt', { cancelable: true }),
      {
        prompt,
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: '' }),
      },
    )
    renderPwa()

    const install = await screen.findByRole('button', { name: 'Installieren' })
    window.dispatchEvent(installEvent)
    await user.click(install)
    expect(prompt).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('dialog', { name: 'regningen installieren' }),
    ).not.toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)

    await user.click(install)
    expect(prompt).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('dialog', { name: 'regningen installieren' }),
    ).toBeVisible()
  })

  it('shows platform guidance and hides installation after the appinstalled event', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      platform: 'Linux armv8l',
      maxTouchPoints: 0,
    })
    renderPwa()
    const install = await screen.findByRole('button', { name: 'Installieren' })
    await user.click(install)
    expect(
      await screen.findByText(/Browsermenü.*App installieren/),
    ).toBeVisible()

    window.dispatchEvent(new Event('appinstalled'))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Installieren' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('shows generic update availability, allows later, keeps it discoverable, and applies only on explicit intent', async () => {
    const user = userEvent.setup()
    renderPwa()
    await screen.findByRole('button', { name: 'Installieren' })

    triggerPwaOfflineReady()
    triggerPwaUpdateAvailable()

    expect(await screen.findByText('offline:true')).toBeVisible()
    expect(
      await screen.findByRole('dialog', { name: 'Aktualisierung verfügbar' }),
    ).toBeVisible()
    expect(screen.getByText('update:true')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Später' }))
    expect(
      screen.queryByRole('dialog', { name: 'Aktualisierung verfügbar' }),
    ).not.toBeInTheDocument()
    expect(getPwaUpdateServiceWorkerCalls()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Update verfügbar' }))
    expect(
      await screen.findByRole('dialog', { name: 'Aktualisierung verfügbar' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Update jetzt' }))
    expect(getPwaUpdateServiceWorkerCalls()).toBe(1)
  })

  it('surfaces registration and update errors without losing the explicit retry path', async () => {
    const user = userEvent.setup()
    renderPwa()
    await screen.findByRole('button', { name: 'Installieren' })
    triggerPwaRegisterError(new Error('registration unavailable'))
    expect(
      await screen.findByText(/Offline-Funktionen konnten nicht eingerichtet/),
    ).toBeVisible()

    setPwaUpdateServiceWorkerError(new Error('activation failed'))
    triggerPwaUpdateAvailable()
    await user.click(
      await screen.findByRole('button', { name: 'Update jetzt' }),
    )
    expect(
      await screen.findByText('update-error:activation failed'),
    ).toBeVisible()
    expect(getPwaUpdateServiceWorkerCalls()).toBe(1)
  })

  it('requests optional notification permission only after explicit intent and keeps PDF reporting best effort', async () => {
    const user = userEvent.setup()
    const requestPermission = stubNotificationSupport()
    renderPwa()

    await user.click(
      await screen.findByRole('button', {
        name: 'Benachrichtigungen aktivieren',
      }),
    )
    await screen.findByRole('button', {
      name: 'Benachrichtigungen deaktivieren',
    })
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem('regningen.pwa.pdf-notifications')).toBe(
      'enabled',
    )

    vi.mocked(getPwaRegistration().showNotification).mockRejectedValueOnce(
      new Error('notification unavailable'),
    )
    await user.click(screen.getByRole('button', { name: 'PDF export' }))
    await waitFor(() =>
      expect(getPwaRegistration().showNotification).toHaveBeenCalledWith(
        'PDF wurde erstellt',
        expect.objectContaining({
          body: 'Rechnung_test.pdf wurde heruntergeladen. Du findest es in den Downloads.',
        }),
      ),
    )
    expect(
      screen.queryByText(/notification unavailable/),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Benachrichtigungen deaktivieren' }),
    )
    expect(window.localStorage.getItem('regningen.pwa.pdf-notifications')).toBe(
      'disabled',
    )
  })

  it('does not ask for notifications when unsupported, blocked, or installation is required', async () => {
    renderPwa()
    expect(
      await screen.findByRole('button', {
        name: 'Benachrichtigungen nicht verfügbar',
      }),
    ).toBeDisabled()

    cleanup()
    stubNotificationSupport({ permission: 'denied' })
    renderPwa()
    expect(
      await screen.findByRole('button', {
        name: 'Benachrichtigungen blockiert',
      }),
    ).toBeDisabled()

    cleanup()
    stubNotificationSupport({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    })
    renderPwa()
    const installRequired = await screen.findByRole('button', {
      name: 'Installation für Benachrichtigungen erforderlich',
    })
    expect(installRequired).toBeDisabled()
    expect(
      screen.getByText(/Installiere regningen zum Home-Bildschirm/),
    ).toBeVisible()
  })
})
