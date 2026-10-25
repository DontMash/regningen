import type {
  BusinessProfileDraft,
  BusinessValidation,
  EntryLanguage,
  IbanVerification,
  InvoiceDraft,
  InvoiceEditing,
  InvoiceLineDraft,
  InvoiceTotals,
  ValidationFailure,
  VatRate,
} from './validation-contract'
import { SUPPORTED_VAT_RATES } from './validation-contract'

const profileFieldLimits: BusinessValidation['profileFieldLimits'] = {
  businessName: 70,
  serviceDescription: 70,
  ownerName: 70,
  street: 85,
  postalCode: 20,
  town: 50,
  phone: 40,
  mobile: 40,
  taxNumber: 30,
}
const invoiceFieldLimits: BusinessValidation['invoiceFieldLimits'] = {
  number: 40,
  subject: 100,
  company: 70,
  name: 70,
  street: 85,
  postalCode: 85,
  town: 85,
}

export function createBusinessValidation(
  iban: IbanVerification,
): BusinessValidation {
  return {
    profileFieldLimits,
    invoiceFieldLimits,
    vatRates: SUPPORTED_VAT_RATES,
    validateBusinessProfile(input) {
      const data: BusinessProfileDraft = {
        businessName: input.businessName.trim(),
        serviceDescription: input.serviceDescription.trim(),
        ownerName: input.ownerName.trim(),
        street: input.street.trim(),
        postalCode: input.postalCode.trim(),
        town: input.town.trim(),
        phone: input.phone.trim(),
        mobile: input.mobile.trim(),
        iban: input.iban.replace(/\s+/g, '').toUpperCase(),
        vatId: input.vatId.replace(/\s+/g, '').toUpperCase(),
        taxNumber: input.taxNumber.trim(),
      }
      const failures: ValidationFailure[] = []
      const text = (
        field: keyof typeof profileFieldLimits,
        required = false,
      ) => {
        const limit = profileFieldLimits[field]
        if (required && !data[field])
          failures.push({ path: [field], reason: 'required' })
        if (data[field].length > limit)
          failures.push({ path: [field], reason: 'too-long', limit })
      }
      text('businessName', true)
      text('serviceDescription')
      text('ownerName', true)
      text('street', true)
      text('postalCode', true)
      text('town', true)
      text('phone')
      text('mobile')
      if (!iban.isValid(data.iban))
        failures.push({ path: ['iban'], reason: 'invalid-iban' })
      text('taxNumber')
      if (!data.vatId && !data.taxNumber)
        failures.push({ path: ['vatId'], reason: 'tax-identifier-required' })
      if (data.vatId && !/^DE\d{9}$/.test(data.vatId))
        failures.push({ path: ['vatId'], reason: 'invalid-vat-id' })
      return failures.length
        ? { valid: false, failures }
        : { valid: true, data }
    },
    validateInvoice(input) {
      const rate = SUPPORTED_VAT_RATES.find((value) => value === input.rate)
      if (rate === undefined)
        return {
          valid: false,
          failures: [{ path: ['rate'], reason: 'invalid-rate' }],
        }
      const draft: InvoiceDraft = {
        ...input,
        rate,
        number: input.number.trim(),
        company: input.company.trim(),
        name: input.name.trim(),
        street: input.street.trim(),
        postalCode: input.postalCode.trim(),
        town: input.town.trim(),
      }
      const failures: ValidationFailure[] = []
      const text = (
        field: keyof typeof invoiceFieldLimits,
        required = false,
      ) => {
        const limit = invoiceFieldLimits[field]
        if (required && !draft[field])
          failures.push({ path: [field], reason: 'required' })
        if (draft[field].length > limit)
          failures.push({ path: [field], reason: 'too-long', limit })
      }
      text('number', true)
      if (!isCalendarDate(draft.date))
        failures.push({ path: ['date'], reason: 'invalid-date' })
      text('subject')
      text('company')
      text('name')
      text('street', true)
      text('postalCode', true)
      text('town', true)
      if (draft.items.length > positionLimit)
        failures.push({
          path: ['items'],
          reason: 'position-limit',
          limit: positionLimit,
        })
      if (!draft.company && !draft.name)
        failures.push({ path: ['company'], reason: 'recipient-required' })
      const positions: { description: string; grossAmount: number }[] = []
      let filled = false
      for (const [index, item] of draft.items.entries()) {
        const positionFailures = validatePosition(item).filter(
          (failure) => hasPositionData(item) || failure.reason === 'too-long',
        )
        failures.push(
          ...positionFailures.map((failure) => ({
            ...failure,
            path: ['items', index, ...failure.path],
          })),
        )
        if (!hasPositionData(item)) continue
        filled = true
        const amount = parsePositionAmount(item)
        if (amount !== null && amount > 0)
          positions.push({ description: item.description, grossAmount: amount })
      }
      if (!filled)
        failures.push({ path: ['items'], reason: 'position-required' })
      return failures.length
        ? { valid: false, failures }
        : { valid: true, data: { draft, positions } }
    },
  }
}

const positionLimit = 16
const descriptionLimit = 85

function hasPositionData(position: InvoiceLineDraft) {
  return Boolean(position.description.trim() || position.amount.trim())
}

function parsePositionAmount(position: InvoiceLineDraft) {
  return parseEuroAmount(position.amount, position.amountLocale ?? 'de')
}

function validatePosition(position: InvoiceLineDraft): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  if (!position.description.trim())
    failures.push({ path: ['description'], reason: 'required' })
  if (position.description.length > descriptionLimit)
    failures.push({
      path: ['description'],
      reason: 'too-long',
      limit: descriptionLimit,
    })
  const amount = parsePositionAmount(position)
  if (amount === null || amount <= 0)
    failures.push({ path: ['amount'], reason: 'invalid-amount' })
  return failures
}

export const invoiceEditingDomain: InvoiceEditing = {
  hasWorkingData(draft, unfinished, defaults) {
    return Boolean(
      draft.number.trim() ||
      draft.subject.trim() ||
      draft.company.trim() ||
      draft.name.trim() ||
      draft.street.trim() ||
      draft.postalCode.trim() ||
      draft.town.trim() ||
      draft.date !== defaults.date ||
      draft.rate !== defaults.rate ||
      draft.items.some(hasPositionData) ||
      hasPositionData(unfinished),
    )
  },
  hasPositionData,
  validatePosition,
  descriptionLimit,
  parseAmount: parsePositionAmount,
  canAddPosition: (items) => items.length < positionLimit,
  addPosition(items, position) {
    const failures = validatePosition(position)
    if (items.length >= positionLimit)
      failures.push({
        path: [],
        reason: 'position-limit',
        limit: positionLimit,
      })
    return failures.length
      ? { valid: false, failures }
      : { valid: true, data: [...items, { ...position }] }
  },
  removePosition: (items, index) =>
    items.filter((_, itemIndex) => itemIndex !== index),
  previewTotals(draft) {
    const items = draft.items.filter(hasPositionData)
    if (!items.length || items.some((item) => validatePosition(item).length))
      return null
    const amounts: number[] = []
    for (const item of items) {
      const amount = parsePositionAmount(item)
      if (amount === null) return null
      amounts.push(amount)
    }
    return calculateInvoiceTotals(amounts, draft.rate)
  },
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** Integer cents, interpreted in the captured entry language, never UI locale. */
export function parseEuroAmount(
  input: string,
  locale: EntryLanguage,
): number | null {
  const raw = input.trim().replace(/[\s€]/g, '')
  if (!raw) return null
  let normalized: string
  if (locale === 'en') {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) return null
    normalized = raw.replaceAll(',', '')
  } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) {
    normalized = raw.replaceAll('.', '').replace(',', '.')
  } else if (/^\d+(?:,\d{1,2})?$/.test(raw)) {
    normalized = raw.replace(',', '.')
  } else if (/^\d+\.\d{1,2}$/.test(raw)) {
    normalized = raw
  } else return null
  const [euros, cents = ''] = normalized.split('.')
  const amount = Number(euros) * 100 + Number(cents.padEnd(2, '0'))
  return Number.isSafeInteger(amount) && amount <= 999999999 ? amount : null
}

export function calculateInvoiceTotals(
  grossAmounts: number[],
  rate: VatRate,
): InvoiceTotals {
  const gross = grossAmounts.reduce((sum, amount) => sum + amount, 0)
  const net = Math.round((gross * 100) / (100 + rate))
  return { gross, net, tax: gross - net }
}
