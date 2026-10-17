import { z } from '@/lib/validation'
import { getLocale } from '@/paraglide/runtime'
import type { Locale } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'

export type VatRate = 7 | 19

export type InvoiceLineDraft = {
  description: string
  amount: string
  amountLocale?: Locale
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
  description: z
    .string()
    .max(85, { error: () => m.invoice_maximum_characters({ limit: 85 }) }),
  amount: z.string(),
  amountLocale: z.enum(['de', 'en']).optional(),
})

export const invoiceFormSchema = z
  .object({
    number: z
      .string()
      .trim()
      .min(1, { error: () => m.invoice_number_required() })
      .max(40, { error: () => m.invoice_maximum_characters({ limit: 40 }) }),
    date: z
      .string()
      .refine(isCalendarDate, { error: () => m.invoice_date_invalid() }),
    subject: z
      .string()
      .max(100, { error: () => m.invoice_maximum_characters({ limit: 100 }) }),
    company: z
      .string()
      .trim()
      .max(70, { error: () => m.invoice_maximum_characters({ limit: 70 }) }),
    name: z
      .string()
      .trim()
      .max(70, { error: () => m.invoice_maximum_characters({ limit: 70 }) }),
    street: z
      .string()
      .trim()
      .min(1, { error: () => m.invoice_street_required() })
      .max(85, { error: () => m.invoice_maximum_characters({ limit: 85 }) }),
    postalCode: z
      .string()
      .trim()
      .min(1, { error: () => m.invoice_postal_code_required() })
      .max(85, { error: () => m.invoice_maximum_characters({ limit: 85 }) }),
    town: z
      .string()
      .trim()
      .min(1, { error: () => m.invoice_town_required() })
      .max(85, { error: () => m.invoice_maximum_characters({ limit: 85 }) }),
    rate: z.union([z.literal(7), z.literal(19)]),
    items: z
      .array(lineItemSchema)
      .min(1, { error: () => m.invoice_position_required() })
      .max(16, { error: () => m.invoice_position_limit() }),
  })
  .superRefine((invoice, context) => {
    if (!invoice.company && !invoice.name) {
      context.addIssue({
        code: 'custom',
        path: ['company'],
        message: m.invoice_recipient_required(),
      })
    }

    const filledItems = invoice.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.description.trim() || item.amount.trim())

    if (!filledItems.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: m.invoice_position_required(),
      })
    }

    for (const { item, index } of filledItems) {
      if (!item.description.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'description'],
          message: m.invoice_description_required(),
        })
      }

      const amount = parseEuroAmount(item.amount, item.amountLocale ?? 'de')
      if (amount === null || amount <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'amount'],
          message: m.invoice_amount_invalid(),
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

export function parseEuroAmount(
  input: string,
  locale: Locale = getLocale(),
): number | null {
  const raw = input.trim().replace(/[\s€]/g, '')
  if (!raw) return null

  let normalized: string
  if (locale === 'en') {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) {
      return null
    }
    normalized = raw.replaceAll(',', '')
  } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) {
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
