import { createFileRoute } from '@tanstack/react-router'
import type { BuildIdentity } from '@/lib/build-identity'

// Vite replaces this with a literal in the artifact, never a runtime env lookup.
declare const __BUILD_IDENTITY__: BuildIdentity

export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: () =>
        Response.json(__BUILD_IDENTITY__, {
          headers: { 'Cache-Control': 'no-store' },
        }),
    },
  },
})
