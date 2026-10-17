import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'

import type { BusinessProfileDraft } from './business-profile'
import type { InvoiceDraft } from './invoice'
import { createInvoicePdf } from './pdf'

const defaultGetLocale = getLocale
afterEach(() => overwriteGetLocale(defaultGetLocale))

const profile: BusinessProfileDraft = {
  businessName: 'Nordlicht Catering',
  serviceDescription: 'Party-Service',
  ownerName: 'Erika Beispiel',
  street: 'Hauptstraße 12',
  postalCode: '20095',
  town: 'Hamburg',
  phone: '040 123456',
  mobile: '',
  iban: 'DE89370400440532013000',
  vatId: 'DE123456789',
  taxNumber: '',
}

const invoice: InvoiceDraft = {
  number: '2026-001',
  date: '2026-04-01',
  subject: 'Speisen',
  company: 'Muster GmbH',
  name: 'Max Mustermann',
  street: 'Musterstraße 1',
  postalCode: '20095',
  town: 'Hamburg',
  rate: 7,
  items: [{ description: 'Catering', amount: '107,00' }],
}

describe('invoice PDF generation', () => {
  it('creates a one-page invoice PDF in memory', async () => {
    const bytes = await createInvoicePdf(profile, invoice)
    const pdf = await PDFDocument.load(bytes)

    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe('Rechnung 2026-001')
    expect(pdf.getAuthor()).toBe('Nordlicht Catering')
  })

  it('uses the explicit Invoice Language for metadata independently of the interface and entry locale', async () => {
    const bytes = await createInvoicePdf(
      profile,
      {
        ...invoice,
        items: [
          {
            description: 'Unchanged user content',
            amount: '1.234,56',
            amountLocale: 'de',
          },
        ],
      },
      'en',
    )
    const pdf = await PDFDocument.load(bytes)

    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe('Invoice 2026-001')
    expect(pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 })
    const loading = getDocument({ data: bytes })
    try {
      const document = await loading.promise
      const page = await document.getPage(1)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      for (const expected of [
        'Invoice number 2026-001',
        'Date: 01/04/2026',
        'Goods & services',
        'Unchanged user content',
        '€1,234.56',
        'Net:',
        '7% VAT:',
        'Gross:',
        'Nordlicht Catering',
      ]) {
        expect(text).toContain(expected)
      }
      expect(text).not.toContain('Rechnungsnummer')
    } finally {
      await loading.destroy()
    }
  })

  it.each(['de', 'en'] as const)(
    'fits the supported maximum of 16 concise items on one page in %s',
    async (locale) => {
      const invoiceWithSixteenItems = {
        ...invoice,
        items: Array.from({ length: 16 }, (_, index) => ({
          description: `Position ${index + 1}`,
          amount: '10,00',
        })),
      }

      const bytes = await createInvoicePdf(
        profile,
        invoiceWithSixteenItems,
        locale,
      )
      const pdf = await PDFDocument.load(bytes)

      expect(pdf.getPageCount()).toBe(1)
    },
  )

  it('refuses content that cannot fit on a single page', async () => {
    const crowdedInvoice = {
      ...invoice,
      items: Array.from({ length: 16 }, (_, index) => ({
        description: `${index + 1} ${'langes Wort '.repeat(8)}`,
        amount: '10,00',
      })),
    }

    await expect(createInvoicePdf(profile, crowdedInvoice)).rejects.toThrow(
      'Bitte Beschreibungen kürzen',
    )
  })

  it('omits absent optional profile and invoice details', async () => {
    const bytes = await createInvoicePdf(
      {
        ...profile,
        serviceDescription: '',
        phone: '',
        mobile: '',
        vatId: '',
        taxNumber: '12/345/67890',
      },
      { ...invoice, company: '', name: 'Max Mustermann', subject: '' },
    )
    const pdf = await PDFDocument.load(bytes)

    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getAuthor()).toBe(profile.businessName)
  })

  it('reports oversized business names, service descriptions, addresses, subjects, and positions', async () => {
    await expect(
      createInvoicePdf({ ...profile, businessName: 'B'.repeat(300) }, invoice),
    ).rejects.toThrow('Unternehmensname ist zu lang')

    await expect(
      createInvoicePdf(
        { ...profile, serviceDescription: 'Leistung '.repeat(30) },
        invoice,
      ),
    ).rejects.toThrow('Leistungsbeschreibung ist zu lang')

    await expect(
      createInvoicePdf(
        { ...profile, street: 'Issuer street '.repeat(80) },
        { ...invoice, street: 'Recipient street '.repeat(80) },
      ),
    ).rejects.toThrow('Anschriften sind zu umfangreich')

    await expect(
      createInvoicePdf(profile, { ...invoice, subject: 'Betreff '.repeat(80) }),
    ).rejects.toThrow('Betreff ist zu lang')

    await expect(
      createInvoicePdf(profile, {
        ...invoice,
        items: [{ description: 'Beschreibung'.repeat(40), amount: '10,00' }],
      }),
    ).rejects.toThrow('Positionsbeschreibung ist zu lang')
  })

  it('reports PDF constraints in the interface language rather than the Invoice Language', async () => {
    overwriteGetLocale(() => 'en')
    await expect(
      createInvoicePdf(
        { ...profile, businessName: 'B'.repeat(300) },
        invoice,
        'de',
      ),
    ).rejects.toThrow('The business name is too long for the PDF.')
  })

  it('reports unsupported characters with an actionable interface-language error', async () => {
    await expect(
      createInvoicePdf(
        { ...profile, businessName: 'Business 🧾' },
        invoice,
        'en',
      ),
    ).rejects.toThrow('Bitte Sonderzeichen in den Angaben prüfen.')
  })

  it('rejects line items without a positive gross price', async () => {
    await expect(
      createInvoicePdf(profile, {
        ...invoice,
        items: [{ description: 'Catering', amount: '0' }],
      }),
    ).rejects.toThrow('alle Positionsbeschreibungen und Bruttopreise')
  })
})
