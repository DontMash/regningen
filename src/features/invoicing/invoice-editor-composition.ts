import { createInvoiceEditorState } from './invoice-editor-state'
import {
  invoiceDraftStore,
  invoicePositionDraftStore,
} from './invoice-draft-store'
import { invoiceEditingDomain } from './validation-domain'
import { businessValidation } from './validation-composition'

export const invoiceEditorState = createInvoiceEditorState({
  invoice: invoiceDraftStore,
  unfinished: invoicePositionDraftStore,
  editing: invoiceEditingDomain,
  validation: businessValidation,
})
