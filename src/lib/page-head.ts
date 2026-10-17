import type { AnyRouteMatch } from '@tanstack/react-router'
import type { DeploymentPolicy, PageVisibility } from './visibility'
import { pageVisibility, localizedCanonicalPath } from './page-visibility'
import { getLocale } from '@/paraglide/runtime'

export function pageHead(
  page: PageVisibility,
  matches: ReadonlyArray<AnyRouteMatch>,
) {
  const policy = matches[0].context.visibilityPolicy as DeploymentPolicy
  // Installed Router uses _notFound even when the root status remains success.
  const successful = matches.every(
    (match) => match.status === 'success' && !match._notFound,
  )
  const { meta, links } = pageVisibility(policy).head(
    successful ? localizedCanonicalPath(page.canonicalPath, getLocale()) : null,
  )
  // Router's JSON-LD meta helper does not propagate the SSR nonce to scripts.
  // Native head scripts do, including on client navigation. Keep script-boundary
  // encoding without interpolating raw JSON into HTML.
  return {
    meta: meta.filter((entry) => !('script:ld+json' in entry)),
    links,
    scripts: meta.flatMap((entry) =>
      'script:ld+json' in entry
        ? [
            {
              type: 'application/ld+json',
              children: JSON.stringify(entry['script:ld+json']).replace(
                /</g,
                '\\u003c',
              ),
            },
          ]
        : [],
    ),
  }
}
