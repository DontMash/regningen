export type DeploymentPolicy = {
  canonicalOrigin: string | null
  publish: boolean
}

type SocialImage = {
  path: string
  alt: string
  type: string
  width: number
  height: number
}

/** Declarations describe real pages, never aliases, assets or error responses. */
export type PageVisibility = {
  canonicalPath: string
  title?: string
  description?: string
  noIndex?: boolean
  language?: string
  socialLocale?: string
  translationGroup?: string
  fallback?: boolean
  socialImage?: SocialImage
  structuredData?: { features: ReadonlyArray<string> }
  agentTitle?: string
  agentSummary?: string
}

const defaults = {
  brand: 'regningen',
  title: 'regningen',
  description:
    'Rechnungen erstellen und als PDF herunterladen. Direkt im Browser.',
  noIndex: false,
  language: 'de',
  socialLocale: 'de_DE',
  socialImage: {
    path: '/social-preview.png',
    alt: 'regningen – Rechnungen erstellen und als PDF herunterladen.',
    type: 'image/png',
    width: 1200,
    height: 630,
  },
}

function httpUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? '')
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null
    return url
  } catch {
    return null
  }
}

/** Invalid configuration is represented explicitly and can never publish. */
export function resolveDeployment(
  origin: string | undefined,
  requestOrigin: string | undefined,
): DeploymentPolicy {
  const configured = httpUrl(origin)
  const canonicalOrigin =
    configured &&
    /^https?:\/\/[^\s\\/?#]+\/?$/i.test(origin ?? '') &&
    configured.pathname === '/' &&
    !configured.search &&
    !configured.hash
      ? configured.origin
      : null
  return {
    canonicalOrigin,
    publish:
      canonicalOrigin !== null &&
      canonicalOrigin === httpUrl(requestOrigin)?.origin,
  }
}

function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  )
}

/** One policy drives head output and all discovery; no independent publication switches. */
export function createVisibility(
  policy: DeploymentPolicy,
  declarations: ReadonlyArray<PageVisibility>,
) {
  const pages = declarations.map((page) => ({ ...defaults, ...page }))
  const eligible = pages.filter((page) => policy.publish && !page.noIndex)
  const url = (page: PageVisibility) =>
    `${policy.canonicalOrigin}${page.canonicalPath}`
  return {
    head(path: string | null) {
      const page = pages.find((entry) => entry.canonicalPath === path)
      const indexable = page !== undefined && eligible.includes(page)
      const { title, description, socialImage, socialLocale } = page ?? {
        ...defaults,
        title: 'Seite nicht verfügbar – regningen',
      }
      const canonical = page && policy.canonicalOrigin ? url(page) : null
      const image = policy.canonicalOrigin
        ? new URL(socialImage.path, policy.canonicalOrigin).href
        : null
      const meta = [
        { title },
        { name: 'description', content: description },
        {
          name: 'robots',
          content: indexable ? 'index, follow' : 'noindex, follow',
        },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: defaults.brand },
        { property: 'og:locale', content: socialLocale },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        ...(canonical ? [{ property: 'og:url', content: canonical }] : []),
        ...(image
          ? [
              { property: 'og:image', content: image },
              { property: 'og:image:type', content: socialImage.type },
              {
                property: 'og:image:width',
                content: String(socialImage.width),
              },
              {
                property: 'og:image:height',
                content: String(socialImage.height),
              },
              { property: 'og:image:alt', content: socialImage.alt },
              { name: 'twitter:image', content: image },
              { name: 'twitter:image:alt', content: socialImage.alt },
            ]
          : []),
      ]
      const links: Array<{ rel: string; href: string; hrefLang?: string }> =
        canonical ? [{ rel: 'canonical', href: canonical }] : []
      if (indexable && page.translationGroup) {
        const equivalents = eligible.filter(
          (variant) => variant.translationGroup === page.translationGroup,
        )
        links.push(
          ...equivalents.map((variant) => ({
            rel: 'alternate',
            hrefLang: variant.language,
            href: url(variant),
          })),
        )
        const fallback = equivalents.find((variant) => variant.fallback)
        if (fallback)
          links.push({
            rel: 'alternate',
            hrefLang: 'x-default',
            href: url(fallback),
          })
      }
      const graphs = []
      if (indexable && page.structuredData) {
        const website = `${policy.canonicalOrigin}/#website`
        const application = `${canonical}#application`
        const graph = {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              '@id': website,
              name: defaults.brand,
              url: eligible.some((entry) => entry.canonicalPath === '/')
                ? `${policy.canonicalOrigin}/`
                : canonical,
              inLanguage: page.language,
            },
            {
              '@type': 'WebPage',
              '@id': `${canonical}#webpage`,
              name: title,
              description,
              url: canonical,
              inLanguage: page.language,
              isPartOf: { '@id': website },
              about: { '@id': application },
            },
            {
              '@type': 'WebApplication',
              '@id': application,
              name: defaults.brand,
              url: canonical,
              description,
              inLanguage: page.language,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              featureList: page.structuredData.features,
            },
          ],
        }
        graphs.push({ 'script:ld+json': graph })
      }
      // TanStack's JSON-LD descriptor performs script-boundary-safe encoding.
      return { meta: [...meta, ...graphs], links }
    },
    robots() {
      return `User-agent: *\nAllow: /\n${policy.publish ? `Sitemap: ${policy.canonicalOrigin}/sitemap.xml\n` : ''}`
    },
    sitemap() {
      if (!policy.publish) return null
      return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${eligible.map((page) => `<url><loc>${xml(url(page))}</loc></url>`).join('')}</urlset>`
    },
    guide() {
      if (!policy.publish) return null
      return `# regningen\n\n> A German-language browser-based tool for creating invoices and downloading PDFs.\n\nInvoice content is processed in the browser. Offline use requires initial online preparation.\n\n## Website\n\n${eligible.map((page) => `- [${page.agentTitle ?? page.title}](${url(page)}): ${page.agentSummary ?? page.description}`).join('\n')}\n`
    },
  }
}
