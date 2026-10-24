import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import { calculateInvoiceTotals, parseEuroAmount } from './validation-domain'
import { businessValidation } from './validation-composition'
import { validationMessage } from './validation-feedback'
import type { InvoiceValidationInput } from './validation-contract'

const defaultGetLocale = getLocale
afterEach(() => overwriteGetLocale(defaultGetLocale))
const validate = businessValidation.validateInvoice
const baseInvoice: InvoiceValidationInput = {
  number: '2026-001',
  date: '2026-04-01',
  subject: 'Speisen',
  company: '',
  name: 'Max Mustermann',
  street: 'Musterstraße 1',
  postalCode: '20095',
  town: 'Hamburg',
  rate: 7,
  items: [{ description: 'Catering', amount: '107,00' }],
}

describe('invoice amounts', () => {
  it.each([
    ['1.234,56 €', 123456],
    ['12,5', 1250],
    ['', null],
    ['  12 € ', 1200],
    ['1.234', 123400],
    ['1.234,5', 123450],
    ['12.50', 1250],
    ['1,234', null],
    ['1.234.56', null],
    ['10000000,00', null],
  ])('interprets German entry %s as integer cents', (input, expected) => {
    expect(parseEuroAmount(input, 'de')).toBe(expected)
  })
  it.each([
    ['1,234.56 €', 123456],
    ['1,234', 123400],
    ['12.5', 1250],
    ['12,50', null],
    ['1.234', null],
    ['12,34.56', null],
    ['9999999.99', 999999999],
    ['10000000.00', null],
  ])(
    'interprets English entry %s without guessing or rounding',
    (input, expected) => {
      expect(parseEuroAmount(input, 'en')).toBe(expected)
    },
  )
  it('splits VAT-inclusive totals using the selected rate', () => {
    expect(calculateInvoiceTotals([10700], 7)).toEqual({
      gross: 10700,
      net: 10000,
      tax: 700,
    })
    expect(calculateInvoiceTotals([11900], 19)).toEqual({
      gross: 11900,
      net: 10000,
      tax: 1900,
    })
  })
  it('accepts a complete invoice addressed to a person', () => {
    expect(validate(baseInvoice).valid).toBe(true)
  })
  it('validates captured amount interpretation rather than a later interface locale', () => {
    expect(
      validate({
        ...baseInvoice,
        items: [{ description: 'Charge', amount: '1.234', amountLocale: 'en' }],
      }).valid,
    ).toBe(false)
    overwriteGetLocale(() => 'en')
    expect(
      validate({
        ...baseInvoice,
        items: [{ description: 'Charge', amount: '1.234', amountLocale: 'de' }],
      }).valid,
    ).toBe(true)
  })
  it('rejects an invoice without a recipient or a complete positive-price item', () => {
    expect(
      validate({
        ...baseInvoice,
        name: '',
        items: [{ description: 'Catering', amount: '0' }],
      }).valid,
    ).toBe(false)
  })
  it('presents domain validation messages in the current interface language', () => {
    overwriteGetLocale(() => 'en')
    const result = validate({
      ...baseInvoice,
      number: '',
      date: 'invalid',
      company: '',
      name: '',
      street: '',
      postalCode: '',
      town: '',
      items: [{ description: '', amount: 'invalid' }],
    })
    expect(result.valid).toBe(false)
    if (result.valid) return
    const messages = result.failures.map((failure) =>
      validationMessage('invoice', failure),
    )
    expect(messages).toContain('Enter an invoice number.')
    expect(messages).toContain('Enter a positive gross amount.')
  })
  it.each([
    { date: '2026-02-29' },
    { date: '01.04.2026' },
    { company: '', name: '' },
    { items: [] },
    { items: [{ description: '', amount: '107,00' }] },
    { items: [{ description: 'Catering', amount: 'abc' }] },
    {
      items: Array.from({ length: 17 }, () => ({
        description: 'Position',
        amount: '1',
      })),
    },
  ])(
    'rejects invalid calendar, recipient or position inputs: %j',
    (variation) => {
      expect(validate({ ...baseInvoice, ...variation }).valid).toBe(false)
    },
  )
})
