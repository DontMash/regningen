import { z } from '@/lib/validation'
import { getLocale } from '@/paraglide/runtime'
import { businessValidation } from './validation-composition'
import { validationMessage } from './validation-feedback'
import { parseEuroAmount as parseAmount } from './validation-domain'
import type { EntryLanguage } from './validation-contract'

export type {
  InvoiceDraft,
  InvoiceLineDraft,
  InvoiceTotals,
  VatRate,
} from './validation-contract'
export { calculateInvoiceTotals } from './validation-domain'

/** Temporary localized compatibility adapter, not a second set of rules. */
export const invoiceFormSchema = z
  .object({
    number: z.string(),
    date: z.string(),
    subject: z.string(),
    company: z.string(),
    name: z.string(),
    street: z.string(),
    postalCode: z.string(),
    town: z.string(),
    rate: z.number(),
    items: z.array(
      z.object({
        description: z.string(),
        amount: z.string(),
        amountLocale: z.enum(['de', 'en']).optional(),
      }),
    ),
  })
  .transform((input, context) => {
    const result = businessValidation.validateInvoice(input)
    if (result.valid) return result.data.draft
    for (const failure of result.failures)
      context.addIssue({
        code: 'custom',
        path: failure.path,
        message: validationMessage('invoice', failure),
      })
    return z.NEVER
  })

/** Legacy UI default only; domain parsing always requires entry language. */
export function parseEuroAmount(
  input: string,
  locale: EntryLanguage = getLocale(),
): number | null {
  return parseAmount(input, locale)
}
