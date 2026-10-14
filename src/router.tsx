import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import type { DeploymentPolicy } from './lib/visibility'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context: {
      ...context,
      visibilityPolicy: {
        canonicalOrigin: null,
        publish: false,
      },
    },
    dehydrate: () => ({
      visibilityPolicy: getGlobalStartContext()?.visibilityPolicy ?? {
        canonicalOrigin: null,
        publish: false,
      },
    }),
    hydrate: (data: { visibilityPolicy: DeploymentPolicy }) => {
      router.update({
        context: {
          ...router.options.context,
          visibilityPolicy: data.visibilityPolicy,
        },
      })
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
