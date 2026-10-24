import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  HeadContent,
} from '@tanstack/react-router'
import { JSDOM } from 'jsdom'
import { createVisibility, resolveDeployment } from './visibility'
import type { PageVisibility } from './visibility'
import { pageHead } from './page-head'
import { pageVisibility, localizedCanonicalPath } from './page-visibility'
import { landingVisibility } from '@/features/landing/visibility'

const production = resolveDeployment(
  'https://regningen.soren.codes',
  'https://regningen.soren.codes',
)

describe('website visibility', () => {
  it('rejects a missing deployment context instead of inventing a visibility policy', async () => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
      isServer: true,
    })
    await router.load()

    expect(() => pageHead(landingVisibility, router.state.matches)).toThrow(
      'Deployment visibility policy is unavailable',
    )
  })

  it('preserves a feature-owned social image override in both localized introductions', () => {
    const previous = landingVisibility.socialImage
    landingVisibility.socialImage = {
      path: '/custom-introduction.png',
      alt: 'A feature-owned image',
      width: 1200,
      height: 630,
      type: 'image/png',
    }
    try {
      const visible = pageVisibility(production)
      for (const path of ['/de', '/en']) {
        const page = visible.head(path)
        expect(page.meta).toContainEqual({
          property: 'og:image',
          content: 'https://regningen.soren.codes/custom-introduction.png',
        })
        expect(page.meta).toContainEqual({
          property: 'og:image:alt',
          content: 'A feature-owned image',
        })
      }
    } finally {
      if (previous) landingVisibility.socialImage = previous
      else delete landingVisibility.socialImage
    }
  })

  it('publishes both real localized introductions without exposing working pages', () => {
    const visible = pageVisibility(production)
    const english = visible.head('/en')
    expect(english.meta).toContainEqual({
      title: 'regningen – Create invoices and download PDFs',
    })
    expect(english.meta).toContainEqual({
      property: 'og:locale',
      content: 'en_GB',
    })
    expect(english.meta).toContainEqual({
      property: 'og:image:alt',
      content: 'regningen – Create invoices and download PDFs.',
    })
    expect(english.meta).toContainEqual({
      property: 'og:image',
      content: 'https://regningen.soren.codes/social-preview-en.png',
    })
    expect(english.links).toEqual([
      { rel: 'canonical', href: 'https://regningen.soren.codes/en' },
      {
        rel: 'alternate',
        hrefLang: 'de',
        href: 'https://regningen.soren.codes/de',
      },
      {
        rel: 'alternate',
        hrefLang: 'en',
        href: 'https://regningen.soren.codes/en',
      },
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: 'https://regningen.soren.codes/de',
      },
    ])
    expect(visible.head('/de').meta).toContainEqual({
      title: 'regningen – Rechnungen erstellen und als PDF herunterladen',
    })
    expect(visible.sitemap()).toContain(
      '<loc>https://regningen.soren.codes/de</loc>',
    )
    expect(visible.sitemap()).toContain(
      '<loc>https://regningen.soren.codes/en</loc>',
    )
    expect(visible.sitemap()).not.toMatch(
      /rechnung|invoice|settings|einstellungen/,
    )
    expect(visible.guide()).toContain(
      '[Home](https://regningen.soren.codes/en)',
    )
    for (const path of [
      '/de/rechnung',
      '/en/invoice',
      '/de/einstellungen',
      '/en/settings',
      '/de/einstellungen/profil',
      '/en/settings/profile',
    ]) {
      const page = visible.head(path)
      expect(page.meta).toContainEqual({
        name: 'robots',
        content: 'noindex, follow',
      })
      expect(
        page.links.filter((link) => link.rel === 'alternate'),
      ).toHaveLength(0)
    }
    expect(localizedCanonicalPath('/missing', 'en')).toBe('/en/missing')
  })

  it.each([
    [
      'https://REGNINGEN.soren.codes:443/',
      'https://regningen.soren.codes/path?utm_source=test',
      true,
    ],
    ['https://regningen.soren.codes', 'http://regningen.soren.codes', false],
    [
      'https://regningen.soren.codes',
      'https://regningen.soren.codes:444',
      false,
    ],
    ['https://regningen.soren.codes', 'https://preview.example', false],
    ['https://regningen.soren.codes', undefined, false],
    [undefined, 'https://regningen.soren.codes', false],
    ['https://user:password@example.com', 'https://example.com', false],
    ['https://example.com/subpath', 'https://example.com', false],
    ['https://example.com/?query', 'https://example.com', false],
    ['https://example.com/#fragment', 'https://example.com', false],
    ['https://example.com/?', 'https://example.com', false],
    ['https://example.com/#', 'https://example.com', false],
    ['https://example.com/extra/..', 'https://example.com', false],
    ['example.com', 'https://example.com', false],
    ['file:///tmp/page', 'file:///tmp/page', false],
    ['not a URL', 'not a URL', false],
  ])(
    'compares normalized origins and fails closed (%s, %s)',
    (origin, request, publish) => {
      expect(resolveDeployment(origin, request).publish).toBe(publish)
    },
  )

  it('resolves static social metadata, overrides, reciprocal translations and a truthful fallback', () => {
    const pages: Array<PageVisibility> = [
      {
        canonicalPath: '/',
        title: 'Rechnungen erstellen',
        translationGroup: 'home',
        fallback: true,
        structuredData: { features: ['PDF herunterladen'] },
      },
      {
        canonicalPath: '/en',
        title: 'Create invoices',
        language: 'en',
        socialLocale: 'en_GB',
        translationGroup: 'home',
        socialImage: {
          path: '/english.png',
          alt: 'English example',
          width: 1200,
          height: 630,
          type: 'image/png',
        },
      },
      { canonicalPath: '/unrelated', translationGroup: 'other' },
    ]
    const visible = createVisibility(production, pages)
    const german = visible.head('/')
    expect(german.meta).toContainEqual({
      property: 'og:image',
      content: 'https://regningen.soren.codes/social-preview.png',
    })
    expect(german.meta).toContainEqual({
      name: 'twitter:card',
      content: 'summary_large_image',
    })
    expect(
      german.meta.some(
        (entry) => 'name' in entry && entry.name === 'twitter:site',
      ),
    ).toBe(false)
    expect(german.links).toEqual([
      { rel: 'canonical', href: 'https://regningen.soren.codes/' },
      {
        rel: 'alternate',
        hrefLang: 'de',
        href: 'https://regningen.soren.codes/',
      },
      {
        rel: 'alternate',
        hrefLang: 'en',
        href: 'https://regningen.soren.codes/en',
      },
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: 'https://regningen.soren.codes/',
      },
    ])
    expect(visible.head('/en').links.slice(1)).toEqual(german.links.slice(1))
    expect(visible.head('/en').links[0]).toEqual({
      rel: 'canonical',
      href: 'https://regningen.soren.codes/en',
    })
    expect(visible.head('/en').meta).toContainEqual({
      property: 'og:locale',
      content: 'en_GB',
    })
    expect(visible.head('/en').meta).toContainEqual({
      property: 'og:image:alt',
      content: 'English example',
    })

    pages[0] = { ...pages[0], noIndex: true }
    const excluded = createVisibility(production, pages)
    expect(
      excluded.head('/').meta.some((entry) => 'script:ld+json' in entry),
    ).toBe(false)
    expect(excluded.head('/').links).toHaveLength(1)
    expect(excluded.head('/en').links).toEqual([
      { rel: 'canonical', href: 'https://regningen.soren.codes/en' },
      {
        rel: 'alternate',
        hrefLang: 'en',
        href: 'https://regningen.soren.codes/en',
      },
    ])
    expect(excluded.sitemap()).not.toContain(
      '<loc>https://regningen.soren.codes/</loc>',
    )
    expect(excluded.guide()).not.toContain('](https://regningen.soren.codes/)')
    const foreign = createVisibility(
      resolveDeployment(
        'https://regningen.soren.codes',
        'https://preview.example',
      ),
      pages,
    )
    expect(foreign.head('/en').meta).toContainEqual({
      name: 'robots',
      content: 'noindex, follow',
    })
    expect(foreign.head('/en').links).toHaveLength(1)
    expect(
      foreign.head('/').meta.some((entry) => 'script:ld+json' in entry),
    ).toBe(false)
    expect(foreign.sitemap()).toBeNull()
    expect(foreign.guide()).toBeNull()
    expect(foreign.robots()).toBe('User-agent: *\nAllow: /\n')
  })

  it('keeps error pages and missing configuration unadvertised, and encodes structured data as data', async () => {
    const dangerous = '</script><script>alert("test")</script>&\u2028\u2029'
    const site = createVisibility(production, [
      {
        canonicalPath: '/',
        title: dangerous,
        description: dangerous,
        structuredData: { features: [dangerous] },
      },
    ])
    const head = site.head('/')
    const router = createRouter({
      routeTree: createRootRoute({ head: () => head, component: HeadContent }),
      history: createMemoryHistory(),
      isServer: true,
    })
    await router.load()
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }))
    const document = new JSDOM(html).window.document
    expect(document.querySelectorAll('script')).toHaveLength(1)
    const script = document.querySelector('script')!
    expect(script.textContent).not.toContain('<')
    expect(JSON.parse(script.textContent)['@graph'][1].name).toBe(dangerous)
    expect(site.head(null).links).toEqual([])
    expect(
      site.head('/missing').meta.some((entry) => 'script:ld+json' in entry),
    ).toBe(false)
    expect(site.head('/missing').meta).toContainEqual({
      name: 'robots',
      content: 'noindex, follow',
    })
    const invalid = createVisibility(resolveDeployment(undefined, undefined), [
      { canonicalPath: '/' },
    ])
    expect(invalid.head('/').links).toEqual([])
    expect(
      invalid
        .head('/')
        .meta.some(
          (entry) => 'property' in entry && entry.property === 'og:image',
        ),
    ).toBe(false)
    expect(invalid.sitemap()).toBeNull()
    expect(invalid.guide()).toBeNull()
    expect(site.robots()).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://regningen.soren.codes/sitemap.xml\n',
    )
    expect(site.guide()).toContain(
      'Offline use requires initial online preparation.',
    )
  })

  it('does not advertise excluded pages through another page’s graph', () => {
    const site = createVisibility(production, [
      { canonicalPath: '/', noIndex: true },
      {
        canonicalPath: '/en',
        language: 'en',
        structuredData: { features: ['PDF'] },
      },
    ])
    const schema = site
      .head('/en')
      .meta.find((entry) => 'script:ld+json' in entry)!
    if (!('script:ld+json' in schema)) throw new Error('Missing graph')
    const graph = schema['script:ld+json']['@graph']
    expect(graph.map((entity) => entity.url)).toEqual([
      'https://regningen.soren.codes/en',
      'https://regningen.soren.codes/en',
      'https://regningen.soren.codes/en',
    ])
  })

  it('escapes canonical locations in XML without inventing dates', () => {
    const sitemap = createVisibility(production, [
      { canonicalPath: '/notes&receipts' },
    ]).sitemap()
    expect(sitemap).toContain(
      '<loc>https://regningen.soren.codes/notes&amp;receipts</loc>',
    )
    expect(sitemap).not.toMatch(/lastmod|priority|changefreq/)
  })

  it('uses shared defaults and a single canonical identity for a registered public page', () => {
    const visibility = createVisibility(production, [{ canonicalPath: '/' }])
    const head = visibility.head('/')
    expect(head.meta).toContainEqual({ title: 'regningen' })
    expect(head.meta).toContainEqual({
      name: 'robots',
      content: 'index, follow',
    })
    expect(head.links).toContainEqual({
      rel: 'canonical',
      href: 'https://regningen.soren.codes/',
    })
    expect(visibility.sitemap()).toContain(
      '<loc>https://regningen.soren.codes/</loc>',
    )
    expect(visibility.guide()).toContain('https://regningen.soren.codes/')
  })
})
