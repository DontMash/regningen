import { pageVisibility } from './page-visibility'
import type { DeploymentPolicy } from './visibility'

export function discoveryResponse(
  kind: 'robots' | 'sitemap' | 'guide',
  policy: DeploymentPolicy,
) {
  const visibility = pageVisibility(policy)
  const body =
    kind === 'robots'
      ? visibility.robots()
      : kind === 'sitemap'
        ? visibility.sitemap()
        : visibility.guide()
  return new Response(body ?? 'Not found\n', {
    status: body === null ? 404 : 200,
    headers: {
      'Content-Type':
        kind === 'sitemap' && body !== null
          ? 'application/xml; charset=utf-8'
          : 'text/plain; charset=utf-8',
    },
  })
}
