import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { InvoicePdfFailure } from './generation-contract'
import type { InvoiceDocument } from './generation-contract'
import { invoicePdfCapability } from './pdf'

// Capability fixtures deliberately exercise PDF format limits, not domain validity.
// Business validation is proved through generation-domain.test.ts.
function document(): InvoiceDocument {
  return {
    profile: {
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
    },
    invoice: {
      draft: {
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
      },
      positions: [{ description: 'Catering', grossAmount: 10700 }],
    },
    totals: { net: 10000, tax: 700, gross: 10700 },
    language: 'de',
  }
}

describe('browser-local PDF capability', () => {
  it.each(['de', 'en'] as const)(
    'creates one A4 page with %s metadata',
    async (language) => {
      const input = { ...document(), language }
      const pdf = await PDFDocument.load(
        await invoicePdfCapability.render(input),
      )
      expect(pdf.getPageCount()).toBe(1)
      expect(pdf.getTitle()).toBe(
        language === 'de' ? 'Rechnung 2026-001' : 'Invoice 2026-001',
      )
      expect(pdf.getAuthor()).toBe('Nordlicht Catering')
      expect(pdf.getPage(0).getSize()).toEqual({
        width: 595.28,
        height: 841.89,
      })
    },
  )

  it.each(['de', 'en'] as const)(
    'fits 16 concise positions in %s',
    async (language) => {
      const input = document()
      input.language = language
      input.invoice.positions = Array.from({ length: 16 }, (_, index) => ({
        description: `Position ${index + 1}`,
        grossAmount: 1000,
      }))
      input.totals = { gross: 16000, net: 14953, tax: 1047 }
      const pdf = await PDFDocument.load(
        await invoicePdfCapability.render(input),
      )
      expect(pdf.getPageCount()).toBe(1)
    },
  )

  it('omits absent optional details', async () => {
    const input = document()
    Object.assign(input.profile, {
      serviceDescription: '',
      phone: '',
      mobile: '',
      vatId: '',
      taxNumber: '12/345/67890',
    })
    Object.assign(input.invoice.draft, { company: '', subject: '' })
    const pdf = await PDFDocument.load(await invoicePdfCapability.render(input))
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getAuthor()).toBe('Nordlicht Catering')
  })

  it.each([
    'business-name',
    'service',
    'addresses',
    'subject',
    'description',
    'positions',
  ] as const)('distinguishes the %s format constraint', async (reason) => {
    const input = document()
    switch (reason) {
      case 'business-name':
        input.profile = { ...input.profile, businessName: 'B'.repeat(300) }
        break
      case 'service':
        input.profile = {
          ...input.profile,
          serviceDescription: 'Leistung '.repeat(30),
        }
        break
      case 'addresses':
        input.profile = {
          ...input.profile,
          street: 'Issuer street '.repeat(80),
        }
        break
      case 'subject':
        input.invoice.draft.subject = 'Betreff '.repeat(80)
        break
      case 'description':
        input.invoice.positions = [
          { description: 'Beschreibung'.repeat(40), grossAmount: 1000 },
        ]
        break
      case 'positions':
        input.invoice.positions = Array.from({ length: 16 }, (_, index) => ({
          description: `${index + 1} ${'langes Wort '.repeat(8)}`,
          grossAmount: 1000,
        }))
        break
    }
    await expect(invoicePdfCapability.render(input)).rejects.toMatchObject({
      reason,
    })
  })

  it('preserves the encoder cause for unsupported characters', async () => {
    const input = document()
    input.profile = { ...input.profile, businessName: 'Business 🧾' }
    try {
      await invoicePdfCapability.render(input)
      throw new Error('Expected a character failure')
    } catch (error) {
      expect(error).toBeInstanceOf(InvoicePdfFailure)
      expect(error).toMatchObject({
        reason: 'characters',
        cause: expect.any(Error),
      })
    }
  })
})
