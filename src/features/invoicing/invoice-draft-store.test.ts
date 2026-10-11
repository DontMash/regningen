import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyInvoiceDraft,
  invoiceDraftStore,
  resetInvoiceDraft,
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
