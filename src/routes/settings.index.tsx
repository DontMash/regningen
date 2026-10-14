import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '@/lib/page-head'
import { settingsVisibility } from '@/features/settings/visibility'
import GeneralSettingsPage from '@/features/settings/GeneralSettingsPage'

export const Route = createFileRoute('/settings/')({
  component: GeneralSettingsPage,
  head: ({ matches }) => pageHead(settingsVisibility, matches),
})
