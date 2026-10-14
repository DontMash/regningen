import type { AnyRouteMatch } from '@tanstack/react-router'
import type { DeploymentPolicy, PageVisibility } from './visibility'
import { pageVisibility } from './page-visibility'

export function pageHead(
  page: PageVisibility,
  matches: ReadonlyArray<AnyRouteMatch>,
) {
  const policy = matches[0].context.visibilityPolicy as DeploymentPolicy
  // Installed Router uses _notFound even when the root status remains success.
  const successful = matches.every(
    (match) => match.status === 'success' && !match._notFound,
  )
  return pageVisibility(policy).head(successful ? page.canonicalPath : null)
}
