import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import type { DeploymentPolicy } from './lib/visibility'
import { requireDeploymentPolicy } from './lib/deployment-policy'
import { routeTree } from './routeTree.gen'
import { deLocalizeUrl, localizeUrl } from './paraglide/runtime'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    trailingSlash: 'never',
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
    ssr: { nonce: getGlobalStartContext()?.securityNonce },
    context: {
      ...context,
      // Server requests already have middleware policy. The client must wait
      // for hydrate below before evaluating routes; browser location is not policy.
      visibilityPolicy: getGlobalStartContext()?.visibilityPolicy,
    },
    dehydrate: (): { visibilityPolicy: DeploymentPolicy } => ({
      visibilityPolicy: requireDeploymentPolicy(router.options.context),
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
