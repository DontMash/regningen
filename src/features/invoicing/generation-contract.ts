import type {
  BusinessProfile,
  BusinessProfileDraft,
  EntryLanguage,
  InvoiceTotals,
  InvoiceValidationInput,
  ValidatedInvoice,
  ValidationFailure,
} from './validation-contract'

/** Only the generation operation supplies this normalized, business-valid document. */
export type InvoiceDocument = {
  profile: BusinessProfile
  invoice: ValidatedInvoice
  totals: InvoiceTotals
  language: EntryLanguage
}

/** Browser-local PDF capability. Format failures retain their underlying cause. */
export type InvoicePdfCapability = {
  render: (document: InvoiceDocument) => Promise<Uint8Array>
}
export type PdfFailureReason =
  | 'unavailable'
  | 'characters'
  | 'business-name'
  | 'service'
  | 'addresses'
  | 'subject'
  | 'description'
  | 'positions'
  | 'invoice'
export class InvoicePdfFailure extends Error {
  constructor(
    readonly reason: PdfFailureReason,
    options?: ErrorOptions,
  ) {
    super(`Invoice PDF capability: ${reason}`, options)
    this.name = 'InvoicePdfFailure'
  }
}
export type InvoiceGenerationOutcome =
  | {
      status: 'invalid'
      profileFailures: ValidationFailure[]
      invoiceFailures: ValidationFailure[]
    }
  | { status: 'generated'; bytes: Uint8Array; number: string; date: string }
export type InvoiceGeneration = {
  /** Reject invalid inputs before invoking PDF rendering; never add unfinished positions.
   * Known capability failures and unexpected defects reject rather than claim success.
   */
  generate: (
    profile: BusinessProfileDraft,
    invoice: InvoiceValidationInput,
    language: EntryLanguage,
  ) => Promise<InvoiceGenerationOutcome>
}
export type InvoicePdfDownload = (bytes: Uint8Array, filename: string) => void
