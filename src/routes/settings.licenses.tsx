import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '@/lib/page-head'
import { licensesVisibility } from '@/features/settings/visibility'
import LicensesSettingsPage from '@/features/settings/LicensesSettingsPage'

export const Route = createFileRoute('/settings/licenses')({
  component: LicensesSettingsPage,
  head: ({ matches }) => pageHead(licensesVisibility, matches),
})
