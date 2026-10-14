import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '@/lib/page-head'
import { invoiceVisibility } from '@/features/invoicing/invoice-visibility'
import InvoicePage from '@/features/invoicing/InvoicePage'

export const Route = createFileRoute('/invoice')({
  component: InvoicePage,
  head: ({ matches }) => pageHead(invoiceVisibility, matches),
})
