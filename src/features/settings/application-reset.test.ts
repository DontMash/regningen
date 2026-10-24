// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginPwaCriticalOperation,
  waitForPwaCriticalOperations,
} from '../pwa/pwa-critical-operations'
import {
  clearStoredInvoiceDraft,
  disposeInvoiceDraftPersistence,
  invoiceDraftStore,
  invoicePositionDraftStore,
  resetInvoiceDraft,
  waitForInvoiceDraftPersistence,
  initializeInvoiceDraftPersistence as initializeWithPersistence,
} from '../invoicing/invoice-draft-store'
import { createInvoiceDraftPersistence } from '../invoicing/invoice-draft-storage'
import type { InvoiceDraftStorage } from '../invoicing/invoice-draft-storage'
import { initializeInvoiceDraftPersistence as initializeBrowserPersistence } from '../invoicing/invoice-draft'
import {
  getApplicationResetGeneration,
  resetApplication,
  subscribeToApplicationReset,
} from './application-reset'

function initializeInvoiceDraftPersistence(storage?: InvoiceDraftStorage) {
  return storage
    ? initializeWithPersistence(() => createInvoiceDraftPersistence(storage))
    : initializeBrowserPersistence()
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetInvoiceDraft()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await disposeInvoiceDraftPersistence()
  resetInvoiceDraft()
  localStorage.clear()
  sessionStorage.clear()
})

describe('browser-local application reset', () => {
  it('keeps a local page-reload safeguard waiting until application-reset deletion finishes', async () => {
    let releaseDeletion = () => {}
    let signalDeletion = () => {}
    const deletionStarted = new Promise<void>((resolve) => {
      signalDeletion = resolve
    })
    const deletion = new Promise<void>((resolve) => {
      releaseDeletion = resolve
    })
    await initializeInvoiceDraftPersistence({
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {
        signalDeletion()
        await deletion
      },
    })
    const resetting = resetApplication()
    await deletionStarted
    let reloadAllowed = false
    const readyToReload = waitForPwaCriticalOperations().then(() => {
      reloadAllowed = true
    })
    try {
      await Promise.resolve()
      expect(reloadAllowed).toBe(false)
    } finally {
      releaseDeletion()
      await resetting
      await readyToReload
    }
    expect(reloadAllowed).toBe(true)
  })

  it('does not let an obsolete New Invoice discard save anything or revive a warning after application reset', async () => {
    const values = new Map<string, unknown>()
    let finishRemoval = () => {}
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const blockedRemoval = new Promise<void>((resolve) => {
      finishRemoval = resolve
    })
    let blockFirstRemoval = true
    await initializeInvoiceDraftPersistence({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value)
      },
      removeItem: async (key) => {
        if (blockFirstRemoval) {
          blockFirstRemoval = false
          markStarted()
          await blockedRemoval
        }
        values.delete(key)
      },
    })
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'old work' }))
    await waitForInvoiceDraftPersistence()
    const discarding = clearStoredInvoiceDraft()
    await started

    await resetApplication()
    finishRemoval()
    await expect(discarding).rejects.toThrow()
    expect(await waitForInvoiceDraftPersistence()).toBe(true)
    expect(values.has('regningen.invoice-draft')).toBe(false)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    ['local', 'removeItem', 'regningen.business-profile'],
    ['local', 'removeItem', 'theme'],
    ['local', 'removeItem', 'regningen.pwa.pdf-notifications'],
    ['local', 'removeItem', 'regningen.release-notes.acknowledged-versions'],
    ['session', 'removeItem', 'regningen.invoice-draft'],
    ['session', 'setItem', 'regningen.invoice-draft.reset-generation'],
    ['local', 'setItem', 'regningen.application-reset.generation'],
    ['local', 'setItem', 'regningen.application-reset.completed'],
  ] as const)(
    'reports %s %s failure for %s without success, and retries',
    async (area, method, key) => {
      await initializeInvoiceDraftPersistence()
      invoiceDraftStore.setState((draft) => ({ ...draft, number: 'old work' }))
      await waitForInvoiceDraftPersistence()
      localStorage.setItem('regningen.business-profile', 'saved profile')
      const success = vi.fn()
      const unsubscribe = subscribeToApplicationReset(success)
      const affectedStorage = area === 'local' ? localStorage : sessionStorage
      const original = Storage.prototype[method]
      const fault = vi
        .spyOn(Storage.prototype, method)
        .mockImplementation(function (
          this: Storage,
          affectedKey: string,
          value?: string,
        ) {
          if (this === affectedStorage && affectedKey === key)
            throw new Error('reset storage blocked')
          original.call(this, affectedKey, value!)
        })

      await expect(resetApplication()).rejects.toThrow('reset storage blocked')
      window.dispatchEvent(new Event('focus'))
      expect(success).not.toHaveBeenCalled()

      fault.mockRestore()
      await resetApplication()
      expect(success).toHaveBeenCalledOnce()
      expect(localStorage.getItem('regningen.business-profile')).toBeNull()
      expect(sessionStorage.getItem('regningen.invoice-draft')).toBeNull()
      unsubscribe()
    },
  )

  it('uses a stable generation without accessible browser storage but refuses to claim a reset', async () => {
    const defaultGeneration = getApplicationResetGeneration()
    expect(getApplicationResetGeneration()).toBe(defaultGeneration)
    const success = vi.fn()
    const unsubscribe = subscribeToApplicationReset(success)
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('browser storage inaccessible')
    })

    expect(getApplicationResetGeneration()).toBe(defaultGeneration)
    await expect(resetApplication()).rejects.toThrow(
      'browser storage inaccessible',
    )
    expect(success).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('rejects a failed session removal before persistence starts and retries after storage recovers', async () => {
    sessionStorage.setItem('regningen.invoice-draft', 'old incompatible draft')
    const success = vi.fn()
    const unsubscribe = subscribeToApplicationReset(success)
    const remove = Storage.prototype.removeItem
    const fault = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key) {
        if (this === sessionStorage && key === 'regningen.invoice-draft') {
          throw new Error('session removal blocked')
        }
        return remove.call(this, key)
      })

    await expect(resetApplication()).rejects.toThrow()
    expect(success).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('regningen.invoice-draft')).not.toBeNull()

    fault.mockRestore()
    await resetApplication()
    expect(sessionStorage.getItem('regningen.invoice-draft')).toBeNull()
    expect(success).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('lets pending local operations finish before removing the saved profile or announcing success', async () => {
    await initializeInvoiceDraftPersistence()
    localStorage.setItem('regningen.business-profile', 'saved profile')
    const finishOperation = beginPwaCriticalOperation()
    const success = vi.fn()
    const unsubscribe = subscribeToApplicationReset(success)
    const resetting = resetApplication()

    try {
      await waitForInvoiceDraftPersistence()
      expect(localStorage.getItem('regningen.business-profile')).toBe(
        'saved profile',
      )
      expect(success).not.toHaveBeenCalled()
    } finally {
      finishOperation()
    }
    await resetting
    expect(localStorage.getItem('regningen.business-profile')).toBeNull()
    expect(success).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('fences pre-reset work even after an incomplete removal, emits no success, and permits retry', async () => {
    await initializeInvoiceDraftPersistence()
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'old work' }))
    await waitForInvoiceDraftPersistence()
    localStorage.setItem('regningen.business-profile', 'old profile')
    localStorage.setItem('theme', 'dark')
    const beforeReset = getApplicationResetGeneration()
    const success = vi.fn()
    const unsubscribe = subscribeToApplicationReset(success)
    const remove = Storage.prototype.removeItem
    const fault = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key) {
        if (this === localStorage && key === 'theme')
          throw new Error('theme removal blocked')
        return remove.call(this, key)
      })

    await expect(resetApplication()).rejects.toThrow('theme removal blocked')
    window.dispatchEvent(new Event('focus'))
    expect(success).not.toHaveBeenCalled()
    expect(getApplicationResetGeneration()).not.toBe(beforeReset)
    expect(localStorage.getItem('regningen.business-profile')).toBeNull()
    expect(localStorage.getItem('theme')).toBe('dark')

    fault.mockRestore()
    await resetApplication()
    expect(localStorage.getItem('theme')).toBeNull()
    expect(sessionStorage.getItem('regningen.invoice-draft')).toBeNull()
    expect(success).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('notifies subscribers when another tab resets, and detects a missed reset on resume', async () => {
    const observedGenerations: Array<string> = []
    const unsubscribe = subscribeToApplicationReset(() => {
      observedGenerations.push(getApplicationResetGeneration())
    })

    localStorage.setItem(
      'regningen.application-reset.generation',
      'remote-reset',
    )
    localStorage.setItem(
      'regningen.application-reset.completed',
      'remote-reset',
    )
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'regningen.application-reset.generation',
        newValue: 'remote-reset',
        storageArea: localStorage,
      }),
    )
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => {
      expect(observedGenerations).toEqual(['remote-reset'])
    })

    localStorage.setItem(
      'regningen.application-reset.generation',
      'missed-reset',
    )
    localStorage.setItem(
      'regningen.application-reset.completed',
      'missed-reset',
    )
    window.dispatchEvent(new Event('pageshow'))
    await vi.waitFor(() => {
      expect(observedGenerations).toEqual(['remote-reset', 'missed-reset'])
    })

    unsubscribe()
    localStorage.setItem(
      'regningen.application-reset.generation',
      'later-reset',
    )
    window.dispatchEvent(new Event('focus'))
    expect(observedGenerations).toEqual(['remote-reset', 'missed-reset'])
  })

  it('removes only app-owned user data, clears Invoice working inputs and announces the successful reset', async () => {
    for (const key of [
      'regningen.business-profile',
      'theme',
      'regningen.pwa.pdf-notifications',
      'regningen.release-notes.acknowledged-versions',
    ]) {
      localStorage.setItem(key, 'saved preference')
    }
    localStorage.setItem('other.application', 'keep local')
    sessionStorage.setItem('other.application', 'keep session')
    await initializeInvoiceDraftPersistence()
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'old work' }))
    invoicePositionDraftStore.setState(() => ({
      description: 'unfinished position',
      amount: '0,',
    }))
    await waitForInvoiceDraftPersistence()
    const previousGeneration = getApplicationResetGeneration()
    const observedGenerations: Array<string> = []
    const unsubscribe = subscribeToApplicationReset(() => {
      observedGenerations.push(getApplicationResetGeneration())
    })

    await resetApplication()
    unsubscribe()

    expect(localStorage.getItem('regningen.business-profile')).toBeNull()
    expect(localStorage.getItem('theme')).toBeNull()
    expect(localStorage.getItem('regningen.pwa.pdf-notifications')).toBeNull()
    expect(
      localStorage.getItem('regningen.release-notes.acknowledged-versions'),
    ).toBeNull()
    expect(sessionStorage.getItem('regningen.invoice-draft')).toBeNull()
    expect(invoiceDraftStore.state.number).toBe('')
    expect(invoicePositionDraftStore.state).toEqual({
      description: '',
      amount: '',
    })
    expect(localStorage.getItem('other.application')).toBe('keep local')
    expect(sessionStorage.getItem('other.application')).toBe('keep session')
    expect(getApplicationResetGeneration()).not.toBe(previousGeneration)
    expect(observedGenerations).toEqual([getApplicationResetGeneration()])
  })
})
