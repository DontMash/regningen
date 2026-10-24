// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/toast'
import { useReleaseNotes } from './ReleaseNotesProvider'
import { ReleaseNotesComposition as ReleaseNotesProvider } from './ReleaseNotesComposition'
import { setLocale } from '@/paraglide/runtime'

vi.mock('@/lib/application-release', () => ({
  applicationVersion: '2.0.0',
  applicationReleases: [
    { version: '2.0.0', markdown: '### Enhancements\n\n- Current release.' },
    { version: '1.0.0', markdown: '### Fixes\n\n- Historical release.' },
  ],
}))

const storageKey = 'regningen.release-notes.acknowledged-versions'

function ReleaseNotesTrigger() {
  const { applicationVersion, openReleaseNotes } = useReleaseNotes()
  return (
    <button onClick={openReleaseNotes}>
      Open release notes v{applicationVersion}
    </button>
  )
}

function renderProvider() {
  return render(
    <StrictMode>
      <ReleaseNotesProvider>
        <ReleaseNotesTrigger />
        <Toaster />
      </ReleaseNotesProvider>
    </StrictMode>,
  )
}

function acknowledgeInAnotherTab(versions: string[]) {
  const value = JSON.stringify(versions)
  window.localStorage.setItem(storageKey, value)
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: storageKey,
      newValue: value,
      storageArea: window.localStorage,
    }),
  )
}

beforeEach(() => {
  setLocale('de', { reload: false })
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 768px'),
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('release-notes application state', () => {
  it('explains failed acknowledgment persistence in English without keeping the notes open', async () => {
    setLocale('en', { reload: false })
    const user = userEvent.setup()
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === storageKey) throw new Error('storage unavailable')
      return originalSetItem.call(this, key, value)
    })
    renderProvider()

    expect(
      await screen.findByRole('dialog', { name: 'Release notes' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Understood' }))

    expect(
      await screen.findByText('Read release notes could not be saved.'),
    ).toBeVisible()
    expect(
      screen.getByText(
        'The release notes may appear again the next time you open the application.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('dialog', { name: 'Release notes' }),
    ).not.toBeInTheDocument()
  })

  it('opens unacknowledged notes, saves acknowledgment, and resets history on reopening', async () => {
    const user = userEvent.setup()
    renderProvider()

    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Verstanden' }))
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()
    await waitFor(() =>
      expect(window.localStorage.getItem(storageKey)).toBe('["2.0.0"]'),
    )

    await user.click(
      screen.getByRole('button', { name: 'Open release notes v2.0.0' }),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('combobox', { name: 'Version auswählen' }),
    )
    await user.click(await screen.findByRole('option', { name: 'v1.0.0' }))
    expect(screen.getByText('Historical release.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(
      screen.getByRole('button', { name: 'Open release notes v2.0.0' }),
    ).toHaveTextContent('v2.0.0')
    await user.click(
      screen.getByRole('button', { name: 'Open release notes v2.0.0' }),
    )
    expect(await screen.findByText('Current release.')).toBeVisible()
    expect(
      screen.getByRole('combobox', { name: 'Version auswählen' }),
    ).toHaveTextContent('v2.0.0')
  })

  it('closes an automatic notice when another tab acknowledges the running version', async () => {
    renderProvider()
    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()

    acknowledgeInAnotherTab(['2.0.0'])

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Versionshinweise' }),
      ).toBeNull(),
    )
  })

  it('leaves manually reopened notes available when another tab acknowledges them', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(await screen.findByRole('button', { name: 'Schließen' }))
    await user.click(
      screen.getByRole('button', { name: 'Open release notes v2.0.0' }),
    )

    await act(async () => {
      acknowledgeInAnotherTab(['2.0.0'])
    })

    expect(
      screen.getByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
  })

  it('opens a new running version and acknowledges it even while historical notes are selected', async () => {
    window.localStorage.setItem(storageKey, '["1.0.0"]')
    const user = userEvent.setup()
    renderProvider()
    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('combobox', { name: 'Version auswählen' }),
    )
    await user.click(await screen.findByRole('option', { name: 'v1.0.0' }))
    expect(screen.getByText('Historical release.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Verstanden' }))

    await waitFor(() =>
      expect(window.localStorage.getItem(storageKey)).toBe('["1.0.0","2.0.0"]'),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()
    cleanup()
    await act(async () => {
      renderProvider()
    })
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()
  })

  it('closes for this launch and explains when acknowledgment cannot be saved', async () => {
    const user = userEvent.setup()
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === storageKey) throw new Error('storage unavailable')
      return originalSetItem.call(this, key, value)
    })
    renderProvider()

    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Verstanden' }))

    expect(
      await screen.findByText(
        'Die Versionshinweise können beim nächsten Start erneut erscheinen.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()
  })

  it('remains dismissible when the browser storage driver cannot be constructed', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('storage access denied')
    })
    const user = userEvent.setup()
    renderProvider()

    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Verstanden' }))

    expect(
      await screen.findByText(
        'Die Versionshinweise können beim nächsten Start erneut erscheinen.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()
  })

  it('merges another release acknowledgment inside the browser lock without losing either version', async () => {
    const request = vi.fn(async (_name: string, save: () => Promise<void>) => {
      window.localStorage.setItem(storageKey, '["1.0.0"]')
      await save()
    })
    vi.stubGlobal(
      'navigator',
      new Proxy(window.navigator, {
        has: (target, key) => key === 'locks' || Reflect.has(target, key),
        get: (target, key) =>
          key === 'locks' ? { request } : Reflect.get(target, key, target),
      }),
    )
    const user = userEvent.setup()
    renderProvider()
    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Verstanden' }))

    await waitFor(() =>
      expect(window.localStorage.getItem(storageKey)).toBe('["1.0.0","2.0.0"]'),
    )
    expect(request).toHaveBeenCalledWith(storageKey, expect.any(Function))
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()
  })

  it('treats unreadable acknowledgment data as a first visit', async () => {
    window.localStorage.setItem(storageKey, 'not valid JSON')
    renderProvider()

    expect(
      await screen.findByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
  })

  it('does not access browser storage or open a notice during server rendering', () => {
    const getStorage = vi.spyOn(window, 'localStorage', 'get')
    const html = renderToString(
      <ReleaseNotesProvider>
        <ReleaseNotesTrigger />
      </ReleaseNotesProvider>,
    )
    expect(getStorage).not.toHaveBeenCalled()
    expect(html).not.toContain('role="dialog"')
  })
})
