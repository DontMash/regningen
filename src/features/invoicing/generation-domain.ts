import type { BusinessValidation } from './validation-contract'
import type {
  InvoiceGeneration,
  InvoicePdfCapability,
} from './generation-contract'
import { calculateInvoiceTotals } from './validation-domain'

export function createInvoiceGeneration(
  validation: BusinessValidation,
  pdf: InvoicePdfCapability,
): InvoiceGeneration {
  return {
    async generate(profile, invoice, language) {
      const issuer = validation.validateBusinessProfile(profile)
      const document = validation.validateInvoice(invoice)
      if (!issuer.valid || !document.valid)
        return {
          status: 'invalid',
          profileFailures: issuer.valid ? [] : issuer.failures,
          invoiceFailures: document.valid ? [] : document.failures,
        }
      const bytes = await pdf.render({
        profile: issuer.data,
        invoice: document.data,
        totals: calculateInvoiceTotals(
          document.data.positions.map((position) => position.grossAmount),
          document.data.draft.rate,
        ),
        language,
      })
      return {
        status: 'generated',
        bytes,
        number: document.data.draft.number,
        date: document.data.draft.date,
      }
    },
  }
}
