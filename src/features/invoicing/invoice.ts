import { z } from 'zod'

export type VatRate = 7 | 19

export type InvoiceLineDraft = {
  description: string
  amount: string
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

const lineItemSchema = z.object({
  description: z.string().max(85),
  amount: z.string(),
})

export const invoiceFormSchema = z
  .object({
    number: z.string().trim().min(1, 'Rechnungsnummer fehlt.').max(40),
    date: z
      .string()
      .refine(isCalendarDate, 'Bitte ein gültiges Datum eingeben.'),
    subject: z.string().max(100),
    company: z.string().trim().max(70),
    name: z.string().trim().max(70),
    street: z.string().trim().min(1, 'Straße und Hausnummer fehlen.').max(85),
    postalCode: z.string().trim().min(1, 'Postleitzahl fehlt.').max(85),
    town: z.string().trim().min(1, 'Ort fehlt.').max(85),
    rate: z.union([z.literal(7), z.literal(19)]),
    items: z.array(lineItemSchema).min(1).max(16),
  })
  .superRefine((invoice, context) => {
    if (!invoice.company && !invoice.name) {
      context.addIssue({
        code: 'custom',
        path: ['company'],
        message: 'Unternehmen oder Name des Empfängers angeben.',
      })
    }

    const filledItems = invoice.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.description.trim() || item.amount.trim())

    if (!filledItems.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Mindestens eine Position eintragen.',
      })
    }

    for (const { item, index } of filledItems) {
      if (!item.description.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'description'],
          message: 'Positionsbeschreibung fehlt.',
        })
      }

      const amount = parseEuroAmount(item.amount)
      if (amount === null || amount <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'amount'],
          message: 'Einen positiven Bruttopreis eingeben.',
        })
      }
    }
  })

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

export type InvoiceTotals = {
  gross: number
  net: number
  tax: number
}

export function parseEuroAmount(input: string): number | null {
  const raw = input.trim().replace(/[\s€]/g, '')
  if (!raw) return null

  let normalized: string
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) {
    normalized = raw.replaceAll('.', '').replace(',', '.')
  } else if (/^\d+(?:,\d{1,2})?$/.test(raw)) {
    normalized = raw.replace(',', '.')
  } else if (/^\d+\.\d{1,2}$/.test(raw)) {
    normalized = raw
  } else {
    return null
  }

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
