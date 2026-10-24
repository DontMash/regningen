import type { InvoiceDraft, InvoiceLineDraft } from './validation-contract'

export const INVOICE_DRAFT_STORAGE_KEY = 'regningen.invoice-draft'
export const INVOICE_DRAFT_RESET_STAMP_KEY =
  'regningen.invoice-draft.reset-generation'

export interface InvoiceDraftEnvelope {
  schemaVersion: 1
  invoice: InvoiceDraft
  newPosition: InvoiceLineDraft
}

export type StoredInvoiceDraft =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'loaded'; envelope: InvoiceDraftEnvelope }

/** Structural decoding preserves raw editable inputs, not business validity.
 * Operations reject on storage failure. The caller sequences writes and deletion.
 * A factory transfers ownership of each connection, including failed hydration;
 * recovery opens another connection using that same factory, never a fallback.
 */
export interface InvoiceDraftPersistence {
  readDraft: () => Promise<StoredInvoiceDraft>
  readResetGeneration: () => Promise<string | null>
  writeDraft: (envelope: InvoiceDraftEnvelope) => Promise<void>
  writeResetGeneration: (generation: string) => Promise<void>
  clearDraft: () => Promise<void>
  dispose: () => Promise<void>
}

export type OpenInvoiceDraftPersistence = () => InvoiceDraftPersistence
