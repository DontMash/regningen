import { expect, test } from '../support/playwright/playwright'
import { readHttp } from '../support/playwright/http-documents'
import { PwaDeployment } from '../support/playwright/pwa-deployment'
import {
  deniedCapabilities,
  representativeGeneratedAssets,
  scriptAuthorizations,
  SecurityDiagnostics,
} from '../support/playwright/security'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { ArtifactSupport } from '../support/playwright/artifacts'
import { PwaBrowserControls } from '../support/playwright/pwa-browser'
import { BrowserControls } from '../support/playwright/browser'
import { PwaBrowserCapabilities } from '../support/playwright/pwa-capabilities'
import { createInvoiceScenario } from '../scenarios/invoice'
import {
  activateProhibitedHandler,
  executionProbeResult,
  frameApplication,
  installExecutionProbes,
  interceptPersonalWebsite,
} from '../support/playwright/security-probes'

// HTTP over loopback with controlled proxy headers proves delivery, not TLS.
test.describe('production browser security', () => {
  // Keep one mutable deployment sequential without skipping independent checks
  // after a failure (Playwright restarts the worker and rebuilds its fixture).
  test.describe.configure({ mode: 'default', timeout: 240_000 })
  let deployment: PwaDeployment

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    deployment = await PwaDeployment.create({
      updates: true,
      failedPage: true,
      updateKind: 'security-policy',
    })
    await deployment.deploy('a')
  })

  test.afterAll(async () => {
    await deployment.dispose()
  })

  test('fresh concurrent documents have independent matching script authorization', async () => {
    const documents = await Promise.all(
      Array.from({ length: 8 }, () => readHttp(deployment.baseUrl)),
    )
    const nonces = new Set<string>()
    for (const response of documents) {
      const csp = String(response.headers['content-security-policy'])
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
      expect(nonce).toBeTruthy()
      nonces.add(nonce!)
      const scripts = await scriptAuthorizations(response.body.toString())
      expect(scripts.length).toBeGreaterThan(2)
      for (const script of scripts) expect(script.nonce).toBe(nonce)
    }
    expect(nonces.size).toBe(8)
  })

  test('the enforced policy preserves themes, hydration, profile validation and JSON backups', async ({
    browser,
    robotsForPage,
  }) => {
    const pwaBrowser = await PwaBrowserControls.create(browser)
    const context = pwaBrowser.context
    const diagnostics = new SecurityDiagnostics()
    await diagnostics.observe(context)
    const page = await context.newPage()
    const { appShell, releaseNotes, theme, businessProfile, pwa } =
      robotsForPage(page)
    const controls = new BrowserControls(page, context)
    await controls.useSystemTheme('dark')
    try {
      await page.goto(`${deployment.baseUrl}/de`)
      await theme.expectResolvedTheme('dark')
      await releaseNotes.selectReleaseVersion('v1.0.0')
      await releaseNotes.acknowledgeReleaseNotes()
      await pwa.expectOfflineReady()
      await theme.cycleTheme()
      await theme.expectResolvedTheme('light')
      await appShell.navigateToSettings()
      await appShell.navigateToBusinessProfile()
      const profile = createBusinessProfileScenario()
      await businessProfile.enterDetails({ iban: 'invalid' })
      await businessProfile.blurField('iban')
      await businessProfile.expectValidationMessage(
        'Bitte eine gültige IBAN eingeben.',
      )
      await businessProfile.configureBusinessProfile(profile)
      await businessProfile.expectProfileSaved()
      await businessProfile.openIbanGuidance()
      await businessProfile.expectIbanGuidance()
      await businessProfile.pressEscape()
      const artifacts = new ArtifactSupport(page)
      const download = await artifacts.captureDownload(() =>
        businessProfile.exportBackup(),
      )
      const contents = await artifacts.readText(download)
      expect(JSON.parse(contents).profile).toEqual(profile)
      const imported = createBusinessProfileScenario({
        businessName: 'Südwind Kulturwerk',
        ownerName: 'Alex Beispiel',
      })
      const backup = { ...JSON.parse(contents), profile: imported }
      await businessProfile.chooseBackup({
        name: 'profile.json',
        contents: JSON.stringify(backup),
      })
      await businessProfile.confirmBackupReplacement()
      await businessProfile.expectFieldValue(
        'businessName',
        imported.businessName,
      )
      await businessProfile.expectFieldValue('ownerName', imported.ownerName)
      const beforeSave = await artifacts.captureDownload(() =>
        businessProfile.exportBackup(),
      )
      expect(JSON.parse(await artifacts.readText(beforeSave)).profile).toEqual(
        profile,
      )
      await businessProfile.saveProfile()
      await businessProfile.expectProfileSaved()
      await pwaBrowser.setOffline(true)
      await page.reload()
      await businessProfile.expectEditorReady()
      await businessProfile.expectFieldValue(
        'businessName',
        imported.businessName,
      )
      await businessProfile.expectFieldValue('ownerName', imported.ownerName)
      const offlineBackup = await artifacts.captureDownload(() =>
        businessProfile.exportBackup(),
      )
      expect(
        JSON.parse(await artifacts.readText(offlineBackup)).profile,
      ).toEqual(imported)
      await controls.setViewport(390, 844)
      await appShell.openMenu()
      await appShell.expectMenuOpen()
      await appShell.dismissMenuWithEscape()
      await appShell.expectMenuClosed()
      expect(await deniedCapabilities(page)).toEqual([false, false, false])
      expect(diagnostics.violations).toEqual([])
      expect(diagnostics.errors).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('notification denial never prompts or prevents a usable local PDF under CSP', async ({
    browser,
    robotsForPage,
  }) => {
    const pwaBrowser = await PwaBrowserControls.create(browser)
    const capabilities = new PwaBrowserCapabilities(pwaBrowser.context)
    await capabilities.observeNotifications(deployment.baseUrl, 'denied')
    const diagnostics = new SecurityDiagnostics()
    await diagnostics.observe(pwaBrowser.context)
    const page = await pwaBrowser.openPage()
    const { pwa, settings, appShell, businessProfile, invoice } =
      robotsForPage(page)
    try {
      await page.goto(`${deployment.baseUrl}/de/einstellungen`)
      await pwa.acknowledgeRunningReleaseNotes()
      await pwa.expectOfflineReady()
      await settings.expectNotificationsDenied()
      await appShell.navigateToBusinessProfile()
      await businessProfile.configureBusinessProfile(
        createBusinessProfileScenario(),
      )
      await businessProfile.expectProfileSaved()
      await appShell.navigateToInvoice()
      const scenario = createInvoiceScenario()
      await invoice.enterInvoice(scenario.input)
      const artifacts = new ArtifactSupport(page)
      const download = await artifacts.captureDownload(() =>
        invoice.createPdf(),
      )
      const pdf = await artifacts.readPdf(download)
      expect(pdf.pageCount).toBe(1)
      for (const text of scenario.expected.pdfText)
        expect(pdf.text).toContain(text)
      expect(
        (await capabilities.notificationObservation(page)).notifications,
      ).toEqual([])
      expect(
        (await capabilities.notificationObservation(page)).permissionRequests,
      ).toBe(0)
      expect(diagnostics.violations).toEqual([])
      expect(diagnostics.errors).toEqual([])
    } finally {
      await pwaBrowser.dispose()
    }
  })

  test('pages, failures, discovery and generated assets deliver the enforced baseline', async () => {
    for (const [path, status, mime] of [
      ['/de', 200, 'text/html'],
      ['/en', 200, 'text/html'],
      ['/de/rechnung', 200, 'text/html'],
      ['/en/invoice', 200, 'text/html'],
      ['/de/einstellungen', 200, 'text/html'],
      ['/en/settings', 200, 'text/html'],
      ['/de/einstellungen/profil', 200, 'text/html'],
      ['/en/settings/profile', 200, 'text/html'],
      ['/de/unknown-security-page', 404, 'text/html'],
      ['/en/unknown-security-page', 404, 'text/html'],
      ['/de/visibility-failure', 500, 'text/html'],
      ['/en/visibility-failure', 500, 'text/html'],
      ['/robots.txt', 200, 'text/plain'],
      ['/sitemap.xml', 200, 'xml'],
      ['/llms.txt', 200, 'text/plain'],
      ['/sw.js', 200, 'javascript'],
      ['/manifest.webmanifest', 200, 'application/manifest+json'],
      ['/manifest-de.webmanifest', 200, 'application/manifest+json'],
      ['/manifest-en.webmanifest', 200, 'application/manifest+json'],
      ['/favicon.svg', 200, 'image/svg+xml'],
      ['/social-preview.png', 200, 'image/png'],
      ['/social-preview-en.png', 200, 'image/png'],
    ] as const) {
      const response = await readHttp(deployment.baseUrl, path)
      expect(response.status, path).toBe(status)
      expect(response.headers['content-type'], path).toContain(mime)
      expect(response.headers['referrer-policy'], path).toBe('no-referrer')
      expect(response.headers['x-content-type-options'], path).toBe('nosniff')
      expect(response.headers['x-frame-options'], path).toBe('DENY')
      expect(response.headers['permissions-policy'], path).toBe(
        'camera=(), microphone=(), geolocation=()',
      )
      const csp = response.headers['content-security-policy']
      expect(csp, path).toContain("default-src 'self'")
      expect(csp, path).toContain("frame-ancestors 'none'")
      expect(csp, path).not.toMatch(
        /unsafe-eval|script-src[^;]*unsafe-inline|report-uri|report-to|localhost|ws:/,
      )
      expect(
        response.headers['content-security-policy-report-only'],
      ).toBeUndefined()
      expect(response.headers['strict-transport-security']).toBeUndefined()
      if (mime === 'text/html') {
        expect(response.headers['cache-control']).toBe('private, no-store')
      }
    }
  })

  test('runtime failures, previews and conditional generated assets retain protection and MIME types', async () => {
    const failure = await readHttp(deployment.baseUrl, '/de', {
      accept: 'application/json',
    })
    expect(failure.status).toBe(406)
    expect(failure.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    )
    expect(failure.headers['referrer-policy']).toBe('no-referrer')
    const preview = await readHttp(deployment.baseUrl, '/en', {
      host: 'preview.example',
    })
    expect(preview.status).toBe(200)
    expect(preview.headers['x-robots-tag']).toBe('noindex')
    expect(preview.headers['content-security-policy']).toContain(
      "script-src 'self' 'nonce-",
    )
    for (const resource of await representativeGeneratedAssets(
      deployment.artifactPath('a', 'public'),
    )) {
      const response = await readHttp(deployment.baseUrl, resource.path)
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain(resource.mime)
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'self'",
      )
      expect(response.headers['x-frame-options']).toBe('DENY')
      expect(response.headers['referrer-policy']).toBe('no-referrer')
      const etag = response.headers.etag
      expect(etag).toBeTruthy()
      const conditional = await readHttp(deployment.baseUrl, resource.path, {
        'if-none-match': etag!,
      })
      expect(conditional.status).toBe(304)
      expect(conditional.body.length).toBe(0)
      expect(conditional.headers['x-content-type-options']).toBe('nosniff')
      expect(conditional.headers['content-security-policy']).toBe(
        response.headers['content-security-policy'],
      )
      expect(conditional.headers['cache-control']).toBe(
        response.headers['cache-control'],
      )
    }
  })

  test('the browser rejects unauthorized inline code, handlers, evaluation and foreign resources', async ({
    browser,
    robotsForPage,
  }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const diagnostics = new SecurityDiagnostics()
    await diagnostics.observe(context)
    const probes = await installExecutionProbes(context, deployment.baseUrl)
    const page = await context.newPage()
    try {
      await page.goto(`${deployment.baseUrl}/de?security-probes`)
      await robotsForPage(page).releaseNotes.dismissReleaseNotes()
      await activateProhibitedHandler(page)
      await expect
        .poll(() => executionProbeResult(page))
        .toEqual({
          authorized: true,
          evalBlocked: true,
          connectionBlocked: true,
          inlineExecuted: false,
          handlerExecuted: false,
          evaluationExecuted: false,
        })
      expect(probes.prohibitedRequests()).toBe(0)
      await expect
        .poll(() => diagnostics.violations)
        .toEqual(
          expect.arrayContaining([
            { directive: 'script-src-elem', blocked: 'inline' },
            { directive: 'script-src', blocked: 'eval' },
            { directive: 'script-src-attr', blocked: 'inline' },
            {
              directive: 'img-src',
              blocked: 'https://blocked.security.invalid/image.png',
            },
            {
              directive: 'connect-src',
              blocked: 'https://blocked.security.invalid/connect',
            },
          ]),
        )
    } finally {
      await context.close()
    }
  })

  test('even a same-origin parent cannot frame the application', async ({
    browser,
  }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    try {
      const frame = await frameApplication(page, deployment.baseUrl)
      await expect.poll(frame.childUrl).toBe('chrome-error://chromewebdata/')
      expect(await frame.childHasApplication()).toBe(0)
      expect(frame.messages().join('\n')).toMatch(
        /frame-ancestors|X-Frame-Options/i,
      )
    } finally {
      await context.close()
    }
  })

  test('only an explicit credit navigation sends fixed attribution without a referrer', async ({
    browser,
    robotsForPage,
  }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const destination = await interceptPersonalWebsite(context)
    const page = await context.newPage()
    const { footer, releaseNotes } = robotsForPage(page)
    try {
      await page.goto(
        `${deployment.baseUrl}/de?utm_source=private&invoice=fictional-secret`,
      )
      await releaseNotes.dismissReleaseNotes()
      await footer.expectFooterDestinations()
      await footer.expectAuthorAttribution()
      expect(destination.snapshot()).toEqual([])
      await footer.followAuthorCredit()
      await expect.poll(destination.snapshot).toEqual([
        {
          url: 'https://www.soren.codes/?utm_source=regningen&utm_medium=referral',
          referer: undefined,
        },
      ])
    } finally {
      await context.close()
    }
  })

  test('HSTS stages are explicit, host-only and limited to established public HTTPS', async () => {
    const headers = {
      'x-forwarded-host': 'preview.example',
      'x-forwarded-proto': 'https',
    }
    for (const [stage, expected] of [
      [undefined, undefined],
      ['off', undefined],
      ['', undefined],
      ['one-day', 'max-age=86400'],
      ['one-week', 'max-age=604800'],
      ['one-year', 'max-age=31536000'],
      ['reset', 'max-age=0'],
    ] as const) {
      await deployment.deploy('a', { TRUST_PROXY: 'true', HSTS_STAGE: stage })
      for (let request = 0; request < 2; request += 1) {
        const response = await readHttp(deployment.baseUrl, '/de', headers)
        expect(response.headers['strict-transport-security']).toBe(expected)
      }
      expect(
        (await readHttp(deployment.baseUrl)).headers[
          'strict-transport-security'
        ],
      ).toBeUndefined()
    }
    await deployment.deploy('a', {
      ORIGIN: 'https://preview.example',
      HSTS_STAGE: 'one-day',
    })
    expect(
      (await readHttp(deployment.baseUrl, '/en', headers)).headers[
        'strict-transport-security'
      ],
    ).toBeUndefined()
    await deployment.deploy('a', { TRUST_PROXY: 'true', HSTS_STAGE: 'one-day' })
    const malformedForwarding: Array<Record<string, string>> = [
      {},
      { 'x-forwarded-proto': 'https' },
      { 'x-forwarded-host': 'preview.example' },
      { ...headers, 'x-forwarded-proto': '' },
      { ...headers, 'x-forwarded-host': '' },
      { ...headers, 'x-forwarded-proto': 'https, http' },
      { ...headers, 'x-forwarded-host': 'preview.example, other.example' },
      { ...headers, 'x-forwarded-host': 'preview.example/path' },
      { ...headers, 'x-forwarded-host': 'user@preview.example' },
      { ...headers, 'x-forwarded-host': 'preview.example:invalid' },
      { ...headers, 'x-forwarded-proto': 'http' },
    ]
    for (const forwarding of malformedForwarding) {
      expect(
        (await readHttp(deployment.baseUrl, '/de', forwarding)).headers[
          'strict-transport-security'
        ],
      ).toBeUndefined()
    }
    await deployment.deploy('a')
  })

  test('a same-version policy-only update refreshes complete offline responses only after acceptance', async ({
    browser,
    robotsForPage,
  }) => {
    const pwaBrowser = await PwaBrowserControls.create(browser)
    const diagnostics = new SecurityDiagnostics()
    await diagnostics.observe(pwaBrowser.context)
    const page = await pwaBrowser.openPage()
    const { pwa, businessProfile, appShell, invoice, landing } =
      robotsForPage(page)
    const profile = createBusinessProfileScenario()
    try {
      await deployment.deploy('a')
      expect(deployment.version('a')).toBe(deployment.version('b'))
      await page.goto(`${deployment.baseUrl}/de/rechnung`)
      await pwa.acknowledgeRunningReleaseNotes()
      await pwa.expectOfflineReady()
      await appShell.navigateToBusinessProfile()
      await businessProfile.configureBusinessProfile(profile)
      await businessProfile.expectProfileSaved()
      await appShell.navigateToInvoice()
      await invoice.enterInvoiceNumber('security-update-draft')
      await pwaBrowser.createUnrelatedOriginCache(page)
      // Keep an old controlled client alive through document navigations. With
      // no old clients, browsers may naturally activate a waiting worker.
      const heldPage = await pwaBrowser.openPage(
        `${deployment.baseUrl}/de/rechnung`,
      )
      await robotsForPage(heldPage).invoice.expectReady()
      await appShell.navigateToBusinessProfile()
      await businessProfile.enterDetails({
        businessName: 'Unsaved security update',
      })
      await deployment.deploy('b')
      await pwaBrowser.requestWorkerUpdate(page)
      await pwa.expectUpdateAvailable()
      await pwa.applyUpdate()
      await businessProfile.expectUnsavedChangesWarning()
      await businessProfile.keepUnsavedChanges()
      await pwa.postponeUpdate()
      await businessProfile.expectFieldValue(
        'businessName',
        'Unsaved security update',
      )
      await businessProfile.saveProfile()
      await businessProfile.expectProfileSaved()
      await pwaBrowser.setOffline(true)
      // The landing route was prepared, but never visited online.
      const oldResponse = await page.goto(`${deployment.baseUrl}/de`)
      await landing.expectIntroduction()
      const oldPolicy = await oldResponse!.allHeaders()
      expect(oldPolicy['permissions-policy']).toBe(
        'camera=(), microphone=(), geolocation=()',
      )
      const oldCsp = oldPolicy['content-security-policy']
      const oldNonce = /'nonce-([^']+)'/.exec(oldCsp)![1]
      for (const script of await scriptAuthorizations(
        await oldResponse!.text(),
      ))
        expect(script.nonce).toBe(oldNonce)
      await pwa.expectUpdateAvailable()
      await pwaBrowser.setOffline(false)
      const reloaded = page.waitForEvent('framenavigated', {
        predicate: (frame) => frame === page.mainFrame(),
        timeout: 15_000,
      })
      await pwa.applyUpdate()
      await reloaded
      await landing.expectIntroduction()
      await pwaBrowser.setOffline(true)
      const newResponse = await page.reload()
      await landing.expectIntroduction()
      const newPolicy = await newResponse!.allHeaders()
      expect(newPolicy['permissions-policy']).toBe(
        'camera=(), microphone=(), geolocation=(), display-capture=()',
      )
      const newNonce = /'nonce-([^']+)'/.exec(
        newPolicy['content-security-policy'],
      )![1]
      expect(newNonce).not.toBe(oldNonce)
      for (const script of await scriptAuthorizations(
        await newResponse!.text(),
      ))
        expect(script.nonce).toBe(newNonce)
      await appShell.navigateToInvoice()
      await invoice.expectInvoiceNumber('security-update-draft')
      await appShell.navigateToBusinessProfile()
      await businessProfile.expectFieldValue(
        'businessName',
        'Unsaved security update',
      )
      expect(await pwaBrowser.cacheNames(page)).toContain(
        pwaBrowser.unrelatedCacheName,
      )
      expect(diagnostics.violations).toEqual([])
      expect(diagnostics.errors).toEqual([])
    } finally {
      await pwaBrowser.dispose()
      await deployment.deploy('a')
    }
  })
})
