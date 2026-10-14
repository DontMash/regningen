import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '@/lib/page-head'
import { landingVisibility } from '@/features/landing/visibility'
import HomePage from '@/features/landing/HomePage'

export const Route = createFileRoute('/')({
  component: HomePage,
  head: ({ matches }) => pageHead(landingVisibility, matches),
})
