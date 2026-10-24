import { describe, expect, it } from 'vitest'
import {
  createBusinessValidation,
  parseEuroAmount,
  calculateInvoiceTotals,
} from './validation-domain'
import { emptyBusinessProfile } from './business-profile'
import { businessValidation } from './validation-composition'
import type { InvoiceDraft } from './validation-contract'

const profile = {
  ...emptyBusinessProfile,
  businessName: ' Example ',
  ownerName: ' Owner ',
  street: ' Main 1 ',
  postalCode: ' 12345 ',
  town: ' Town ',
  iban: 'de89 3704 0044 0532 0130 00',
  vatId: 'de 123 456 789',
}
const invoice = (): InvoiceDraft => ({
  number: ' 2026-001 ',
  date: '2026-04-01',
  subject: '',
  company: ' Recipient ',
  name: '',
  street: ' Main 1 ',
  postalCode: ' 12345 ',
  town: ' Town ',
  rate: 19,
  items: [{ description: 'Service', amount: '119,00' }],
})

// Existing domain/module seam: outcomes are business data, not localized issues.
describe('package-independent business validation', () => {
  it('returns normalized profile data using the supplied international IBAN capability', () => {
    expect(businessValidation.validateBusinessProfile(profile)).toEqual({
      valid: true,
      data: {
        ...profile,
        businessName: 'Example',
        ownerName: 'Owner',
        street: 'Main 1',
        postalCode: '12345',
        town: 'Town',
        iban: 'DE89370400440532013000',
        vatId: 'DE123456789',
      },
    })
    expect(
      businessValidation.validateBusinessProfile({
        ...profile,
        vatId: '',
        taxNumber: '12/345',
        iban: 'GB82 WEST 1234 5698 7654 32',
      }).valid,
    ).toBe(true)
    expect(
      businessValidation.validateBusinessProfile({
        ...profile,
        iban: 'DE89370400440532013001',
      }),
    ).toEqual({
      valid: false,
      failures: [{ path: ['iban'], reason: 'invalid-iban' }],
    })
  })

  it('retains blank working rows but returns only completed charges and normalized recipient data', () => {
    const input = invoice()
    input.items.push({ description: '', amount: '' })
    const result = businessValidation.validateInvoice(input)
    expect(result).toEqual({
      valid: true,
      data: {
        draft: {
          ...input,
          number: '2026-001',
          company: 'Recipient',
          street: 'Main 1',
          postalCode: '12345',
          town: 'Town',
        },
        positions: [{ description: 'Service', grossAmount: 11900 }],
      },
    })
    expect(input.company).toBe(' Recipient ')
    expect(calculateInvoiceTotals([11900], 19)).toEqual({
      gross: 11900,
      net: 10000,
      tax: 1900,
    })
  })

  it('uses entry language and preserves integer-cent precision and amount limits', () => {
    const input = invoice()
    input.items = [
      { description: 'Charge', amount: '1.234', amountLocale: 'en' },
    ]
    expect(businessValidation.validateInvoice(input)).toEqual({
      valid: false,
      failures: [{ path: ['items', 0, 'amount'], reason: 'invalid-amount' }],
    })
    input.items[0].amountLocale = 'de'
    const result = businessValidation.validateInvoice(input)
    expect(result.valid && result.data.positions).toEqual([
      { description: 'Charge', grossAmount: 123400 },
    ])
    expect(parseEuroAmount('9999999.99', 'en')).toBe(999999999)
    expect(parseEuroAmount('10000000.00', 'en')).toBeNull()
    expect(parseEuroAmount('1.234', 'en')).toBeNull()
    expect(parseEuroAmount('12,50', 'en')).toBeNull()
  })

  it.each([
    [{ rate: 20 }, { path: ['rate'], reason: 'invalid-rate' }],
    [{ date: '2026-02-29' }, { path: ['date'], reason: 'invalid-date' }],
    [{ number: '' }, { path: ['number'], reason: 'required' }],
    [
      { company: '', name: '' },
      { path: ['company'], reason: 'recipient-required' },
    ],
    [{ items: [] }, { path: ['items'], reason: 'position-required' }],
    [
      { subject: 'x'.repeat(101) },
      { path: ['subject'], reason: 'too-long', limit: 100 },
    ],
    [
      { items: [{ description: '', amount: '1' }] },
      { path: ['items', 0, 'description'], reason: 'required' },
    ],
    [
      { items: [{ description: 'Charge', amount: '0' }] },
      { path: ['items', 0, 'amount'], reason: 'invalid-amount' },
    ],
    [
      {
        items: Array.from({ length: 17 }, () => ({
          description: 'Charge',
          amount: '1',
        })),
      },
      { path: ['items'], reason: 'position-limit', limit: 16 },
    ],
  ])(
    'rejects invalid invoice variation %j with field-specific business meaning',
    (variation, failure) => {
      expect(
        businessValidation.validateInvoice({ ...invoice(), ...variation }),
      ).toEqual({ valid: false, failures: [failure] })
    },
  )

  it('identifies incomplete profile fields without localization or package issues', () => {
    const validation = createBusinessValidation({ isValid: () => false })
    const result = validation.validateBusinessProfile(emptyBusinessProfile)
    expect(result).toEqual({
      valid: false,
      failures: [
        { path: ['businessName'], reason: 'required' },
        { path: ['ownerName'], reason: 'required' },
        { path: ['street'], reason: 'required' },
        { path: ['postalCode'], reason: 'required' },
        { path: ['town'], reason: 'required' },
        { path: ['iban'], reason: 'invalid-iban' },
        { path: ['vatId'], reason: 'tax-identifier-required' },
      ],
    })
  })
})
