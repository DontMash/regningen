import type {
  BusinessProfileDraft,
  BusinessValidation,
  EntryLanguage,
  IbanVerification,
  InvoiceDraft,
  InvoiceTotals,
  ValidationFailure,
  VatRate,
} from './validation-contract'

export function createBusinessValidation(
  iban: IbanVerification,
): BusinessValidation {
  return {
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
        field: keyof BusinessProfileDraft,
        limit: number,
        required = false,
      ) => {
        if (required && !data[field])
          failures.push({ path: [field], reason: 'required' })
        if (data[field].length > limit)
          failures.push({ path: [field], reason: 'too-long', limit })
      }
      text('businessName', 70, true)
      text('serviceDescription', 70)
      text('ownerName', 70, true)
      text('street', 85, true)
      text('postalCode', 20, true)
      text('town', 50, true)
      text('phone', 40)
      text('mobile', 40)
      if (!iban.isValid(data.iban))
        failures.push({ path: ['iban'], reason: 'invalid-iban' })
      text('taxNumber', 30)
      if (!data.vatId && !data.taxNumber)
        failures.push({ path: ['vatId'], reason: 'tax-identifier-required' })
      if (data.vatId && !/^DE\d{9}$/.test(data.vatId))
        failures.push({ path: ['vatId'], reason: 'invalid-vat-id' })
      return failures.length
        ? { valid: false, failures }
        : { valid: true, data }
    },
    validateInvoice(input) {
      const rate = input.rate
      if (rate !== 7 && rate !== 19)
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
        field:
          | 'number'
          | 'subject'
          | 'company'
          | 'name'
          | 'street'
          | 'postalCode'
          | 'town',
        limit: number,
        required = false,
      ) => {
        if (required && !draft[field])
          failures.push({ path: [field], reason: 'required' })
        if (draft[field].length > limit)
          failures.push({ path: [field], reason: 'too-long', limit })
      }
      text('number', 40, true)
      if (!isCalendarDate(draft.date))
        failures.push({ path: ['date'], reason: 'invalid-date' })
      text('subject', 100)
      text('company', 70)
      text('name', 70)
      text('street', 85, true)
      text('postalCode', 85, true)
      text('town', 85, true)
      if (draft.items.length > 16)
        failures.push({ path: ['items'], reason: 'position-limit', limit: 16 })
      if (!draft.company && !draft.name)
        failures.push({ path: ['company'], reason: 'recipient-required' })
      const positions: { description: string; grossAmount: number }[] = []
      let filled = false
      for (const [index, item] of draft.items.entries()) {
        if (item.description.length > 85)
          failures.push({
            path: ['items', index, 'description'],
            reason: 'too-long',
            limit: 85,
          })
        if (!item.description.trim() && !item.amount.trim()) continue
        filled = true
        if (!item.description.trim())
          failures.push({
            path: ['items', index, 'description'],
            reason: 'required',
          })
        const amount = parseEuroAmount(item.amount, item.amountLocale ?? 'de')
        if (amount === null || amount <= 0)
          failures.push({
            path: ['items', index, 'amount'],
            reason: 'invalid-amount',
          })
        else
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
