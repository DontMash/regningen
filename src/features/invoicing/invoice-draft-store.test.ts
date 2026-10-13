// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  resetInvoiceDraft()
})

afterEach(() => {
  disposeInvoiceDraftPersistence()
  resetInvoiceDraft()
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
