import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '@/lib/page-head'
import { profileVisibility } from '@/features/invoicing/profile-visibility'
import BusinessProfilePage from '@/features/invoicing/BusinessProfilePage'

export const Route = createFileRoute('/settings/profile')({
  component: BusinessProfilePage,
  head: ({ matches }) => pageHead(profileVisibility, matches),
})
