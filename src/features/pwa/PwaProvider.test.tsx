// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallButton, NotificationControl } from './PwaControls'
import { PwaProvider, usePwa } from './PwaProvider'
import { beginPwaCriticalOperation } from './update-participants'

function renderInstallControl() {
  return render(
    <PwaProvider>
      <InstallButton />
    </PwaProvider>,
  )
}

function renderNotificationControl() {
  return render(
    <PwaProvider>
      <NotificationControl />
    </PwaProvider>,
  )
}

function stubNotificationPermission(permission: NotificationPermission) {
  class FakeNotification {
    static permission = permission
    static requestPermission = vi.fn(async () => permission)
  }
  vi.stubGlobal('Notification', FakeNotification)
  const serviceWorker = {
    ready: Promise.resolve({ showNotification: vi.fn(async () => {}) }),
  }
  vi.stubGlobal(
    'navigator',
    new Proxy(window.navigator, {
      has: (target, key) => key === 'serviceWorker' || Reflect.has(target, key),
      get: (target, key) =>
        key === 'serviceWorker'
          ? serviceWorker
          : Reflect.get(target, key, target),
    }),
  )
  return FakeNotification
}

function installPromptEvent(prompt: () => Promise<void>) {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    preventDefault: vi.fn(),
    prompt,
    userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
  })
  return event
}

function PwaStateHarness() {
  const pwa = usePwa()
  return (
    <div>
      <span data-testid="offline-ready">{String(pwa.offlineReady)}</span>
      <span data-testid="staged-release">
        {pwa.stagedRelease?.version ?? 'none'}
      </span>
      <span data-testid="update-state">{pwa.updateState}</span>
      {pwa.updateError ? <p role="alert">{pwa.updateError}</p> : null}
      <button onClick={pwa.applyUpdate}>Request update</button>
      <button onClick={() => void pwa.reportPdfExport('invoice.pdf')}>
        Report PDF
      </button>
      <button onClick={pwa.disableNotifications}>Disable notifications</button>
    </div>
  )
}

interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null
  close: () => void
  postMessage: (data: unknown) => void
}

class FakeMessageChannel {
  readonly port1: FakePort
  readonly port2: FakePort

  constructor() {
    this.port1 = {
      onmessage: null,
      close: vi.fn(),
      postMessage: vi.fn(),
    }
    this.port2 = {
      onmessage: null,
      close: vi.fn(),
      postMessage: (data) => this.port1.onmessage?.({ data }),
    }
  }
}

class FakeServiceWorker {
  messages: Array<Record<string, unknown>> = []

  constructor(
    private readonly version: string,
    private readonly release: unknown,
  ) {}

  postMessage(message: Record<string, unknown>, transfer?: unknown[]) {
    this.messages.push(message)
    const port = transfer?.[0] as FakePort | undefined
    if (message.type === 'GET_STATUS') {
      port?.postMessage({ version: this.version, offlineReady: true })
    } else if (message.type === 'GET_RELEASE_INFO') {
      port?.postMessage({ release: this.release })
    }
  }
}

function installProductionWorker(
  release: unknown = {
    version: '1.1.0',
    markdown: 'Release B notes.',
  },
  showNotification = vi.fn(async () => {}),
) {
  vi.stubEnv('PROD', true)
  vi.stubGlobal('MessageChannel', FakeMessageChannel)
  const worker = new FakeServiceWorker('1.0.0', null)
  const waitingWorker = new FakeServiceWorker('1.1.0', release)
  const registration = Object.assign(new EventTarget(), {
    active: worker,
    waiting: waitingWorker,
    installing: null,
    update: vi.fn(async () => {}),
  })
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: worker,
    ready: Promise.resolve({ showNotification }),
    register: vi.fn(async () => registration),
  })
  vi.stubGlobal(
    'navigator',
    new Proxy(window.navigator, {
      has: (target, key) => key === 'serviceWorker' || Reflect.has(target, key),
      get: (target, key) =>
        key === 'serviceWorker'
          ? serviceWorker
          : Reflect.get(target, key, target),
    }),
  )
  return { worker, waitingWorker, registration, serviceWorker }
}

function renderPwaState() {
  return render(
    <PwaProvider>
      <PwaStateHarness />
    </PwaProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  )
})

afterEach(() => {
  cleanup()
  document.body.inert = false
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('application installation controls', () => {
  it('invokes the browser install flow only after the user selects Installieren', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn(async () => {})
    const event = installPromptEvent(prompt)
    renderInstallControl()
    window.dispatchEvent(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(prompt).not.toHaveBeenCalled()
    await user.click(
      await screen.findByRole('button', { name: 'Installieren' }),
    )
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('does not reuse a cancelled native prompt and then gives manual guidance', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn(async () => {})
    renderInstallControl()
    window.dispatchEvent(installPromptEvent(prompt))

    await user.click(
      await screen.findByRole('button', { name: 'Installieren' }),
    )
    await user.click(screen.getByRole('button', { name: 'Installieren' }))

    expect(prompt).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('dialog', { name: 'regningen installieren' }),
    ).toBeVisible()
    expect(
      screen.getByText(
        /Dieser Browser stellt keine native Installation bereit/,
      ),
    ).toBeVisible()
  })

  it('shows iOS installation guidance when native prompting is unavailable', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'navigator',
      new Proxy(window.navigator, {
        get: (target, key) =>
          key === 'userAgent'
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
            : Reflect.get(target, key, target),
      }),
    )
    renderInstallControl()

    await user.click(
      await screen.findByRole('button', { name: 'Installieren' }),
    )

    expect(screen.getByText(/Öffne das Teilen-Menü in Safari/)).toBeVisible()
  })

  it('recognizes an iPad using desktop-mode Safari for installation guidance', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'navigator',
      new Proxy(window.navigator, {
        get: (target, key) => {
          if (key === 'platform') return 'MacIntel'
          if (key === 'maxTouchPoints') return 5
          if (key === 'userAgent')
            return 'Mozilla/5.0 (Macintosh; Intel Mac OS X)'
          return Reflect.get(target, key, target)
        },
      }),
    )
    renderInstallControl()

    await user.click(
      await screen.findByRole('button', { name: 'Installieren' }),
    )

    expect(screen.getByText(/Öffne das Teilen-Menü in Safari/)).toBeVisible()
  })

  it('shows manual installation guidance if the native prompt rejects', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn(async () => {
      throw new Error('native prompt failed')
    })
    renderInstallControl()
    window.dispatchEvent(installPromptEvent(prompt))

    await user.click(
      await screen.findByRole('button', { name: 'Installieren' }),
    )

    expect(prompt).toHaveBeenCalledOnce()
    expect(
      screen.getByText(
        /Dieser Browser stellt keine native Installation bereit/,
      ),
    ).toBeVisible()
  })

  it('hides Installieren after the browser reports installation', async () => {
    renderInstallControl()
    expect(
      await screen.findByRole('button', { name: 'Installieren' }),
    ).toBeVisible()

    window.dispatchEvent(new Event('appinstalled'))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Installieren' })).toBeNull(),
    )
  })

  it('explains that iOS notifications require an installed app without requesting permission', async () => {
    const permission = stubNotificationPermission('default')
    const serviceWorker = {
      ready: Promise.resolve({ showNotification: vi.fn(async () => {}) }),
    }
    vi.stubGlobal(
      'navigator',
      new Proxy(window.navigator, {
        has: (target, key) =>
          key === 'serviceWorker' || Reflect.has(target, key),
        get: (target, key) =>
          key === 'serviceWorker'
            ? serviceWorker
            : key === 'userAgent'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
              : Reflect.get(target, key, target),
      }),
    )
    renderNotificationControl()

    expect(
      await screen.findByRole('button', {
        name: 'Installation für Benachrichtigungen erforderlich',
      }),
    ).toBeDisabled()
    expect(
      screen.getByText(/Installiere regningen zum Home-Bildschirm/),
    ).toBeVisible()
    expect(permission.requestPermission).not.toHaveBeenCalled()
  })

  it('requests notification permission only on explicit enable and keeps opt-out separate', async () => {
    const user = userEvent.setup()
    const permission = stubNotificationPermission('default')
    permission.requestPermission.mockImplementation(async () => {
      permission.permission = 'granted'
      return 'granted'
    })
    window.localStorage.clear()
    renderNotificationControl()

    const enable = await screen.findByRole('button', {
      name: 'Benachrichtigungen aktivieren',
    })
    expect(permission.requestPermission).not.toHaveBeenCalled()
    await user.click(enable)

    expect(permission.requestPermission).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('button', {
        name: 'Benachrichtigungen deaktivieren',
      }),
    ).toBeVisible()
    expect(window.localStorage.getItem('regningen.pwa.pdf-notifications')).toBe(
      'enabled',
    )

    await user.click(
      screen.getByRole('button', { name: 'Benachrichtigungen deaktivieren' }),
    )
    expect(window.localStorage.getItem('regningen.pwa.pdf-notifications')).toBe(
      'disabled',
    )
    expect(permission.permission).toBe('granted')
    expect(permission.requestPermission).toHaveBeenCalledOnce()
  })

  it('explains when local notifications are unavailable without blocking other controls', async () => {
    vi.stubGlobal('Notification', undefined)
    renderNotificationControl()

    expect(
      await screen.findByRole('button', {
        name: 'Benachrichtigungen nicht verfügbar',
      }),
    ).toBeDisabled()
    expect(
      screen.getByText(
        'Dieser Browser unterstützt keine lokalen Benachrichtigungen.',
      ),
    ).toBeVisible()
  })

  it('offers platform-specific Android installation instructions', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'navigator',
      new Proxy(window.navigator, {
        get: (target, key) =>
          key === 'userAgent'
            ? 'Mozilla/5.0 (Linux; Android 14)'
            : Reflect.get(target, key, target),
      }),
    )
    renderInstallControl()

    await user.click(
      await screen.findByRole('button', { name: 'Installieren' }),
    )

    expect(screen.getByText(/Öffne das Browsermenü/)).toBeVisible()
  })

  it('keeps offline readiness but rejects release metadata for the running version', async () => {
    installProductionWorker({ version: '1.0.0', markdown: 'Running notes.' })
    renderPwaState()

    await waitFor(() =>
      expect(screen.getByTestId('offline-ready')).toHaveTextContent('true'),
    )
    expect(screen.getByTestId('staged-release')).toHaveTextContent('none')
  })

  it('stages release metadata from the production worker after required assets are ready', async () => {
    const { registration } = installProductionWorker()
    renderPwaState()

    await waitFor(() =>
      expect(screen.getByTestId('offline-ready')).toHaveTextContent('true'),
    )
    expect(await screen.findByTestId('staged-release')).toHaveTextContent(
      '1.1.0',
    )
    expect(registration.update).toHaveBeenCalled()
  })

  it('locks the tab during preparation and unlocks it when the worker defers activation', async () => {
    const user = userEvent.setup()
    const { worker, serviceWorker } = installProductionWorker()
    renderPwaState()
    await screen.findByText('1.1.0')

    await user.click(screen.getByRole('button', { name: 'Request update' }))
    const request = worker.messages.find(
      (message) => message.type === 'PREPARE_UPDATE',
    )
    expect(request).toBeDefined()
    serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PREPARE_UPDATE',
          requestId: request?.requestId,
          targetVersion: '1.1.0',
        },
      }),
    )

    await waitFor(() =>
      expect(worker.messages).toContainEqual(
        expect.objectContaining({ type: 'PREPARE_RESULT', prepared: true }),
      ),
    )
    expect(document.body.inert).toBe(true)
    serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ABORT_UPDATE', requestId: request?.requestId },
      }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('update-state')).toHaveTextContent('idle'),
    )
    expect(document.body.inert).toBe(false)
    expect(
      window.sessionStorage.getItem('regningen.pwa.update-acknowledgment'),
    ).toBeNull()
  })

  it('retains the protected update bridge when accepted activation takes longer than expected', async () => {
    const { serviceWorker } = installProductionWorker()
    renderPwaState()
    await screen.findByText('1.1.0')
    const schedule = window.setTimeout.bind(window)
    let activationTimeout: (() => void) | undefined
    vi.spyOn(window, 'setTimeout').mockImplementation(
      (handler, delay, ...args) => {
        if (delay === 15000 && typeof handler === 'function') {
          activationTimeout = handler
        }
        return schedule(handler, delay, ...args) as unknown as ReturnType<
          typeof setTimeout
        >
      },
    )
    serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PREPARE_UPDATE',
          requestId: 'slow-activation',
          targetVersion: '1.1.0',
        },
      }),
    )
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem('regningen.pwa.update-acknowledgment'),
      ).toBe('1.1.0'),
    )
    serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'UPDATE_ACCEPTED',
          requestId: 'slow-activation',
          targetVersion: '1.1.0',
        },
      }),
    )
    expect(activationTimeout).toBeDefined()
    await act(async () => activationTimeout?.())

    expect(
      window.sessionStorage.getItem('regningen.pwa.update-acknowledgment'),
    ).toBe('1.1.0')
    expect(document.body.inert).toBe(true)
    expect(screen.getByTestId('update-state')).toHaveTextContent('accepted')
  })

  it('does not resume an aborted preparation when pending work finishes later', async () => {
    const { worker, serviceWorker } = installProductionWorker()
    renderPwaState()
    await screen.findByText('1.1.0')
    const finish = beginPwaCriticalOperation()

    try {
      serviceWorker.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'PREPARE_UPDATE',
            requestId: 'cancelled-request',
            targetVersion: '1.1.0',
          },
        }),
      )
      expect(document.body.inert).toBe(true)
      serviceWorker.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'ABORT_UPDATE', requestId: 'cancelled-request' },
        }),
      )
      await waitFor(() => expect(document.body.inert).toBe(false))
      finish()
      await waitFor(() =>
        expect(screen.getByTestId('update-state')).toHaveTextContent('idle'),
      )
      expect(worker.messages).not.toContainEqual(
        expect.objectContaining({ type: 'PREPARE_RESULT', prepared: true }),
      )
      expect(
        window.sessionStorage.getItem('regningen.pwa.update-acknowledgment'),
      ).toBeNull()
    } finally {
      finish()
    }
  })

  it('explains deferral after the current tab cannot store its preparation marker', async () => {
    const { worker, serviceWorker } = installProductionWorker()
    renderPwaState()
    await screen.findByText('1.1.0')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('session storage unavailable')
    })
    serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PREPARE_UPDATE',
          requestId: 'failed-request',
          targetVersion: '1.1.0',
        },
      }),
    )
    await waitFor(() =>
      expect(worker.messages).toContainEqual(
        expect.objectContaining({ type: 'PREPARE_RESULT', prepared: false }),
      ),
    )
    serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'UPDATE_DEFERRED',
          requestId: 'failed-request',
          reason: 'Eingaben konnten nicht gesichert werden.',
        },
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Eingaben konnten nicht gesichert werden.',
    )
    expect(document.body.inert).toBe(false)
  })

  it('shows a worker deferral reason without locking the tab', async () => {
    const user = userEvent.setup()
    const { worker, serviceWorker } = installProductionWorker()
    renderPwaState()
    await screen.findByText('1.1.0')
    await user.click(screen.getByRole('button', { name: 'Request update' }))

    const request = worker.messages.find(
      (message) => message.type === 'PREPARE_UPDATE',
    )
    serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'UPDATE_DEFERRED',
          requestId: request?.requestId,
          reason: 'Ein Tab konnte nicht vorbereitet werden.',
        },
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ein Tab konnte nicht vorbereitet werden.',
    )
    expect(document.body.inert).toBe(false)
  })

  it('reports the downloaded filename once and honors the local notification opt-out', async () => {
    const user = userEvent.setup()
    class GrantedNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = vi.fn(async () => 'granted' as const)
    }
    vi.stubGlobal('Notification', GrantedNotification)
    window.localStorage.setItem('regningen.pwa.pdf-notifications', 'enabled')
    const { serviceWorker } = installProductionWorker()
    const showNotification = serviceWorker.ready.then(
      (registration) => registration.showNotification,
    )
    renderPwaState()
    const display = await showNotification

    await user.click(screen.getByRole('button', { name: 'Report PDF' }))
    await waitFor(() =>
      expect(display).toHaveBeenCalledWith(
        'PDF wurde erstellt',
        expect.objectContaining({
          body: 'invoice.pdf wurde heruntergeladen. Du findest es in den Downloads.',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        }),
      ),
    )
    await user.click(
      screen.getByRole('button', { name: 'Disable notifications' }),
    )
    await user.click(screen.getByRole('button', { name: 'Report PDF' }))
    expect(display).toHaveBeenCalledOnce()
  })

  it('keeps notification delivery failure separate from PDF export feedback', async () => {
    const user = userEvent.setup()
    class GrantedNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = vi.fn(async () => 'granted' as const)
    }
    vi.stubGlobal('Notification', GrantedNotification)
    window.localStorage.setItem('regningen.pwa.pdf-notifications', 'enabled')
    const showNotification = vi.fn(async () => {
      throw new Error('notification delivery failed')
    })
    installProductionWorker(undefined, showNotification)
    renderPwaState()

    await user.click(screen.getByRole('button', { name: 'Report PDF' }))

    await waitFor(() => expect(showNotification).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('hides Installieren when the app is already running in standalone mode', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      })),
    )
    renderInstallControl()

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Installieren' })).toBeNull(),
    )
  })
})
