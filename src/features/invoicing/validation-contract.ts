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
export type VatRate = 7 | 19
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
  validateBusinessProfile: (
    input: BusinessProfileDraft,
  ) => ValidationOutcome<BusinessProfile>
  validateInvoice: (
    input: InvoiceValidationInput,
  ) => ValidationOutcome<ValidatedInvoice>
}
export type InvoiceTotals = { gross: number; net: number; tax: number }
