import { Store } from '@tanstack/store'
import { z } from 'zod'
import type { InvoiceDraft, InvoiceLineDraft } from './invoice'

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

export const invoicePositionDraftStore = new Store<InvoiceLineDraft>({
  description: '',
  amount: '',
})

const INVOICE_UPDATE_SNAPSHOT_KEY = 'regningen.pwa.invoice-update'
const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    targetRelease: z.string().min(1),
    route: z.enum(['/', '/invoice', '/business-profile']),
    invoice: z
      .object({
        number: z.string(),
        date: z.string(),
        subject: z.string(),
        company: z.string(),
        name: z.string(),
        street: z.string(),
        postalCode: z.string(),
        town: z.string(),
        rate: z.union([z.literal(7), z.literal(19)]),
        items: z.array(
          z.object({ description: z.string(), amount: z.string() }).strict(),
        ),
      })
      .strict(),
    newPosition: z
      .object({ description: z.string(), amount: z.string() })
      .strict(),
  })
  .strict()

export type InvoiceUpdateSessionStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

export class InvoiceUpdateSnapshotError extends Error {
  constructor() {
    super(
      'Rechnungseingaben konnten nach der Aktualisierung nicht sicher wiederhergestellt werden.',
    )
    this.name = 'InvoiceUpdateSnapshotError'
  }
}

export function saveInvoiceUpdateSnapshot(
  storage: InvoiceUpdateSessionStorage,
  targetRelease: string,
  route: string,
) {
  const snapshot = snapshotSchema.parse({
    schemaVersion: 1,
    targetRelease,
    route,
    invoice: invoiceDraftStore.state,
    newPosition: invoicePositionDraftStore.state,
  })
  storage.setItem(INVOICE_UPDATE_SNAPSHOT_KEY, JSON.stringify(snapshot))
}

export function clearInvoiceUpdateSnapshot(
  storage: InvoiceUpdateSessionStorage,
) {
  storage.removeItem(INVOICE_UPDATE_SNAPSHOT_KEY)
}

export function restoreInvoiceUpdateSnapshot(
  storage: InvoiceUpdateSessionStorage,
  runningRelease: string,
): { route: string } | null {
  const encoded = storage.getItem(INVOICE_UPDATE_SNAPSHOT_KEY)
  if (encoded === null) return null

  let snapshot: z.infer<typeof snapshotSchema>
  try {
    snapshot = snapshotSchema.parse(JSON.parse(encoded))
    if (snapshot.targetRelease !== runningRelease) throw new Error()
  } catch {
    try {
      storage.removeItem(INVOICE_UPDATE_SNAPSHOT_KEY)
    } catch {
      // The invalid snapshot is never used, even when the browser blocks cleanup.
    }
    throw new InvoiceUpdateSnapshotError()
  }

  invoiceDraftStore.setState(() => snapshot.invoice)
  invoicePositionDraftStore.setState(() => snapshot.newPosition)
  storage.removeItem(INVOICE_UPDATE_SNAPSHOT_KEY)
  return { route: snapshot.route }
}

export function resetInvoiceDraft() {
  invoiceDraftStore.setState(() => createEmptyInvoiceDraft())
  invoicePositionDraftStore.setState(() => ({ description: '', amount: '' }))
}
