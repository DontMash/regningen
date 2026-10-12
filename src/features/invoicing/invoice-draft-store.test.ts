import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyInvoiceDraft,
  invoiceDraftStore,
  invoicePositionDraftStore,
  resetInvoiceDraft,
  restoreInvoiceUpdateSnapshot,
  saveInvoiceUpdateSnapshot,
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

function createSessionStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

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

describe('temporary invoice snapshots for an accepted update', () => {
  beforeEach(resetInvoiceDraft)
  afterEach(resetInvoiceDraft)

  it('restores exact incomplete invoice and unsubmitted position values in the same tab', () => {
    const tabStorage = createSessionStorage()
    const incompleteInvoice = {
      ...createEmptyInvoiceDraft(),
      number: ' draft / 17 ',
      date: 'not-a-date',
      subject: 'Unfinished subject',
      company: 'Recipient GmbH',
      street: 'Main St',
      postalCode: '',
      town: 'Hamburg',
      rate: 19 as const,
      items: [{ description: 'Consulting', amount: 'not a price' }],
    }
    const incompletePosition = { description: 'Unsubmitted', amount: '0,' }
    invoiceDraftStore.setState(() => incompleteInvoice)
    invoicePositionDraftStore.setState(() => incompletePosition)

    saveInvoiceUpdateSnapshot(tabStorage, '2.1.0', '/invoice')
    resetInvoiceDraft()
    const restored = restoreInvoiceUpdateSnapshot(tabStorage, '2.1.0')

    expect(restored).toEqual({ route: '/invoice' })
    expect(invoiceDraftStore.state).toEqual(incompleteInvoice)
    expect(invoicePositionDraftStore.state).toEqual(incompletePosition)
    expect(restoreInvoiceUpdateSnapshot(tabStorage, '2.1.0')).toBeNull()
  })

  it('keeps simultaneous tabs’ invoice snapshots independent', () => {
    const firstTab = createSessionStorage()
    const secondTab = createSessionStorage()
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'first-tab' }))
    invoicePositionDraftStore.setState(() => ({
      description: 'first row',
      amount: '1',
    }))
    saveInvoiceUpdateSnapshot(firstTab, '2.1.0', '/invoice')

    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'second-tab' }))
    invoicePositionDraftStore.setState(() => ({
      description: 'second row',
      amount: '2',
    }))
    saveInvoiceUpdateSnapshot(secondTab, '2.1.0', '/business-profile')

    resetInvoiceDraft()
    expect(restoreInvoiceUpdateSnapshot(firstTab, '2.1.0')).toEqual({
      route: '/invoice',
    })
    expect(invoiceDraftStore.state.number).toBe('first-tab')
    expect(invoicePositionDraftStore.state.description).toBe('first row')
    expect(restoreInvoiceUpdateSnapshot(secondTab, '2.1.0')).toEqual({
      route: '/business-profile',
    })
    expect(invoiceDraftStore.state.number).toBe('second-tab')
    expect(invoicePositionDraftStore.state.description).toBe('second row')
  })

  it('rejects malformed or for-another-release snapshots instead of claiming restoration', () => {
    const tabStorage = createSessionStorage()
    tabStorage.setItem('regningen.pwa.invoice-update', '{broken')

    expect(() => restoreInvoiceUpdateSnapshot(tabStorage, '2.1.0')).toThrow(
      'Rechnungseingaben konnten nach der Aktualisierung nicht sicher wiederhergestellt werden.',
    )

    saveInvoiceUpdateSnapshot(tabStorage, '2.2.0', '/invoice')
    expect(() => restoreInvoiceUpdateSnapshot(tabStorage, '2.1.0')).toThrow(
      'Rechnungseingaben konnten nach der Aktualisierung nicht sicher wiederhergestellt werden.',
    )
  })
})

describe('invoice draft reset', () => {
  beforeEach(resetInvoiceDraft)
  afterEach(resetInvoiceDraft)

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
    const populatedDraft = invoiceDraftStore.state

    resetInvoiceDraft()

    expect(invoiceDraftStore.state).toStrictEqual(expectedEmptyDraft)
    expect(invoiceDraftStore.state).not.toBe(populatedDraft)
    expect(invoiceDraftStore.state.items).not.toBe(populatedDraft.items)
  })

  it('returns fresh defaults after edits between resets', () => {
    resetInvoiceDraft()
    const firstResetDraft = invoiceDraftStore.state

    invoiceDraftStore.setState((draft) => ({
      ...draft,
      number: '2026-002',
      date: '2026-04-02',
      rate: 19,
      items: [{ description: 'Catering', amount: '119,00' }],
    }))
    resetInvoiceDraft()

    expect(invoiceDraftStore.state).toStrictEqual(expectedEmptyDraft)
    expect(invoiceDraftStore.state).not.toBe(firstResetDraft)
    expect(invoiceDraftStore.state.items).not.toBe(firstResetDraft.items)
  })
})
