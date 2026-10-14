// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeToApplicationReset } from '../settings/application-reset'
import {
  createEmptyInvoiceDraft,
  disposeInvoiceDraftPersistence,
  initializeInvoiceDraftPersistence,
  invoiceDraftPersistenceStore,
  invoiceDraftStore,
  invoicePositionDraftStore,
  resetInvoiceDraft,
  clearStoredInvoiceDraft,
  waitForInvoiceDraftPersistence,
} from './invoice-draft-store'

const expectedEmptyDraft = {
  number: '',
  date: '',
  subject: '',
  company: '',
  name: '',
  street: '',
  postalCode: '',
  town: '',
  rate: 7,
  items: [],
}

function createSessionStorage(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial))
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: unknown) => {
      values.set(key, value)
    },
    removeItem: async (key: string) => {
      values.delete(key)
    },
    values,
  }
}

const storedDraft = {
  schemaVersion: 1,
  invoice: {
    ...expectedEmptyDraft,
    number: ' draft / 17 ',
    date: '',
    subject: ' Unfinished subject ',
    company: 'Recipient GmbH',
    street: 'Main St',
    rate: 19 as const,
    items: [{ description: 'Consulting ', amount: 'not a price' }],
  },
  newPosition: { description: ' Unsubmitted ', amount: '0,' },
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetInvoiceDraft()
})

afterEach(async () => {
  await disposeInvoiceDraftPersistence()
  resetInvoiceDraft()
  localStorage.clear()
  sessionStorage.clear()
})

describe('empty invoice drafts', () => {
  it('starts with empty fields, no positions, and 7% VAT', () => {
    expect(createEmptyInvoiceDraft()).toStrictEqual(expectedEmptyDraft)
  })

  it('keeps drafts and their positions independent', () => {
    const firstDraft = createEmptyInvoiceDraft()
    const secondDraft = createEmptyInvoiceDraft()

    firstDraft.number = '2026-001'
    firstDraft.items.push({ description: 'Catering', amount: '107,00' })

    expect(secondDraft).not.toBe(firstDraft)
    expect(secondDraft.items).not.toBe(firstDraft.items)
    expect(secondDraft).toStrictEqual(expectedEmptyDraft)
  })
})

describe('session-autosaved Invoice Drafts', () => {
  it('does not announce remote reset success when a missed reset is discovered by a write but local deletion fails', async () => {
    const storage = createSessionStorage({
      'regningen.invoice-draft': storedDraft,
    })
    await initializeInvoiceDraftPersistence(storage)
    storage.removeItem = async () => {
      throw new Error('session deletion blocked')
    }
    const success = vi.fn()
    const unsubscribe = subscribeToApplicationReset(success)
    localStorage.setItem(
      'regningen.application-reset.generation',
      'missed-reset',
    )
    localStorage.setItem(
      'regningen.application-reset.completed',
      'missed-reset',
    )

    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'stale edit' }))
    expect(await waitForInvoiceDraftPersistence()).toBe(false)
    window.dispatchEvent(new Event('focus'))
    // Let the browser resume event's promise callbacks complete.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))

    expect(success).not.toHaveBeenCalled()
    expect(invoiceDraftStore.state).toEqual(expectedEmptyDraft)
    unsubscribe()
  })

  it('fences a pending restoration and clears the unload warning before any reset success subscriber runs', async () => {
    const storage = createSessionStorage({
      'regningen.invoice-draft': storedDraft,
    })
    const get = storage.getItem
    let finishRead = () => {}
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const blockedRead = new Promise<void>((resolve) => {
      finishRead = resolve
    })
    storage.getItem = async (key) => {
      const value = await get(key)
      if (key === 'regningen.invoice-draft') {
        markStarted()
        await blockedRead
      }
      return value
    }
    const outcomes: Array<{
      warned: boolean
      number: string
      savedDraft: unknown
    }> = []
    // Deliberately subscribe before draft persistence: callback order must not
    // let the application's hard reload bypass cleanup.
    const unsubscribe = subscribeToApplicationReset(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      outcomes.push({
        warned: event.defaultPrevented,
        number: invoiceDraftStore.state.number,
        savedDraft: storage.values.get('regningen.invoice-draft'),
      })
    })
    const initializing = initializeInvoiceDraftPersistence(storage)
    await started
    localStorage.setItem(
      'regningen.application-reset.generation',
      'during-restore',
    )
    localStorage.setItem(
      'regningen.application-reset.completed',
      'during-restore',
    )
    window.dispatchEvent(new Event('focus'))
    expect(outcomes).toEqual([])
    finishRead()
    await initializing
    await waitForInvoiceDraftPersistence()
    await vi.waitFor(() => {
      expect(outcomes).toEqual([
        { warned: false, number: '', savedDraft: undefined },
      ])
    })
    unsubscribe()

    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'new work' }))
    await waitForInvoiceDraftPersistence()
    expect(storage.values.get('regningen.invoice-draft')).toMatchObject({
      invoice: { number: 'new work' },
    })
  })

  it('discards obsolete queued callbacks as well as saved inputs during reset', async () => {
    const storage = createSessionStorage()
    await initializeInvoiceDraftPersistence(storage)
    invoiceDraftStore.setState((draft) => ({
      ...draft,
      number: 'queued old work',
    }))
    localStorage.setItem(
      'regningen.application-reset.generation',
      'reset-fence',
    )
    window.dispatchEvent(new Event('focus'))
    invoicePositionDraftStore.setState(() => ({
      description: 'late obsolete callback',
      amount: '0,',
    }))

    await waitForInvoiceDraftPersistence()

    expect(storage.values.has('regningen.invoice-draft')).toBe(false)
    expect(invoiceDraftStore.state).toEqual(expectedEmptyDraft)
    expect(invoicePositionDraftStore.state).toEqual({
      description: '',
      amount: '',
    })
  })

  it('does not restore a stale session after a reset, but restores new work on later reloads', async () => {
    localStorage.setItem(
      'regningen.application-reset.generation',
      'new-generation',
    )
    const storage = createSessionStorage({
      'regningen.invoice-draft': storedDraft,
      'regningen.invoice-draft.reset-generation': 'old-generation',
    })

    await initializeInvoiceDraftPersistence(storage)

    expect(invoiceDraftStore.state).toEqual(expectedEmptyDraft)
    expect(invoicePositionDraftStore.state).toEqual({
      description: '',
      amount: '',
    })
    expect(storage.values.has('regningen.invoice-draft')).toBe(false)

    invoiceDraftStore.setState((draft) => ({
      ...draft,
      number: 'fresh after reset',
    }))
    await waitForInvoiceDraftPersistence()
    await disposeInvoiceDraftPersistence()
    resetInvoiceDraft()
    await initializeInvoiceDraftPersistence(storage)

    expect(invoiceDraftStore.state.number).toBe('fresh after reset')
    expect(invoiceDraftPersistenceStore.state.restored).toBe(true)
  })

  it('invalidates working inputs and fences pending old writes when another tab resets', async () => {
    const storage = createSessionStorage()
    let finishWrite = () => {}
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const blockedWrite = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    storage.setItem = async (key, value) => {
      if (key === 'regningen.invoice-draft') {
        markStarted()
        await blockedWrite
      }
      storage.values.set(key, value)
    }
    await initializeInvoiceDraftPersistence(storage)
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'obsolete' }))
    await started
    invoicePositionDraftStore.setState(() => ({
      description: 'also obsolete',
      amount: '0,',
    }))

    const warningsAtSuccess: Array<boolean> = []
    const unsubscribe = subscribeToApplicationReset(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      warningsAtSuccess.push(event.defaultPrevented)
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
        storageArea: localStorage,
      }),
    )
    invoiceDraftStore.setState((draft) => ({
      ...draft,
      number: 'late obsolete callback',
    }))
    finishWrite()
    await waitForInvoiceDraftPersistence()

    expect(storage.values.has('regningen.invoice-draft')).toBe(false)
    expect(invoiceDraftStore.state).toEqual(expectedEmptyDraft)
    expect(invoicePositionDraftStore.state).toEqual({
      description: '',
      amount: '',
    })
    await vi.waitFor(() => {
      expect(warningsAtSuccess).toEqual([false])
    })
    unsubscribe()
  })

  it('restores incomplete values exactly, including a blank date and the unsubmitted position', async () => {
    const storage = createSessionStorage({
      'regningen.invoice-draft': storedDraft,
    })

    await initializeInvoiceDraftPersistence(storage)

    expect(invoiceDraftStore.state).toEqual(storedDraft.invoice)
    expect(invoicePositionDraftStore.state).toEqual(storedDraft.newPosition)
    expect(invoiceDraftPersistenceStore.state).toMatchObject({
      initialized: true,
      saved: true,
      error: null,
    })
    expect(storage.values.get('regningen.invoice-draft')).toEqual(storedDraft)
  })

  it('saves every edit as one current envelope without waiting for a debounce', async () => {
    const storage = createSessionStorage()
    await initializeInvoiceDraftPersistence(storage)

    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'draft-1' }))
    invoicePositionDraftStore.setState(() => ({
      description: 'unfinished row',
      amount: '0,',
    }))
    await waitForInvoiceDraftPersistence()

    expect(storage.values.get('regningen.invoice-draft')).toEqual({
      schemaVersion: 1,
      invoice: { ...expectedEmptyDraft, number: 'draft-1' },
      newPosition: { description: 'unfinished row', amount: '0,' },
    })
    expect(invoiceDraftPersistenceStore.state).toMatchObject({
      saved: true,
      error: null,
    })
  })

  it('warns and starts empty for an unsupported envelope rather than guessing fields', async () => {
    const storage = createSessionStorage({
      'regningen.invoice-draft': {
        ...storedDraft,
        invoice: { ...storedDraft.invoice, town: 42 },
      },
    })

    await initializeInvoiceDraftPersistence(storage)

    expect(invoiceDraftStore.state).toEqual(expectedEmptyDraft)
    expect(invoicePositionDraftStore.state).toEqual({
      description: '',
      amount: '',
    })
    expect(invoiceDraftPersistenceStore.state).toMatchObject({
      initialized: true,
      saved: true,
      error: expect.stringContaining('Entwurf'),
    })
    expect(storage.values.has('regningen.invoice-draft')).toBe(false)
  })

  it('keeps edits in memory and marks them unsaved when session persistence fails', async () => {
    const storage = createSessionStorage()
    storage.setItem = async () => {
      throw new Error('session storage blocked')
    }
    await initializeInvoiceDraftPersistence(storage)

    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'still-here' }))
    await waitForInvoiceDraftPersistence()

    expect(invoiceDraftStore.state.number).toBe('still-here')
    expect(invoiceDraftPersistenceStore.state).toMatchObject({
      saved: false,
      error: expect.stringContaining('session storage blocked'),
    })
  })

  it('does not let an older in-flight save resurrect the draft after a confirmed clear', async () => {
    const storage = createSessionStorage()
    let markStarted = () => {}
    let finishWrite = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const blockedWrite = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    storage.setItem = async (key, value) => {
      markStarted()
      await blockedWrite
      storage.values.set(key, value)
    }
    await initializeInvoiceDraftPersistence(storage)

    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'old draft' }))
    await started
    const clearing = clearStoredInvoiceDraft()
    finishWrite()
    await clearing
    resetInvoiceDraft()
    await waitForInvoiceDraftPersistence()

    expect(storage.values.get('regningen.invoice-draft')).toEqual({
      schemaVersion: 1,
      invoice: expectedEmptyDraft,
      newPosition: { description: '', amount: '' },
    })
  })

  it('attaches a native unload warning only while a draft is not saved', async () => {
    const storage = createSessionStorage()
    await initializeInvoiceDraftPersistence(storage)

    const savedEvent = new Event('beforeunload', {
      cancelable: true,
    })
    window.dispatchEvent(savedEvent)
    expect(savedEvent.defaultPrevented).toBe(false)

    storage.setItem = async () => {
      throw new Error('session storage blocked')
    }
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'unsaved' }))
    await waitForInvoiceDraftPersistence()

    const unsavedEvent = new Event('beforeunload', {
      cancelable: true,
    })
    window.dispatchEvent(unsavedEvent)
    expect(unsavedEvent.defaultPrevented).toBe(true)
  })

  it('clears persisted work before resetting and refuses a failed discard', async () => {
    const storage = createSessionStorage({
      'regningen.invoice-draft': storedDraft,
    })
    await initializeInvoiceDraftPersistence(storage)
    invoiceDraftStore.setState(() => storedDraft.invoice)
    invoicePositionDraftStore.setState(() => storedDraft.newPosition)
    await waitForInvoiceDraftPersistence()

    await clearStoredInvoiceDraft()
    resetInvoiceDraft()
    await waitForInvoiceDraftPersistence()
    expect(invoiceDraftStore.state).toEqual(expectedEmptyDraft)
    expect(invoicePositionDraftStore.state).toEqual({
      description: '',
      amount: '',
    })
    expect(storage.values.get('regningen.invoice-draft')).toEqual({
      schemaVersion: 1,
      invoice: expectedEmptyDraft,
      newPosition: { description: '', amount: '' },
    })

    storage.removeItem = async () => {
      throw new Error('session storage removal failed')
    }
    invoiceDraftStore.setState((draft) => ({
      ...draft,
      number: 'keep-current',
    }))
    await waitForInvoiceDraftPersistence()
    await expect(clearStoredInvoiceDraft()).rejects.toThrow(
      'session storage removal failed',
    )
    expect(invoiceDraftStore.state.number).toBe('keep-current')
    expect(invoiceDraftPersistenceStore.state.saved).toBe(false)
  })
})

describe('invoice draft reset', () => {
  it('clears every entered field and position and restores 7% VAT', () => {
    invoiceDraftStore.setState(() => ({
      number: '2026-001',
      date: '2026-04-01',
      subject: 'Speisen',
      company: 'Muster GmbH',
      name: 'Max Mustermann',
      street: 'Musterstraße 1',
      postalCode: '20095',
      town: 'Hamburg',
      rate: 19,
      items: [
        { description: 'Catering', amount: '119,00' },
        { description: 'Lieferung', amount: '11,90' },
      ],
    }))

    resetInvoiceDraft()

    expect(invoiceDraftStore.state).toStrictEqual(expectedEmptyDraft)
    expect(invoicePositionDraftStore.state).toEqual({
      description: '',
      amount: '',
    })
  })
})
