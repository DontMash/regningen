import { createFileRoute } from '@tanstack/react-router'
import { discoveryResponse } from '@/lib/discovery'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: ({ context }) =>
        discoveryResponse('sitemap', context.visibilityPolicy),
    },
  },
})
