import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { BusinessProfileDraft } from './business-profile'
import type { InvoiceDraft } from './invoice'
import { createInvoicePdf } from './pdf'

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

  it('fits the supported maximum of 16 concise items on one page', async () => {
    const invoiceWithSixteenItems = {
      ...invoice,
      items: Array.from({ length: 16 }, (_, index) => ({
        description: `Position ${index + 1}`,
        amount: '10,00',
      })),
    }

    const bytes = await createInvoicePdf(profile, invoiceWithSixteenItems)
    const pdf = await PDFDocument.load(bytes)

    expect(pdf.getPageCount()).toBe(1)
  })

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

  it('rejects line items without a positive gross price', async () => {
    await expect(
      createInvoicePdf(profile, {
        ...invoice,
        items: [{ description: 'Catering', amount: '0' }],
      }),
    ).rejects.toThrow('alle Positionsbeschreibungen und Bruttopreise')
  })
})
