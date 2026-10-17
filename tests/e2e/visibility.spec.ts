import { expect, test } from '@playwright/test'
import {
  inspectHtml,
  inspectSitemap,
  readHttp,
} from '../support/playwright/http-documents'
import { PwaDeployment } from '../support/playwright/pwa-deployment'
import {
  landingVisibilityExamples as landings,
  applicationVisibilityExamples as applicationPages,
} from '../scenarios/visibility'

const productionOrigin = 'https://regningen.soren.codes'
const productionHeaders = {
  host: 'regningen.soren.codes',
  'x-forwarded-host': 'regningen.soren.codes',
  'x-forwarded-proto': 'https',
}
// One actual Nitro build is reused across runtime policy changes. The HTTP
// client connects to loopback but sends real Host and controlled proxy headers.
test.describe('server-delivered visibility', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 })
  let deployment: PwaDeployment

  test.beforeAll(async () => {
    deployment = await PwaDeployment.create({
      updates: false,
      failedPage: true,
    })
  })

  test.afterAll(async () => {
    await deployment.dispose()
  })

  test('both initial landing documents explain the features with localized metadata and reciprocal alternatives', async () => {
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    // Concurrent, alternating language requests share a server, not locale state.
    const responses = await Promise.all(
      [...landings, ...landings].map((page) =>
        readHttp(
          deployment.baseUrl,
          `${page.path}?utm_source=crawler&invoice=not-public`,
          productionHeaders,
        ),
      ),
    )
    for (const [index, response] of responses.entries()) {
      const landing = landings[index % landings.length]
      const english = landing.language === 'en'
      const canonical = `${productionOrigin}${landing.path}`
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toMatch(
        /text\/html.*charset=utf-8/i,
      )
      expect(response.headers['x-robots-tag'] ?? '').not.toMatch(/noindex/i)
      const document = inspectHtml(response.body.toString())
      expectStaticMetadata(document, landing, productionOrigin)
      expect(document.metas.robots).toEqual(['index, follow'])
      expect(document.mainText).toContain(
        english
          ? 'Create invoices. Directly in your browser.'
          : 'Rechnungen erstellen. Direkt im Browser.',
      )
      expect(document.mainText).toContain(
        english ? 'No account required' : 'Ohne Benutzerkonto',
      )
      expect(document.mainText).toContain(
        english ? 'business profile' : 'Unternehmensprofil',
      )
      expect(document.mainText).toContain('16')
      expect(document.mainText).toMatch(/7\s*%/)
      expect(document.mainText).toMatch(/19\s*%/)
      expect(document.mainText).toContain('A4')
      expect(document.mainText).toMatch(
        english ? /unencrypted/ : /unverschlüsselt/,
      )
      expect(document.mainText).toMatch(
        english ? /Ready offline/ : /Offline bereit/,
      )
      // Six separate feature explanations, not only a hero and a generic list.
      expect(document.headings.length).toBeGreaterThanOrEqual(7)
      expect(document.alternates).toEqual(
        expect.arrayContaining([
          { language: 'de', href: `${productionOrigin}/de` },
          { language: 'en', href: `${productionOrigin}/en` },
          { language: 'x-default', href: `${productionOrigin}/de` },
        ]),
      )
      expect(document.alternates).toHaveLength(3)
      expect(document.structuredData).toHaveLength(1)
      const graph = document.structuredData[0] as {
        '@context': string
        '@graph': Array<Record<string, unknown>>
      }
      expect(graph['@context']).toBe('https://schema.org')
      expect(graph['@graph']).toHaveLength(3)
      expect(graph['@graph']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            '@type': 'WebSite',
            '@id': `${productionOrigin}/#website`,
            name: 'regningen',
            url: canonical,
            inLanguage: landing.language,
          }),
          expect.objectContaining({
            '@type': 'WebPage',
            '@id': `${canonical}#webpage`,
            url: canonical,
            name: landing.title,
            description: landing.description,
            inLanguage: landing.language,
            isPartOf: { '@id': `${productionOrigin}/#website` },
            about: { '@id': `${canonical}#application` },
          }),
          expect.objectContaining({
            '@type': 'WebApplication',
            '@id': `${canonical}#application`,
            name: 'regningen',
            url: canonical,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            inLanguage: landing.language,
          }),
        ]),
      )
      const application = graph['@graph'].find(
        (entity) => entity['@type'] === 'WebApplication',
      )
      expect(application?.featureList).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/16.*7.*19/),
          expect.stringMatching(/A4/),
          expect.stringMatching(
            english
              ? /session.*not an invoice archive/
              : /Sitzung.*kein Rechnungsarchiv/,
          ),
          expect.stringMatching(english ? /unencrypted/ : /unverschlüsselt/),
          expect.stringMatching(
            english
              ? /online preparation.*Offline ready/
              : /Online-Vorbereitung.*Offline bereit/,
          ),
        ]),
      )
      const schema = JSON.stringify(graph)
      expect(schema).not.toMatch(/\/invoice|\/settings|utm_source|not-public/)
      expect(schema).not.toMatch(
        /"(?:offers|aggregateRating|review|potentialAction)"/,
      )
      expectInstallationMetadata(document)
    }
  })

  test('application pages have static page-specific sharing metadata without landing discovery', async () => {
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    for (const page of applicationPages) {
      for (const suffix of ['', '?utm_source=shared', '/?utm_source=shared']) {
        let response = await readHttp(
          deployment.baseUrl,
          `${page.path}${suffix}`,
          productionHeaders,
        )
        // Existing trailing-slash entry points may normalize with an HTTP
        // redirect; inspect the actual destination HTML rather than a shell.
        if (suffix.startsWith('/') && response.status !== 200) {
          expect([301, 302, 307, 308]).toContain(response.status)
          const destination = new URL(
            String(response.headers.location),
            productionOrigin,
          )
          expect(destination.pathname).toBe(page.path)
          expect(destination.search).toBe('?utm_source=shared')
          response = await readHttp(
            deployment.baseUrl,
            `${destination.pathname}${destination.search}`,
            productionHeaders,
          )
        }
        expect(response.status, `${page.path}${suffix}`).toBe(200)
        const document = inspectHtml(response.body.toString())
        expectStaticMetadata(document, page, productionOrigin)
        expect(document.metas.robots).toEqual(['noindex, follow'])
        expect(document.alternates).toEqual([])
        expect(document.structuredData).toEqual([])
        expectInstallationMetadata(document)
      }
    }
  })

  test('unknown URLs deliver a real noindex 404 without a landing canonical or schema', async () => {
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    for (const locale of ['de', 'en']) {
      const response = await readHttp(
        deployment.baseUrl,
        `/${locale}/not-a-real-page?utm_source=404`,
        productionHeaders,
      )
      expect(response.status).toBe(404)
      expect(response.headers['content-type']).toMatch(/text\/html/)
      const document = inspectHtml(response.body.toString())
      expect(document.metas.robots).toEqual(['noindex, follow'])
      expect(document.canonicals).toEqual([])
      expect(document.alternates).toEqual([])
      expect(document.structuredData).toEqual([])
      expect(document.metas['og:url'] ?? []).toEqual([])
    }
  })

  test('a real throwing page loader delivers HTTP 500 and cannot inherit landing publication', async () => {
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    for (const locale of ['de', 'en']) {
      const response = await readHttp(
        deployment.baseUrl,
        `/${locale}/visibility-failure`,
        productionHeaders,
      )
      expect(response.status).toBe(500)
      expect(response.headers['content-type']).toMatch(/text\/html/)
      expect(response.headers['x-robots-tag']).toMatch(/noindex/i)
      const document = inspectHtml(response.body.toString())
      expect(landings.map((page) => page.title)).not.toContain(document.title)
      expect(document.metas.robots).toEqual(['noindex, follow'])
      expect(document.canonicals).toEqual([])
      expect(document.alternates).toEqual([])
      expect(document.structuredData).toEqual([])
      expect(document.metas['og:url'] ?? []).toEqual([])
    }
  })

  test('production discovery endpoints advertise only the two localized landing pages', async () => {
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    const robots = await readHttp(
      deployment.baseUrl,
      '/robots.txt',
      productionHeaders,
    )
    expect(robots.status).toBe(200)
    expect(robots.headers['content-type']).toMatch(
      /text\/plain.*charset=utf-8/i,
    )
    expect(robots.body.toString()).toMatch(/^User-agent:\s*\*\s*$/im)
    expect(robots.body.toString()).toMatch(/^Allow:\s*\/\s*$/im)
    expect(robots.body.toString()).toContain(
      `Sitemap: ${productionOrigin}/sitemap.xml`,
    )
    expect(robots.body.toString()).not.toMatch(/Disallow:\s*\/\S*|noindex/i)

    const sitemap = await readHttp(
      deployment.baseUrl,
      '/sitemap.xml',
      productionHeaders,
    )
    expect(sitemap.status).toBe(200)
    expect(sitemap.headers['content-type']).toMatch(
      /(?:application|text)\/xml.*charset=utf-8/i,
    )
    const inventory = inspectSitemap(sitemap.body.toString())
    expect(inventory.root).toBe('urlset')
    expect(inventory.namespace).toBe(
      'http://www.sitemaps.org/schemas/sitemap/0.9',
    )
    expect(inventory.locations).toEqual([
      `${productionOrigin}/de`,
      `${productionOrigin}/en`,
    ])
    expect(inventory.priorities).toEqual([])
    expect(inventory.changeFrequencies).toEqual([])
    // There is no maintained landing content date in the current declaration.
    expect(inventory.lastModified).toEqual([])

    const guide = await readHttp(
      deployment.baseUrl,
      '/llms.txt',
      productionHeaders,
    )
    expect(guide.status).toBe(200)
    expect(guide.headers['content-type']).toMatch(/text\/plain.*charset=utf-8/i)
    const text = guide.body.toString()
    expect(text).toMatch(/^# regningen\s*$/m)
    expect(text).toContain('German- and English-language')
    expect(text).toContain('invoices')
    expect(text).toContain('PDF')
    expect(text).toMatch(/offline.*initial online preparation/i)
    expect(text).toContain(
      'Features, local storage, PDF export, and offline-use requirements.',
    )
    const links = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(
      ([, label, url]) => ({ label, url }),
    )
    expect(links).toEqual([
      { label: 'Startseite', url: `${productionOrigin}/de` },
      { label: 'Home', url: `${productionOrigin}/en` },
    ])
    for (const resource of [
      '/de/rechnung',
      '/de/einstellungen',
      '/en/invoice',
      '/en/settings',
      '/sw.js',
      '/manifest.webmanifest',
    ]) {
      expect(text).not.toContain(`${productionOrigin}${resource}`)
      expect(sitemap.body.toString()).not.toContain(resource)
    }
    // Request-scoped publication must not be reusable as an unconditional CDN response.
    for (const response of [robots, sitemap, guide]) {
      expect(response.headers['cache-control']).toMatch(/no-store|private/i)
    }
    const worker = await readHttp(deployment.baseUrl, '/sw.js')
    expect(worker.body.toString()).not.toMatch(
      /url:["']\/(?:robots\.txt|sitemap\.xml|llms\.txt)["']/,
    )
  })

  test('both localized social cards are real 1200×630 PNGs with one installation manifest', async () => {
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    const images = new Set<string>()
    for (const landing of landings) {
      const page = await readHttp(
        deployment.baseUrl,
        landing.path,
        productionHeaders,
      )
      const document = inspectHtml(page.body.toString())
      const imageUrl = new URL(document.metas['og:image'][0])
      expect(imageUrl.origin).toBe(productionOrigin)
      expect(imageUrl.pathname).toMatch(/\.png$/)
      images.add(imageUrl.pathname)
      const image = await readHttp(
        deployment.baseUrl,
        imageUrl.pathname,
        productionHeaders,
      )
      expect(image.status).toBe(200)
      expect(image.headers['content-type']).toMatch(/^image\/png(?:;|$)/)
      expect([...image.body.subarray(0, 8)]).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ])
      expect(image.body.readUInt32BE(16)).toBe(1200)
      expect(image.body.readUInt32BE(20)).toBe(630)
    }
    expect(images.size).toBe(2)
    const manifest = await readHttp(
      deployment.baseUrl,
      '/manifest.webmanifest',
      productionHeaders,
    )
    expect(manifest.status).toBe(200)
    expect(manifest.headers['content-type']).toMatch(
      /application\/(?:manifest\+json|json)/,
    )
    expect(JSON.parse(manifest.body.toString())).toMatchObject({
      id: '/',
      name: 'regningen',
      lang: 'de',
      start_url: '/',
      scope: '/',
    })
  })

  test('foreign HTML is forced noindex while crawling remains allowed and discovery returns 404', async () => {
    await deployment.deploy('a', { ORIGIN: productionOrigin })
    const foreignHeaders = { host: 'preview.example' }
    for (const page of [...landings, ...applicationPages]) {
      const response = await readHttp(
        deployment.baseUrl,
        page.path,
        foreignHeaders,
      )
      expect(response.status).toBe(200)
      expectExcludedHtml(response)
      const document = inspectHtml(response.body.toString())
      expect(document.canonicals).toEqual([`${productionOrigin}${page.path}`])
      expect(document.metas['og:url']).toEqual([
        `${productionOrigin}${page.path}`,
      ])
    }
    await expectExcludedDiscovery(deployment, foreignHeaders)
    // Alternate requests on the same running server must not share publication decisions.
    await expectExcludedDiscovery(deployment, { host: 'regningen.soren.codes' })
  })

  test('omitted or empty ORIGIN disables public visibility instead of adopting forwarded request identity', async () => {
    for (const origin of [undefined, '']) {
      await test.step(`ORIGIN=${String(origin)}`, async () => {
        await deployment.deploy('a', { ORIGIN: origin, TRUST_PROXY: 'true' })
        const response = await readHttp(
          deployment.baseUrl,
          '/de',
          productionHeaders,
        )
        expect(response.status).toBe(200)
        expectExcludedHtml(response)
        expect(inspectHtml(response.body.toString()).canonicals).toEqual([])
        await expectExcludedDiscovery(deployment, productionHeaders)
      })
    }
  })

  test('forwarded headers cannot enable publication without explicit trust', async () => {
    const forged = { ...productionHeaders, host: 'preview.example' }
    for (const trust of [undefined, 'false', '']) {
      await test.step(`TRUST_PROXY=${String(trust)}`, async () => {
        await deployment.deploy('a', {
          ORIGIN: productionOrigin,
          TRUST_PROXY: trust,
        })
        expectExcludedHtml(await readHttp(deployment.baseUrl, '/de', forged))
        await expectExcludedDiscovery(deployment, forged)
      })
    }
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    const enabled = await readHttp(deployment.baseUrl, '/en', forged)
    expect(inspectHtml(enabled.body.toString()).metas.robots).toEqual([
      'index, follow',
    ])
    expect(enabled.headers['x-robots-tag'] ?? '').not.toMatch(/noindex/)
    const sitemap = await readHttp(deployment.baseUrl, '/sitemap.xml', forged)
    expect(sitemap.status).toBe(200)
    expect(inspectSitemap(sitemap.body.toString()).locations).toEqual([
      `${productionOrigin}/de`,
      `${productionOrigin}/en`,
    ])
    // A subsequent foreign request must not inherit the prior eligible response.
    await expectExcludedDiscovery(deployment, { host: 'preview.example' })
    expectExcludedHtml(
      await readHttp(deployment.baseUrl, '/en', { host: 'preview.example' }),
    )
  })

  test('trusted malformed forwarding fails closed rather than falling back to the configured origin', async () => {
    await deployment.deploy('a', {
      ORIGIN: productionOrigin,
      TRUST_PROXY: 'true',
    })
    const malformed = [
      {
        'x-forwarded-host': 'regningen.soren.codes/path',
        'x-forwarded-proto': 'https',
      },
      {
        'x-forwarded-host': 'user@regningen.soren.codes',
        'x-forwarded-proto': 'https',
      },
      {
        'x-forwarded-host': 'regningen.soren.codes:invalid',
        'x-forwarded-proto': 'https',
      },
      {
        'x-forwarded-host': 'regningen.soren.codes',
        'x-forwarded-proto': 'ftp',
      },
      { 'x-forwarded-host': 'regningen.soren.codes', 'x-forwarded-proto': '' },
      { 'x-forwarded-host': '', 'x-forwarded-proto': 'https' },
      {
        'x-forwarded-host': 'regningen.soren.codes, preview.example',
        'x-forwarded-proto': 'https',
      },
      {
        'x-forwarded-host': 'regningen.soren.codes',
        'x-forwarded-proto': 'https, http',
      },
    ]
    for (const forwarding of malformed) {
      const headers = { host: 'regningen.soren.codes', ...forwarding }
      expectExcludedHtml(await readHttp(deployment.baseUrl, '/de', headers))
      await expectExcludedDiscovery(deployment, headers)
    }
  })

  test('empty forwarding headers cannot publish even when the direct request origin matches', async () => {
    await deployment.deploy('a', {
      ORIGIN: deployment.baseUrl,
      TRUST_PROXY: 'true',
    })
    // Explicit absence is valid; present-but-empty headers are malformed.
    const direct = inspectHtml(
      (await readHttp(deployment.baseUrl)).body.toString(),
    )
    expect(direct.metas.robots).toEqual(['index, follow'])
    const malformed: Array<Record<string, string>> = [
      { 'x-forwarded-host': '' },
      { 'x-forwarded-proto': '' },
      { 'x-forwarded-host': '', 'x-forwarded-proto': '' },
    ]
    for (const headers of malformed) {
      expectExcludedHtml(await readHttp(deployment.baseUrl, '/en', headers))
      await expectExcludedDiscovery(deployment, headers)
    }
  })

  test('origin comparison normalizes case and default ports but respects scheme, host and nondefault ports', async () => {
    await deployment.deploy('a', {
      ORIGIN: 'HTTPS://REGNINGEN.SOREN.CODES:443/',
      TRUST_PROXY: 'true',
    })
    const normalizedHeaders = {
      host: 'backend.internal',
      'x-forwarded-host': 'REGNINGEN.SOREN.CODES:443',
      'x-forwarded-proto': 'https',
    }
    for (const path of ['/de', '/de?utm_campaign=one&other=two']) {
      const response = await readHttp(
        deployment.baseUrl,
        path,
        normalizedHeaders,
      )
      const document = inspectHtml(response.body.toString())
      expect(response.status).toBe(200)
      expect(document.metas.robots).toEqual(['index, follow'])
      expect(document.canonicals).toEqual([`${productionOrigin}/de`])
    }
    for (const forwarding of [
      {
        'x-forwarded-host': 'regningen.soren.codes',
        'x-forwarded-proto': 'http',
      },
      { 'x-forwarded-host': 'other.example', 'x-forwarded-proto': 'https' },
      {
        'x-forwarded-host': 'regningen.soren.codes:444',
        'x-forwarded-proto': 'https',
      },
    ]) {
      const headers = { host: 'backend.internal', ...forwarding }
      expectExcludedHtml(await readHttp(deployment.baseUrl, '/de', headers))
      await expectExcludedDiscovery(deployment, headers)
    }
    await deployment.deploy('a', {
      ORIGIN: 'https://regningen.soren.codes:8443',
      TRUST_PROXY: 'true',
    })
    const portHeaders = {
      ...productionHeaders,
      'x-forwarded-host': 'regningen.soren.codes:8443',
    }
    const portMatch = inspectHtml(
      (await readHttp(deployment.baseUrl, '/en', portHeaders)).body.toString(),
    )
    expect(portMatch.metas.robots).toEqual(['index, follow'])
    expect(portMatch.canonicals).toEqual([
      'https://regningen.soren.codes:8443/en',
    ])
    expectExcludedHtml(
      await readHttp(deployment.baseUrl, '/en', productionHeaders),
    )
  })

  test('direct HTTP uses the actual Host and supports normalized local origins independently of path and query', async () => {
    await deployment.deploy('a', { ORIGIN: deployment.baseUrl })
    for (const page of [...landings, ...applicationPages]) {
      const path = `${page.path}?utm_source=direct`
      const response = await readHttp(deployment.baseUrl, path)
      expect(response.status).toBe(200)
      const document = inspectHtml(response.body.toString())
      expect(document.canonicals).toEqual([`${deployment.baseUrl}${page.path}`])
      expect(document.metas.robots).toEqual([
        page.path === '/de' || page.path === '/en'
          ? 'index, follow'
          : 'noindex, follow',
      ])
    }
    const localSitemap = await readHttp(
      deployment.baseUrl,
      '/sitemap.xml?utm_source=direct',
    )
    expect(localSitemap.status).toBe(200)
    expect(inspectSitemap(localSitemap.body.toString()).locations).toEqual([
      `${deployment.baseUrl}/de`,
      `${deployment.baseUrl}/en`,
    ])
    expectExcludedHtml(
      await readHttp(deployment.baseUrl, '/de', { host: 'localhost' }),
    )
    const wrongPort = Number(new URL(deployment.baseUrl).port) + 1
    const wrongPortHeaders = { host: `127.0.0.1:${wrongPort}` }
    expectExcludedHtml(
      await readHttp(deployment.baseUrl, '/en', wrongPortHeaders),
    )
    await expectExcludedDiscovery(deployment, wrongPortHeaders)

    await deployment.deploy('a', { ORIGIN: 'HTTP://REGNINGEN.SOREN.CODES:80/' })
    const defaultPort = await readHttp(deployment.baseUrl, '/de', {
      host: 'REGNINGEN.SOREN.CODES:80',
    })
    const normalized = inspectHtml(defaultPort.body.toString())
    expect(normalized.metas.robots).toEqual(['index, follow'])
    expect(normalized.canonicals).toEqual(['http://regningen.soren.codes/de'])
    // Configuring HTTPS does not make this direct HTTP backend a public TLS request.
    await deployment.deploy('a', { ORIGIN: productionOrigin })
    expectExcludedHtml(
      await readHttp(deployment.baseUrl, '/en', {
        host: 'regningen.soren.codes',
      }),
    )
  })
})

function expectStaticMetadata(
  document: ReturnType<typeof inspectHtml>,
  page: (typeof landings)[number],
  origin: string,
) {
  expect(document.language).toBe(page.language)
  expect(document.title).toBe(page.title)
  expect(document.metas.description).toEqual([page.description])
  expect(document.canonicals).toEqual([`${origin}${page.path}`])
  for (const [name, content] of Object.entries({
    'og:title': page.title,
    'og:description': page.description,
    'og:type': 'website',
    'og:url': `${origin}${page.path}`,
    'og:site_name': 'regningen',
    'og:locale': page.language === 'en' ? 'en_GB' : 'de_DE',
    'og:image:type': 'image/png',
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:alt':
      page.language === 'en'
        ? 'regningen – Create invoices and download PDFs.'
        : 'regningen – Rechnungen erstellen und als PDF herunterladen.',
    'twitter:card': 'summary_large_image',
    'twitter:title': page.title,
    'twitter:description': page.description,
    'twitter:image:alt':
      page.language === 'en'
        ? 'regningen – Create invoices and download PDFs.'
        : 'regningen – Rechnungen erstellen und als PDF herunterladen.',
  })) {
    expect(document.metas[name], name).toEqual([content])
  }
  expect(document.metas['og:image']).toHaveLength(1)
  expect(new URL(document.metas['og:image'][0]).origin).toBe(origin)
  expect(document.metas['twitter:image']).toEqual(document.metas['og:image'])
  expect(document.metas['twitter:site']).toBeUndefined()
  expect(document.metas['twitter:creator']).toBeUndefined()
}

function expectInstallationMetadata(document: ReturnType<typeof inspectHtml>) {
  expect(document.charset.map((value) => value?.toLowerCase())).toEqual([
    'utf-8',
  ])
  expect(document.metas.viewport).toHaveLength(1)
  expect(document.metas['theme-color'].length).toBeGreaterThan(0)
  expect(document.metas['application-name']).toEqual(['regningen'])
  expect(document.manifests).toEqual([
    `/manifest-${document.language}.webmanifest`,
  ])
  expect(document.touchIcons).toEqual(
    expect.arrayContaining(['/apple-touch-icon-180x180.png']),
  )
  expect(document.stylesheets.length).toBeGreaterThan(0)
}

function expectExcludedHtml(response: Awaited<ReturnType<typeof readHttp>>) {
  expect(response.status).toBe(200)
  expect(response.headers['x-robots-tag']).toMatch(/noindex/i)
  const document = inspectHtml(response.body.toString())
  expect(document.metas.robots).toEqual(['noindex, follow'])
  expect(document.structuredData).toEqual([])
  expect(document.alternates).toEqual([])
}

async function expectExcludedDiscovery(
  deployment: PwaDeployment,
  headers: Record<string, string>,
) {
  const robots = await readHttp(deployment.baseUrl, '/robots.txt', headers)
  expect(robots.status).toBe(200)
  expect(robots.headers['content-type']).toMatch(/text\/plain.*charset=utf-8/i)
  expect(robots.body.toString()).toMatch(/^User-agent:\s*\*\s*$/im)
  expect(robots.body.toString()).toMatch(/^Allow:\s*\/\s*$/im)
  expect(robots.body.toString()).not.toMatch(
    /Sitemap:|Disallow:\s*\/\S*|noindex/i,
  )
  for (const path of ['/sitemap.xml', '/llms.txt']) {
    const response = await readHttp(deployment.baseUrl, path, headers)
    expect(response.status, path).toBe(404)
    expect(response.body.toString()).not.toContain(`${productionOrigin}/`)
    expect(response.body.toString()).not.toMatch(/<urlset|\[Startseite\]/)
  }
}
