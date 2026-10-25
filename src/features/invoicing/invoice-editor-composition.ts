import { createInvoiceEditorState } from './invoice-editor-state'
import {
  clearStoredInvoiceDraft,
  createEmptyInvoiceDraft,
  invoiceDraftStore,
  invoicePositionDraftStore,
} from './invoice-draft-store'
import { invoiceEditingDomain } from './validation-domain'
import { businessValidation } from './validation-composition'

export function localInvoiceDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

export const invoiceEditorState = createInvoiceEditorState({
  invoice: invoiceDraftStore,
  unfinished: invoicePositionDraftStore,
  editing: invoiceEditingDomain,
  validation: businessValidation,
  freshInvoice: () => ({
    ...createEmptyInvoiceDraft(),
    date: localInvoiceDate(),
  }),
  clearPersisted: clearStoredInvoiceDraft,
})
