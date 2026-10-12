// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptyInvoiceDraft,
  invoiceDraftStore,
  invoicePositionDraftStore,
  resetInvoiceDraft,
} from './invoice-draft-store'
import { restoreInvoiceUpdateSession } from './invoice-update-participant'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import {
  abortPwaUpdateParticipants,
  preparePwaUpdateParticipants,
} from '@/features/pwa/update-participants'

const snapshotKey = 'regningen.pwa.invoice-update'

beforeEach(() => {
  window.sessionStorage.clear()
  businessProfileStorageStatus.setState(() => ({ error: null }))
  window.history.replaceState({}, '', '/invoice')
  resetInvoiceDraft()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await abortPwaUpdateParticipants('2.1.0')
  resetInvoiceDraft()
  window.sessionStorage.clear()
})

describe('Invoice update participant', () => {
  it('captures and restores invalid invoice inputs and an unsubmitted position from a profile route', async () => {
    const invoice = {
      ...createEmptyInvoiceDraft(),
      number: ' 24/unfinished ',
      date: 'invalid-date',
      subject: 'draft subject',
      company: 'Private recipient',
      street: 'Road 1',
      postalCode: '',
      town: 'Hamburg',
      rate: 19 as const,
      items: [{ description: 'Work', amount: 'not-money' }],
    }
    const unsubmittedPosition = {
      description: 'Second position',
      amount: '0,',
    }
    invoiceDraftStore.setState(() => invoice)
    invoicePositionDraftStore.setState(() => unsubmittedPosition)
    window.history.replaceState({}, '', '/business-profile')

    await preparePwaUpdateParticipants('2.1.0')
    resetInvoiceDraft()
    const restored = restoreInvoiceUpdateSession('2.1.0')

    expect(restored).toEqual({ route: '/business-profile' })
    expect(invoiceDraftStore.state).toEqual(invoice)
    expect(invoicePositionDraftStore.state).toEqual(unsubmittedPosition)
    expect(window.sessionStorage.getItem(snapshotKey)).toBeNull()
  })

  it('clears an obsolete snapshot when the current tab has no unfinished invoice', async () => {
    window.sessionStorage.setItem(snapshotKey, 'old snapshot')

    await preparePwaUpdateParticipants('2.1.0')

    expect(window.sessionStorage.getItem(snapshotKey)).toBeNull()
  })

  it('defers reload while profile storage failure needs user recovery', async () => {
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'unfinished' }))
    businessProfileStorageStatus.setState(() => ({
      error: 'Das Profil konnte nicht gespeichert werden.',
    }))

    await expect(preparePwaUpdateParticipants('2.1.0')).rejects.toThrow(
      'Das Profil konnte nicht gespeichert werden.',
    )
    expect(invoiceDraftStore.state.number).toBe('unfinished')
    expect(window.sessionStorage.getItem(snapshotKey)).toBeNull()

    businessProfileStorageStatus.setState(() => ({ error: null }))
    await preparePwaUpdateParticipants('2.1.0')
    expect(window.sessionStorage.getItem(snapshotKey)).not.toBeNull()
  })

  it('defers preparation when a tab with work cannot write its session snapshot', async () => {
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'unfinished' }))
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('session storage blocked')
    })

    await expect(preparePwaUpdateParticipants('2.1.0')).rejects.toThrow(
      'session storage blocked',
    )
  })

  it('clears an abandoned snapshot when a replacement write fails', async () => {
    invoiceDraftStore.setState((draft) => ({ ...draft, number: 'unfinished' }))
    window.sessionStorage.setItem(snapshotKey, 'stale snapshot')
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === snapshotKey) throw new Error('session storage write failed')
      originalSetItem.call(this, key, value)
    })

    await expect(preparePwaUpdateParticipants('2.1.0')).rejects.toThrow(
      'session storage write failed',
    )
    await abortPwaUpdateParticipants('2.1.0')

    expect(window.sessionStorage.getItem(snapshotKey)).toBeNull()
  })

  it('rejects malformed and incompatible snapshots instead of restoring them', () => {
    window.sessionStorage.setItem(snapshotKey, '{broken')

    expect(() => restoreInvoiceUpdateSession('2.1.0')).toThrow(
      'Rechnungseingaben konnten nach der Aktualisierung nicht sicher wiederhergestellt werden.',
    )
    expect(window.sessionStorage.getItem(snapshotKey)).toBeNull()

    window.sessionStorage.setItem(
      snapshotKey,
      JSON.stringify({ schemaVersion: 1, targetRelease: '2.0.0' }),
    )
    expect(() => restoreInvoiceUpdateSession('2.1.0')).toThrow(
      'Rechnungseingaben konnten nach der Aktualisierung nicht sicher wiederhergestellt werden.',
    )
  })
})
