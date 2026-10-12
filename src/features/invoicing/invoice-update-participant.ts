import {
  clearInvoiceUpdateSnapshot,
  invoiceDraftStore,
  invoicePositionDraftStore,
  restoreInvoiceUpdateSnapshot,
  saveInvoiceUpdateSnapshot,
} from './invoice-draft-store'
import type { InvoiceDraft, InvoiceLineDraft } from './invoice'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import { registerUpdateParticipant } from '@/features/pwa/update-participants'

function currentLocalDate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function hasUnfinishedInvoiceWork(
  invoice: InvoiceDraft,
  newPosition: InvoiceLineDraft,
) {
  return Boolean(
    invoice.number !== '' ||
    invoice.subject !== '' ||
    invoice.company !== '' ||
    invoice.name !== '' ||
    invoice.street !== '' ||
    invoice.postalCode !== '' ||
    invoice.town !== '' ||
    invoice.items.length > 0 ||
    invoice.rate !== 7 ||
    (invoice.date !== '' && invoice.date !== currentLocalDate()) ||
    newPosition.description !== '' ||
    newPosition.amount !== '',
  )
}

let preparedRelease: string | null = null
registerUpdateParticipant({
  prepare(targetRelease) {
    if (typeof window === 'undefined') {
      throw new Error('Dieser Tab kann seine Eingaben nicht sicher sichern.')
    }

    if (businessProfileStorageStatus.state.error) {
      throw new Error(businessProfileStorageStatus.state.error)
    }
    preparedRelease = targetRelease
    clearInvoiceUpdateSnapshot(window.sessionStorage)
    if (
      hasUnfinishedInvoiceWork(
        invoiceDraftStore.state,
        invoicePositionDraftStore.state,
      )
    ) {
      saveInvoiceUpdateSnapshot(
        window.sessionStorage,
        targetRelease,
        window.location.pathname,
      )
    }
  },
  abort(targetRelease) {
    if (preparedRelease !== targetRelease || typeof window === 'undefined')
      return
    clearInvoiceUpdateSnapshot(window.sessionStorage)
    preparedRelease = null
  },
})

export function restoreInvoiceUpdateSession(runningRelease: string) {
  if (typeof window === 'undefined') return null
  return restoreInvoiceUpdateSnapshot(window.sessionStorage, runningRelease)
}
