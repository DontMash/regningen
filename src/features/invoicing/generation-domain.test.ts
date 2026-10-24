import { describe, expect, it, vi } from 'vitest'
import { createBusinessValidation } from './validation-domain'
import { createInvoiceGeneration } from './generation-domain'
import { invoicePdfCapability } from './pdf'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { InvoicePdfFailure } from './generation-contract'
import type {
  BusinessProfileDraft,
  InvoiceValidationInput,
} from './validation-contract'

const profile: BusinessProfileDraft = {
  businessName: ' Nordlicht Catering ',
  serviceDescription: 'Party-Service',
  ownerName: 'Erika Beispiel',
  street: 'Hauptstraße 12',
  postalCode: '20095',
  town: 'Hamburg',
  phone: '040 123456',
  mobile: '',
  iban: 'de89 3704 0044 0532 0130 00',
  vatId: 'DE123456789',
  taxNumber: '',
}
const invoice: InvoiceValidationInput = {
  number: ' 2026-001 ',
  date: '2026-06-15',
  subject: 'Speisen',
  company: '',
  name: 'Max Mustermann',
  street: 'Musterstraße 1',
  postalCode: '20095',
  town: 'Hamburg',
  rate: 7,
  items: [{ description: 'Catering', amount: '107,00' }],
}
const validation = createBusinessValidation({
  isValid: (iban) => iban === 'DE89370400440532013000',
})

describe('authoritative Invoice generation', () => {
  it.each([
    { items: [{ description: '', amount: '10' }] },
    { items: [{ description: 'Catering', amount: '0' }] },
    { items: [{ description: 'Catering', amount: '-1' }] },
    {
      items: [
        {
          description: 'Catering',
          amount: '1,234.56',
          amountLocale: 'de' as const,
        },
      ],
    },
    { items: [{ description: 'x'.repeat(86), amount: '10' }] },
    {
      items: Array.from({ length: 17 }, () => ({
        description: 'Catering',
        amount: '10',
      })),
    },
    { name: '', company: '' },
    { street: '' },
    { postalCode: '' },
    { town: '' },
    { number: '' },
    { number: 'x'.repeat(41) },
    { subject: 'x'.repeat(101) },
    { date: '2026-02-29' },
    { date: '2026-04-31' },
    { date: '' },
    { rate: 20 },
  ])(
    'rejects invalid Invoice inputs without producing document bytes: %j',
    async (changes) => {
      const render = vi.fn(async () => new Uint8Array([1]))
      const generation = createInvoiceGeneration(validation, { render })
      const result = await generation.generate(
        profile,
        { ...invoice, ...changes },
        'en',
      )
      expect(result.status).toBe('invalid')
      expect(result).not.toHaveProperty('bytes')
      expect(render).not.toHaveBeenCalled()
    },
  )

  it.each([
    'businessName',
    'ownerName',
    'street',
    'postalCode',
    'town',
    'iban',
  ] as const)('rejects missing issuer %s before rendering', async (field) => {
    const render = vi.fn(async () => new Uint8Array([1]))
    const result = await createInvoiceGeneration(validation, {
      render,
    }).generate({ ...profile, [field]: '' }, invoice, 'de')
    expect(result.status).toBe('invalid')
    expect(render).not.toHaveBeenCalled()
  })

  it.each([
    { businessName: 'x'.repeat(71) },
    { serviceDescription: 'x'.repeat(71) },
    { ownerName: 'x'.repeat(71) },
    { street: 'x'.repeat(86) },
    { postalCode: 'x'.repeat(21) },
    { town: 'x'.repeat(51) },
    { phone: 'x'.repeat(41) },
    { mobile: 'x'.repeat(41) },
    { taxNumber: 'x'.repeat(31) },
    { vatId: '', taxNumber: '' },
    { vatId: 'invalid' },
  ])('rejects unsupported issuer inputs: %j', async (changes) => {
    const render = vi.fn(async () => new Uint8Array([1]))
    const result = await createInvoiceGeneration(validation, {
      render,
    }).generate({ ...profile, ...changes }, invoice, 'de')
    expect(result.status).toBe('invalid')
    expect(render).not.toHaveBeenCalled()
  })

  it.each([
    new InvoicePdfFailure('unavailable', {
      cause: new Error('capability disabled'),
    }),
    new InvoicePdfFailure('characters', {
      cause: new Error('encoder limitation'),
    }),
    new TypeError('programming defect'),
  ])(
    'preserves capability failures and defects rather than producing a successful fallback: %s',
    async (failure) => {
      const generation = createInvoiceGeneration(validation, {
        render: async () => {
          throw failure
        },
      })
      await expect(generation.generate(profile, invoice, 'de')).rejects.toBe(
        failure,
      )
    },
  )

  it('renders normalized issuer and added positions with independently expected totals and English wording', async () => {
    const generation = createInvoiceGeneration(validation, invoicePdfCapability)
    const result = await generation.generate(
      profile,
      {
        ...invoice,
        items: [
          { description: 'Catering', amount: '107,00', amountLocale: 'de' },
          { description: 'Cleaning', amount: '50.00', amountLocale: 'en' },
        ],
      },
      'en',
    )
    expect(result.status).toBe('generated')
    if (result.status !== 'generated')
      throw new Error('Expected generated invoice')
    expect(result.number).toBe('2026-001')
    const loading = getDocument({ data: result.bytes })
    try {
      const pdf = await loading.promise
      const content = await (await pdf.getPage(1)).getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      for (const expected of [
        'Nordlicht Catering',
        'Invoice number 2026-001',
        'Catering',
        'Cleaning',
        '€107.00',
        '€50.00',
        '€146.73',
        '€10.27',
        '€157.00',
        'DE89370400440532013000',
      ])
        expect(text).toContain(expected)
    } finally {
      await loading.destroy()
    }
  })
  it('rejects an Invoice without added positions before document rendering', async () => {
    const render = vi.fn(async () => new Uint8Array([1]))
    const generation = createInvoiceGeneration(validation, { render })
    const result = await generation.generate(
      profile,
      { ...invoice, items: [] },
      'de',
    )
    expect(result).toEqual({
      status: 'invalid',
      profileFailures: [],
      invoiceFailures: [{ path: ['items'], reason: 'position-required' }],
    })
    expect(render).not.toHaveBeenCalled()
  })
})
