import { Store } from '@tanstack/store'
import type { InvoiceDraft } from './invoice'

export type { InvoiceDraft, InvoiceLineDraft } from './invoice'

export function createEmptyInvoiceDraft(): InvoiceDraft {
  return {
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
}

export const invoiceDraftStore = new Store<InvoiceDraft>(
  createEmptyInvoiceDraft(),
)

export function resetInvoiceDraft() {
  invoiceDraftStore.setState(() => createEmptyInvoiceDraft())
}
