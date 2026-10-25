/** Editable inputs deliberately permit incomplete and invalid business values. */
export type BusinessProfileDraft = {
  businessName: string
  serviceDescription: string
  ownerName: string
  street: string
  postalCode: string
  town: string
  phone: string
  mobile: string
  iban: string
  vatId: string
  taxNumber: string
}

export type EntryLanguage = 'de' | 'en'
/** Supported business rates, shared with editable persistence and UI choices. */
export const SUPPORTED_VAT_RATES = [7, 19] as const
export type VatRate = (typeof SUPPORTED_VAT_RATES)[number]
export type InvoiceLineDraft = {
  description: string
  amount: string
  amountLocale?: EntryLanguage
}
export type InvoiceDraft = {
  number: string
  date: string
  subject: string
  company: string
  name: string
  street: string
  postalCode: string
  town: string
  rate: VatRate
  items: InvoiceLineDraft[]
}

/** Validation also accepts unsupported numeric rates and reports their business meaning. */
export type InvoiceValidationInput = Omit<InvoiceDraft, 'rate'> & {
  rate: number
}

/** Normalized data returned only after all profile invariants pass. */
export type BusinessProfile = Readonly<BusinessProfileDraft>
export type ValidatedInvoice = {
  draft: InvoiceDraft
  /** Blank working rows are retained in draft but are not completed charges. */
  positions: { description: string; grossAmount: number }[]
}
export type ValidationFailure = {
  path: (string | number)[]
  reason:
    | 'required'
    | 'too-long'
    | 'invalid-iban'
    | 'tax-identifier-required'
    | 'invalid-vat-id'
    | 'invalid-date'
    | 'invalid-rate'
    | 'recipient-required'
    | 'position-required'
    | 'position-limit'
    | 'invalid-amount'
  limit?: number
}
export type ValidationOutcome<T> =
  { valid: true; data: T } | { valid: false; failures: ValidationFailure[] }

/** Receives an upper-case IBAN without whitespace. */
export type IbanVerification = { isValid: (iban: string) => boolean }
export type BusinessValidation = {
  readonly profileFieldLimits: Readonly<
    Record<Exclude<keyof BusinessProfileDraft, 'iban' | 'vatId'>, number>
  >
  readonly invoiceFieldLimits: Readonly<
    Record<Exclude<keyof InvoiceDraft, 'date' | 'rate' | 'items'>, number>
  >
  readonly vatRates: ReadonlyArray<VatRate>
  validateBusinessProfile: (
    input: BusinessProfileDraft,
  ) => ValidationOutcome<BusinessProfile>
  validateInvoice: (
    input: InvoiceValidationInput,
  ) => ValidationOutcome<ValidatedInvoice>
}
export type InvoiceTotals = { gross: number; net: number; tax: number }

/** Decisions over editable inputs. Rejected additions never consume the unfinished row.
 * Preview includes only explicitly added rows and is unavailable for invalid charges.
 * Amount interpretation always uses captured entry language (legacy default: German).
 */
export type InvoiceEditing = {
  /** Protect every editable field, including unfinished input, relative to fresh defaults. */
  hasWorkingData: (
    draft: InvoiceDraft,
    unfinished: InvoiceLineDraft,
    defaults: InvoiceDraft,
  ) => boolean
  hasPositionData: (position: InvoiceLineDraft) => boolean
  validatePosition: (position: InvoiceLineDraft) => ValidationFailure[]
  /** Capacity only: invalid unfinished input stays submit-able for field feedback.
   * addPosition additionally enforces validatePosition before accepting a charge.
   */
  canAddPosition: (items: InvoiceLineDraft[]) => boolean
  addPosition: (
    items: InvoiceLineDraft[],
    position: InvoiceLineDraft,
  ) => ValidationOutcome<InvoiceLineDraft[]>
  removePosition: (
    items: InvoiceLineDraft[],
    index: number,
  ) => InvoiceLineDraft[]
  previewTotals: (draft: InvoiceDraft) => InvoiceTotals | null
  parseAmount: (position: InvoiceLineDraft) => number | null
  descriptionLimit: number
}
