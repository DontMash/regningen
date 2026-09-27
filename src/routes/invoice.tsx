import { createFileRoute } from '@tanstack/react-router'
import InvoicePage from '@/features/invoicing/InvoicePage'

export const Route = createFileRoute('/invoice')({
  component: InvoicePage,
})
