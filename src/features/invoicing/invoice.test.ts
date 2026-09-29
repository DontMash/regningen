import { describe, expect, it } from 'vitest'
import {
  calculateInvoiceTotals,
  invoiceFormSchema,
  parseEuroAmount,
} from './invoice'

describe('invoice amounts', () => {
  it('parses German decimal and thousands separators into integer cents', () => {
    expect(parseEuroAmount('1.234,56 €')).toBe(123456)
    expect(parseEuroAmount('12,5')).toBe(1250)
  })

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
    const result = invoiceFormSchema.safeParse({
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
    })

    expect(result.success).toBe(true)
  })

  it('rejects an invoice without a recipient or a complete positive-price item', () => {
    const result = invoiceFormSchema.safeParse({
      number: '2026-001',
      date: '2026-04-01',
      subject: '',
      company: '',
      name: '',
      street: 'Musterstraße 1',
      postalCode: '20095',
      town: 'Hamburg',
      rate: 7,
      items: [{ description: 'Catering', amount: '0' }],
    })

    expect(result.success).toBe(false)
  })

  it('accepts supported currency formats and rejects malformed or oversized amounts', () => {
    expect(parseEuroAmount('')).toBeNull()
    expect(parseEuroAmount('  12 € ')).toBe(1200)
    expect(parseEuroAmount('1.234')).toBe(123400)
    expect(parseEuroAmount('1.234,5')).toBe(123450)
    expect(parseEuroAmount('12.50')).toBe(1250)
    expect(parseEuroAmount('1,234')).toBeNull()
    expect(parseEuroAmount('1.234.56')).toBeNull()
    expect(parseEuroAmount('10000000,00')).toBeNull()
  })

  it('requires a real calendar date, a recipient, and complete nonempty positions', () => {
    const baseInvoice = {
      number: '2026-001',
      date: '2026-04-01',
      subject: '',
      company: 'Muster GmbH',
      name: '',
      street: 'Musterstraße 1',
      postalCode: '20095',
      town: 'Hamburg',
      rate: 7,
      items: [{ description: 'Catering', amount: '107,00' }],
    }

    expect(
      invoiceFormSchema.safeParse({ ...baseInvoice, date: '2026-02-29' })
        .success,
    ).toBe(false)
    expect(
      invoiceFormSchema.safeParse({ ...baseInvoice, date: '01.04.2026' })
        .success,
    ).toBe(false)
    expect(
      invoiceFormSchema.safeParse({ ...baseInvoice, company: '', name: '' })
        .success,
    ).toBe(false)
    expect(
      invoiceFormSchema.safeParse({ ...baseInvoice, items: [] }).success,
    ).toBe(false)
    expect(
      invoiceFormSchema.safeParse({
        ...baseInvoice,
        items: [{ description: '', amount: '107,00' }],
      }).success,
    ).toBe(false)
    expect(
      invoiceFormSchema.safeParse({
        ...baseInvoice,
        items: [{ description: 'Catering', amount: 'abc' }],
      }).success,
    ).toBe(false)
    expect(
      invoiceFormSchema.safeParse({
        ...baseInvoice,
        items: Array.from({ length: 17 }, () => ({
          description: 'Position',
          amount: '1',
        })),
      }).success,
    ).toBe(false)
  })
})
