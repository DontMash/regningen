import { createFileRoute } from '@tanstack/react-router'
import BusinessProfilePage from '@/features/invoicing/BusinessProfilePage'

export const Route = createFileRoute('/settings/profile')({
  component: BusinessProfilePage,
})
