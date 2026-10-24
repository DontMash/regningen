import InvoicePage from './InvoicePage'
import { createInvoiceGeneration } from './generation-domain'
import { businessValidation } from './validation-composition'
import { invoicePdfCapability } from './pdf'
import { downloadInvoicePdf } from './pdf-download'

const generation = createInvoiceGeneration(
  businessValidation,
  invoicePdfCapability,
)

export default function InvoicePageComposition() {
  return (
    <InvoicePage generation={generation} downloadPdf={downloadInvoicePdf} />
  )
}
