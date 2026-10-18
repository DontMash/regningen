import { readFile, readdir } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from '../support/playwright/playwright'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { createInvoiceScenario } from '../scenarios/invoice'
import { ArtifactSupport } from '../support/playwright/artifacts'
import { PwaBrowserControls } from '../support/playwright/pwa-browser'
import { PwaBrowserCapabilities } from '../support/playwright/pwa-capabilities'
import { PwaDeployment } from '../support/playwright/pwa-deployment'
import { inspectHtml } from '../support/playwright/http-documents'
import { SecurityDiagnostics } from '../support/playwright/security'
import { RequestObserver } from '../support/playwright/requests'
import {
  landingVisibilityExample,
  landingVisibilityExamples,
  applicationVisibilityExamples,
} from '../scenarios/visibility'

const landingTitle = landingVisibilityExample.title
const updatedLandingTitle =
  'regningen – Rechnungen erstellen und als PDF herunterladen – Release B'

test('generated production workers prepare offline routes and prompt for same-version content updates', async ({
  browser,
  robotsForPage,
}) => {
  test.setTimeout(240_000)
  const deployment = await PwaDeployment.create()
  const pwaBrowser = await PwaBrowserControls.create(browser)
  const capabilities = new PwaBrowserCapabilities(pwaBrowser.context)
  const diagnostics = new SecurityDiagnostics()
  await diagnostics.observe(pwaBrowser.context)
  const releaseA = deployment.version('a')
  const releaseB = deployment.version('b')
  await capabilities.observeNotifications(deployment.baseUrl)
  const pageA = await pwaBrowser.openPage()
  const pageB = await pwaBrowser.openPage()
  const requests = new RequestObserver(pageA).observeRequests()
  const robotsA = robotsForPage(pageA)
  const robotsB = robotsForPage(pageB)
  const {
    appShell: shellA,
    landing: landingA,
    businessProfile: profileA,
    invoice: invoiceA,
    pwa: pwaA,
    settings: settingsA,
    releaseNotes: releaseNotesA,
  } = robotsA
  const {
    appShell: shellB,
    businessProfile: profileB,
    invoice: invoiceB,
    pwa: pwaB,
    releaseNotes: releaseNotesB,
  } = robotsB

  try {
    await deployment.deploy('a')
    const manifest = await readManifest(deployment.baseUrl)
    await expectGeneratedWorker(deployment.baseUrl, deployment, 'a')
    await expectManifestAssets(deployment.baseUrl, manifest)

    // Start on a public document without entering either Settings route.
    await pageA.goto(`${deployment.baseUrl}/de/rechnung`)
    await pwaA.acknowledgeRunningReleaseNotes()
    await shellA.expectApplicationShell()
    await pwaA.expectOfflineReady()
    expect(
      (await capabilities.notificationObservation(pageA)).permissionRequests,
    ).toBe(0)

    // Preparation must cover routes that have never been visited online.
    await pwaBrowser.setOffline(true)
    await pwaBrowser.announceOffline(pageA)
    await pageA.reload()
    await shellA.expectApplicationShell()
    await expectActiveMetadata(
      pageA,
      'Rechnung erstellen – regningen',
      `${deployment.baseUrl}/de/rechnung`,
    )
    const offlineManifest = await pwaBrowser.fetchResource(
      pageA,
      '/manifest.webmanifest',
    )
    expect(offlineManifest.status).toBe(200)
    expect(JSON.parse(offlineManifest.body)).toEqual(manifest)
    // The public landing document was not visited online in this browser.
    await pageA.goto(`${deployment.baseUrl}/de`)
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      landingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )
    await landingA.expectFeatureHeadings()
    await pageA.reload()
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      landingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )
    // Client navigation must retain the server-resolved policy without a network.
    await shellA.navigateToSettings()
    await settingsA.expectGeneralPage()
    await expectActiveMetadata(
      pageA,
      'Einstellungen – regningen',
      `${deployment.baseUrl}/de/einstellungen`,
    )
    await pageA.reload()
    await settingsA.expectGeneralPage()
    await settingsA.expectActivePage('Allgemein')
    await pageA.goto(`${deployment.baseUrl}/de/einstellungen/profil/`)
    await profileA.expectEditorReady()
    await expectActiveMetadata(
      pageA,
      'Unternehmensprofil – regningen',
      `${deployment.baseUrl}/de/einstellungen/profil`,
    )
    await pageA.reload()
    await profileA.expectEditorReady()
    await expectActiveMetadata(
      pageA,
      'Unternehmensprofil – regningen',
      `${deployment.baseUrl}/de/einstellungen/profil`,
    )
    await settingsA.expectActivePage('Profil')
    const profile = createBusinessProfileScenario()
    await profileA.configureBusinessProfile(profile)
    await profileA.expectProfileSaved()
    await expect(pageA).toHaveURL(
      `${deployment.baseUrl}/de/einstellungen/profil`,
    )
    await shellA.navigateToInvoice()

    await pageA.goto(`${deployment.baseUrl}/de/rechnung/`)
    await invoiceA.expectReady()
    const offlineInvoice = createInvoiceScenario({
      number: 'draft-tab-a',
      subject: '  Working offline  ',
      recipient: { company: 'Offline recipient' },
      positions: [{ description: 'Offline work', amount: '107,00' }],
      expected: {
        totals: { net: '100,00 €', tax: '7,00 €', gross: '107,00 €' },
        pdfText: [
          'Nordlicht Catering',
          'Offline recipient',
          'Rechnungsnummer draft-tab-a',
          'Working offline',
          'Offline work',
          '100,00 €',
          '7,00 €',
          '107,00 €',
        ],
      },
    })
    await invoiceA.enterInvoice(offlineInvoice.input)
    const unfinishedPosition = createInvoiceScenario({
      positions: [{ description: '  unfinished row  ', amount: 'not-money' }],
    }).input.positions[0]
    await invoiceA.enterNewPosition(unfinishedPosition)
    const expectedDate = await invoiceA.readSelectedDate()
    await pageA.reload()
    await invoiceA.expectInvoiceNumber('draft-tab-a')
    await invoiceA.expectSubject('  Working offline  ')
    await invoiceA.expectDateLabelMatches(new RegExp(expectedDate.trim()))
    await invoiceA.expectNewPositionValues({
      description: '  unfinished row  ',
      amount: 'not-money',
    })

    await pageB.goto(`${deployment.baseUrl}/de/rechnung`)
    await invoiceB.expectReady()
    const independentDraft = createInvoiceScenario({
      number: 'draft-tab-b',
      subject: 'Independent tab',
    })
    await invoiceB.enterInvoiceNumber(independentDraft.input.number)
    await invoiceB.enterSubject(independentDraft.input.subject)
    await pageB.goto(`${deployment.baseUrl}/de/einstellungen/profil`)
    await profileB.expectEditorReady()

    await shellA.navigateToSettings()
    await pwaA.enableNotifications()
    await pwaA.expectNotificationsEnabled()
    await pwaBrowser.createUnrelatedOriginCache(pageA)

    await pageA.goto(`${deployment.baseUrl}/de`)
    await shellA.expectApplicationShell()
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      landingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )
    await shellA.navigateToInvoice()
    await invoiceA.expectReady()
    await expectActiveMetadata(
      pageA,
      'Rechnung erstellen – regningen',
      `${deployment.baseUrl}/de/rechnung`,
    )
    await invoiceA.expectInvoiceNumber('draft-tab-a')
    await pageA.goto(`${deployment.baseUrl}/de/einstellungen/profil/`)
    await profileA.expectEditorReady()
    await profileA.expectFieldValue('businessName', profile.businessName)
    await shellA.navigateToInvoice()
    await invoiceA.expectReady()
    await invoiceA.expectNewPositionValues({
      description: '  unfinished row  ',
      amount: 'not-money',
    })

    // Capability controls are document-local; inject the failure only after
    // the last full navigation, so this really exercises notification failure.
    await capabilities.failNotificationDelivery(pageA)
    const download = await new ArtifactSupport(pageA).captureDownload(() =>
      invoiceA.createPdf(),
    )
    expect(download.suggestedFilename()).toMatch(
      /^Rechnung_draft-tab-a_.*\.pdf$/,
    )
    const pdf = await new ArtifactSupport(pageA).readPdf(download)
    expect(pdf.pageCount).toBe(1)
    for (const text of offlineInvoice.expected.pdfText) {
      expect(pdf.text).toContain(text)
    }
    await invoiceA.expectSummaryTotals(offlineInvoice.expected.totals)
    await invoiceA.expectPdfCreated()
    await invoiceA.expectInvoiceNumber('draft-tab-a')
    await expect
      .poll(
        async () =>
          (await capabilities.notificationObservation(pageA)).notifications,
      )
      .toHaveLength(1)
    expect(
      (await capabilities.notificationObservation(pageA)).failDelivery,
    ).toBe(true)
    const notification = (await capabilities.notificationObservation(pageA))
      .notifications[0]
    expect(notification.title).toBe('PDF wurde erstellt')
    expect(notification.body).toContain('Rechnung_draft-tab-a_')
    expect(notification.body).toContain(
      'Sie finden die Datei in den Downloads.',
    )
    await shellA.navigateToSettings()
    await pwaA.expectNotificationsEnabled()
    await settingsA.openProfile()
    await profileA.enterDetails({ businessName: 'Unsaved update in tab A' })
    await profileB.enterDetails({ businessName: 'Unsaved update in tab B' })
    await pwaBrowser.observeWorkerActivation(pageA)

    await pwaBrowser.setOffline(false)
    await deployment.deploy('b')
    await pwaBrowser.returnToForeground(pageA)
    await pwaBrowser.requestWorkerUpdate(pageA)
    await pwaA.expectUpdateAvailable()
    await pwaA.postponeUpdate()
    await pwaA.expectUpdateClosed()
    await pwaA.expectRunningVersion(releaseA)
    await expect(pageA).toHaveURL(
      `${deployment.baseUrl}/de/einstellungen/profil`,
    )
    await pwaA.reopenUpdate()
    await pwaA.applyUpdate()
    await profileA.expectUnsavedChangesWarning()
    await profileA.keepUnsavedChanges()
    expect(await pwaBrowser.workerState(pageA)).toMatchObject({
      waiting: 'installed',
      controllerChanges: 0,
    })
    await pwaA.postponeUpdate()
    await profileA.expectFieldValue('businessName', 'Unsaved update in tab A')
    await pwaA.reopenUpdate()

    const pageAReloaded = pageA.waitForEvent(
      'framenavigated',
      (frame) => frame === pageA.mainFrame(),
    )
    await pwaA.applyUpdate()
    await profileA.expectUnsavedChangesWarning()
    await profileA.discardUnsavedChanges()
    await pageAReloaded

    await expect(pageA).toHaveURL(
      `${deployment.baseUrl}/de/einstellungen/profil`,
    )
    await profileA.expectFieldValue('businessName', profile.businessName)
    await shellA.navigateToInvoice()
    await invoiceA.expectReady()
    await pwaA.expectRunningVersion(releaseB)
    await invoiceA.expectInvoiceNumber('draft-tab-a')
    await invoiceA.expectSubject('  Working offline  ')
    await invoiceA.expectNewPositionValues({
      description: '  unfinished row  ',
      amount: 'not-money',
    })
    await pwaA.expectReleaseBInvoiceAsset()
    await landingA.returnHome()
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      updatedLandingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )
    expect(inspectHtml(await pageA.content()).mainText).toContain(
      'Release B landing document fixture',
    )
    await shellA.navigateToSettings()
    await pwaA.expectNotificationsEnabled()
    await shellA.navigateToInvoice()

    await profileB.expectUnsavedChangesWarning()
    await profileB.keepUnsavedChanges()
    await profileB.expectFieldValue('businessName', 'Unsaved update in tab B')
    await expect(pageB).toHaveURL(
      `${deployment.baseUrl}/de/einstellungen/profil`,
    )
    await pwaB.reopenUpdate()
    const pageBReloaded = pageB.waitForEvent(
      'framenavigated',
      (frame) => frame === pageB.mainFrame(),
    )
    await pwaB.applyUpdate()
    await profileB.expectUnsavedChangesWarning()
    await profileB.discardUnsavedChanges()
    await pageBReloaded
    await expect(pageB).toHaveURL(
      `${deployment.baseUrl}/de/einstellungen/profil`,
    )
    await profileB.expectFieldValue('businessName', profile.businessName)
    await shellB.navigateToInvoice()
    await invoiceB.expectInvoiceNumber('draft-tab-b')
    await invoiceB.expectSubject('Independent tab')
    await pwaB.expectRunningVersion(releaseB)

    await expectGeneratedWorker(deployment.baseUrl, deployment, 'b')
    const workerA = await readFile(
      await deployment.artifactPath('a', 'public/sw.js'),
      'utf8',
    )
    const workerB = await readFile(
      await deployment.artifactPath('b', 'public/sw.js'),
      'utf8',
    )
    expect(workerA).not.toBe(workerB)
    for (const documentRevision of [
      /url:"\/de",revision:"([^"]+)"/,
      /url:"\/de\/rechnung",revision:"([^"]+)"/,
      /url:"\/en",revision:"([^"]+)"/,
      /url:"\/en\/invoice",revision:"([^"]+)"/,
    ]) {
      const revisionA = documentRevision.exec(workerA)?.[1]
      const revisionB = documentRevision.exec(workerB)?.[1]
      expect(revisionA).toBeTruthy()
      expect(revisionB).toBeTruthy()
      expect(revisionA).not.toBe(revisionB)
    }
    expect(workerA).toContain('/de/rechnung')
    expect(workerB).toContain('/de/einstellungen/profil')
    expect(workerB).toContain('/en/settings/profile')
    expect(workerB).not.toContain('/business-profile')

    await pwaBrowser.setOffline(true)
    await pageA.goto(`${deployment.baseUrl}/de`)
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      updatedLandingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )
    expect(inspectHtml(await pageA.content()).mainText).toContain(
      'Release B landing document fixture',
    )
    await pageA.reload()
    await expectActiveMetadata(
      pageA,
      updatedLandingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )
    expect(inspectHtml(await pageA.content()).mainText).toContain(
      'Release B landing document fixture',
    )
    await shellA.navigateToInvoice()
    await invoiceA.expectReady()
    await expectActiveMetadata(
      pageA,
      'Rechnung erstellen – regningen',
      `${deployment.baseUrl}/de/rechnung`,
    )
    await pwaA.expectReleaseBInvoiceAsset()
    await invoiceA.expectPdfEnabled()
    expect(await pwaBrowser.cacheNames(pageA)).toContain(
      pwaBrowser.unrelatedCacheName,
    )

    expect(diagnostics.violations).toEqual([])
    expect(diagnostics.errors).toEqual([])
    for (const request of requests.snapshot()) {
      expect(new URL(request.url).origin).toBe(deployment.baseUrl)
      expect(request.method).toBe('GET')
      expect(request.body).toBeNull()
      expect(request.url).not.toContain('draft-tab-a')
      expect(request.url).not.toContain(profile.businessName)
    }

    // User-data reset must not uninstall the production worker or erase downloads.
    await test.step('reset offline user data while preserving the worker and downloads', async () => {
      await shellA.navigateToSettings()
      await settingsA.requestReset()
      await settingsA.confirmReset()
      await releaseNotesA.expectReleaseNotesDialog()
      await releaseNotesB.expectReleaseNotesDialog()
      await releaseNotesA.acknowledgeReleaseNotes()
      await releaseNotesB.expectReleaseNotesClosed()
      await shellA.expectProfilePage()
      await profileA.expectFieldValue('businessName', '')
      await pageA.reload()
      await profileA.expectFieldValue('businessName', '')
      expect(await pwaBrowser.workerState(pageA)).toMatchObject({
        controlled: true,
        active: 'activated',
      })
      expect(await pwaBrowser.cacheNames(pageA)).toContain(
        pwaBrowser.unrelatedCacheName,
      )
      const preservedPdf = await new ArtifactSupport(pageA).readPdf(download)
      expect(preservedPdf.text).toBe(pdf.text)
      await shellA.navigateToSettings()
      await pwaA.expectNotificationsDisabled()
      expect(
        (await capabilities.notificationObservation(pageA)).permission,
      ).toBe('granted')
      await settingsA.openProfile()
      await shellB.expectProfilePage()
      await profileB.expectFieldValue('businessName', '')
      await profileA.configureBusinessProfile(createBusinessProfileScenario())
      await shellA.navigateToInvoice()
      await invoiceA.expectNewInvoiceDraft()
      await invoiceA.expectNewPositionValues({ description: '', amount: '' })
      await shellB.navigateToInvoice()
      await invoiceB.expectNewInvoiceDraft()
      await invoiceB.expectSubject('')
    })
  } finally {
    try {
      await pwaBrowser.dispose()
    } finally {
      await deployment.dispose()
    }
  }
})

test('a configuration-only rebuild refreshes offline visibility through the existing update flow', async ({
  browser,
  robotsForPage,
}) => {
  test.setTimeout(240_000)
  const updatedOrigin = 'https://configuration.example'
  const deployment = await PwaDeployment.create({
    updateKind: 'configuration',
    updateEnvironment: { ORIGIN: updatedOrigin },
  })
  const controls = await PwaBrowserControls.create(browser)
  const page = await controls.openPage()
  const { landing, pwa } = robotsForPage(page)
  try {
    expect(deployment.version('a')).toBe(deployment.version('b'))
    // The fixture changes configuration only, not client source or content.
    expect(
      await readdir(deployment.artifactPath('b', 'public/assets')),
    ).toEqual(await readdir(deployment.artifactPath('a', 'public/assets')))
    await deployment.deploy('a')
    await page.goto(`${deployment.baseUrl}/de`)
    await pwa.acknowledgeRunningReleaseNotes()
    await pwa.expectOfflineReady()
    const heldPage = await controls.openPage(`${deployment.baseUrl}/de`)
    await robotsForPage(heldPage).landing.expectIntroduction()
    await expectActiveMetadata(
      page,
      landingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )

    await deployment.deploy('b', { ORIGIN: updatedOrigin })
    await controls.requestWorkerUpdate(page)
    await pwa.expectUpdateAvailable()
    await pwa.postponeUpdate()
    await controls.setOffline(true)
    await page.reload()
    await landing.expectIntroduction()
    await expectActiveMetadata(
      page,
      landingTitle,
      `${deployment.baseUrl}/de`,
      true,
    )

    await controls.setOffline(false)
    const reloaded = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: 15_000,
    })
    await pwa.applyUpdate()
    await reloaded
    await landing.expectIntroduction()
    await controls.setOffline(true)
    await page.reload()
    await landing.expectIntroduction()
    await expectActiveMetadata(page, landingTitle, `${updatedOrigin}/de`, false)
  } finally {
    await controls.dispose()
    await deployment.dispose()
  }
})

test('an unreviewed copied-source license fails the production build without leaving a prior distributable output', async () => {
  test.setTimeout(240_000)
  const deployment = await PwaDeployment.create({ updates: false })
  const distributedFiles = [
    'LICENSE',
    'THIRD-PARTY-NOTICES.txt',
    'licensing-artifacts.json',
    'public/third-party-notices.txt',
    'server/index.mjs',
  ]
  try {
    // Establish a successful prior output before invalidating its reviewed
    // licensing input: a clean-directory failure alone cannot prove cleanup.
    for (const path of distributedFiles)
      expect(await readFile(deployment.buildOutputPath(path), 'utf8')).not.toBe(
        '',
      )

    await deployment.changeCopiedSourceLicense('Unreviewed-License-1.0')
    const build = await deployment.build({
      ORIGIN: deployment.baseUrl,
      TRUST_PROXY: 'false',
      HSTS_STAGE: 'off',
    })
    expect(build.exitCode, build.output).toBeGreaterThan(0)
    expect(build.output).toContain('Unreviewed-License-1.0')
    expect(build.output).toMatch(/review|policy/i)
    // Inspect the actual build output, not the intentionally retained archive
    // of release A used by the deployment/update harness.
    for (const path of distributedFiles)
      await expect(
        readFile(deployment.buildOutputPath(path)),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      })
  } finally {
    await deployment.dispose()
  }
})

test('unvisited notices stay complete offline and follow a postponed then accepted same-version notices-only update', async ({
  browser,
  robotsForPage,
}) => {
  test.setTimeout(240_000)
  const deployment = await PwaDeployment.create({ updateKind: 'notices' })
  const controls = await PwaBrowserControls.create(browser)
  const page = await controls.openPage()
  const { pwa, language, settings } = robotsForPage(page)
  const requests = new RequestObserver(page).observeRequests()
  const contextRequests = controls.observeRequestUrls()
  const updateText = '\nNotices-only release B fixture attribution\n'
  const noticesPages = [
    ['/de/einstellungen/lizenzen', 'de'],
    ['/en/settings/licenses', 'en'],
  ] as const

  try {
    expect(deployment.version('a')).toBe(deployment.version('b'))
    await deployment.deploy('a')
    // Preparation starts elsewhere: neither notices document nor the text
    // resource may rely on having been visited online in this browser.
    await page.goto(`${deployment.baseUrl}/de/rechnung`)
    await pwa.acknowledgeRunningReleaseNotes()
    await pwa.expectOfflineReady()
    expect(
      requests
        .snapshot()
        .filter(({ url }) =>
          [
            ...noticesPages.map(([path]) => path),
            '/third-party-notices.txt',
          ].some((path) => new URL(url).pathname === path),
        ),
    ).toEqual([])

    const projectLicense = (await readFile('LICENSE', 'utf8')).trim()
    const copiedSources = JSON.parse(
      await readFile('legal/copied-source.json', 'utf8'),
    ) as Array<{
      name: string
      version: string
      texts: Array<{ text: string }>
    }>
    const copiedSource = copiedSources[0]
    const copiedNotice = copiedSource.texts[0].text
    const noticesA = await readFile(
      deployment.artifactPath('a', 'THIRD-PARTY-NOTICES.txt'),
      'utf8',
    )
    expect(noticesA).toContain('Copyright (C) 2026 soren.codes')
    expect(noticesA).toContain(projectLicense)
    expect(noticesA).toContain(copiedNotice)
    expect(noticesA).not.toContain(updateText.trim())
    expect(
      await readFile(
        deployment.artifactPath('a', 'public/third-party-notices.txt'),
        'utf8',
      ),
    ).toBe(noticesA)

    await controls.setOffline(true)
    for (const [path, locale] of noticesPages) {
      await page.goto(`${deployment.baseUrl}${path}`)
      await language.expectInterfaceLanguage(locale)
      await settings.expectLicensesPage(locale)
      await settings.openNoticesTexts(copiedSource)
      await settings.expectNoticesText(projectLicense)
      await settings.expectNoticesText(copiedNotice)
      expect(
        await controls.fetchResource(page, '/third-party-notices.txt'),
      ).toEqual({
        status: 200,
        body: noticesA,
      })
      await page.reload()
      await settings.expectLicensesPage(locale)
      await settings.openNoticesTexts(copiedSource)
      await settings.expectNoticesText(projectLicense)
      await settings.expectNoticesText(copiedNotice)
    }

    // Keep one old-build document open during reloads, as in the other worker
    // acceptance journeys; no test-side worker installation or activation.
    const heldPage = await controls.openPage(
      `${deployment.baseUrl}/de/rechnung`,
    )
    await robotsForPage(heldPage).appShell.expectApplicationShell()
    await page.goto(`${deployment.baseUrl}/de/einstellungen/lizenzen`)
    await settings.expectLicensesPage('de')
    await settings.openNoticesTexts(copiedSource)
    await controls.observeWorkerActivation(page)
    await controls.setOffline(false)
    await deployment.deploy('b')
    await controls.requestWorkerUpdate(page)
    await pwa.expectUpdateAvailable()
    await pwa.postponeUpdate()
    await pwa.expectUpdateClosed()
    await settings.expectNoticesText(copiedNotice)
    await settings.expectNoNoticesText(updateText.trim())
    expect(
      await controls.fetchResource(page, '/third-party-notices.txt'),
    ).toEqual({
      status: 200,
      body: noticesA,
    })

    await controls.setOffline(true)
    await language.changeInterfaceLanguage('en')
    // Language changes reload the document. The existing updater may offer its
    // still-waiting worker again; postponement is not a cross-document veto.
    await pwa.expectUpdateAvailable()
    await pwa.postponeUpdate()
    await pwa.expectUpdateClosed()
    await settings.expectLicensesPage('en')
    await settings.openNoticesTexts(copiedSource)
    await settings.expectNoticesText(projectLicense)
    await settings.expectNoticesText(copiedNotice)
    await settings.expectNoNoticesText(updateText.trim())
    expect(
      await controls.fetchResource(page, '/third-party-notices.txt'),
    ).toEqual({
      status: 200,
      body: noticesA,
    })
    expect(await controls.workerState(page)).toMatchObject({
      waiting: 'installed',
      controllerChanges: 0,
    })
    await language.changeInterfaceLanguage('de')
    await pwa.expectUpdateAvailable()
    await pwa.postponeUpdate()
    await pwa.expectUpdateClosed()
    await settings.expectLicensesPage('de')
    await settings.expectNoNoticesText(updateText.trim())

    await controls.setOffline(false)
    await pwa.reopenUpdate()
    const reloaded = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: 15_000,
    })
    await pwa.applyUpdate()
    await reloaded
    await settings.expectLicensesPage('de')
    await settings.openNoticesTexts(copiedSource)
    await pwa.expectRunningVersion(deployment.version('b'))
    await settings.expectNoticesText(copiedNotice + updateText)
    const noticesB = await readFile(
      deployment.artifactPath('b', 'THIRD-PARTY-NOTICES.txt'),
      'utf8',
    )
    expect(noticesB).toContain(projectLicense)
    expect(noticesB).toContain(copiedNotice + updateText)
    expect(noticesB).not.toBe(noticesA)
    expect(
      await readFile(
        deployment.artifactPath('b', 'public/third-party-notices.txt'),
        'utf8',
      ),
    ).toBe(noticesB)

    await controls.setOffline(true)
    for (const [path, locale] of noticesPages) {
      await page.goto(`${deployment.baseUrl}${path}`)
      await settings.expectLicensesPage(locale)
      await settings.openNoticesTexts(copiedSource)
      await settings.expectNoticesText(projectLicense)
      await settings.expectNoticesText(copiedNotice + updateText)
      await page.reload()
      await settings.expectLicensesPage(locale)
      await settings.openNoticesTexts(copiedSource)
      await settings.expectNoticesText(copiedNotice + updateText)
      expect(
        await controls.fetchResource(page, '/third-party-notices.txt'),
      ).toEqual({
        status: 200,
        body: noticesB,
      })
    }
    for (const request of requests.snapshot()) {
      expect(new URL(request.url).origin).toBe(deployment.baseUrl)
      expect(request.method).toBe('GET')
      expect(request.body).toBeNull()
    }
    for (const url of contextRequests.snapshot())
      expect(new URL(url).origin).toBe(deployment.baseUrl)
  } finally {
    await controls.dispose()
    await deployment.dispose()
  }
})

test('one prepared worker opens both languages offline and exports a real English PDF without translation services', async ({
  browser,
  robotsForPage,
}) => {
  test.setTimeout(240_000)
  const deployment = await PwaDeployment.create({ updates: false })
  const controls = await PwaBrowserControls.create(browser)
  const page = await controls.openPage()
  const {
    pwa,
    language,
    businessProfile,
    invoice,
    appShell,
    settings,
    landing,
  } = robotsForPage(page)
  const requests = new RequestObserver(page).observeRequests()
  try {
    await deployment.deploy('a')
    await page.goto(`${deployment.baseUrl}/de/rechnung`)
    await pwa.acknowledgeRunningReleaseNotes()
    await pwa.expectOfflineReady()
    const manifest = await readManifest(deployment.baseUrl)
    await expectGeneratedWorker(deployment.baseUrl, deployment, 'a')
    await controls.setOffline(true)
    // These seven documents have not been visited online. Preparation, not
    // incidental navigation caching, must make direct entry and reload work.
    for (const [path, locale] of [
      ['/de', 'de'],
      ['/de/einstellungen', 'de'],
      ['/de/einstellungen/profil', 'de'],
      ['/en', 'en'],
      ['/en/invoice', 'en'],
      ['/en/settings', 'en'],
      ['/en/settings/profile', 'en'],
    ] as const) {
      await page.goto(`${deployment.baseUrl}${path}/`)
      await language.expectInterfaceLanguage(locale)
      await expect(page).toHaveURL(`${deployment.baseUrl}${path}`)
      await page.reload()
      await language.expectInterfaceLanguage(locale)
      const document = inspectHtml(await page.content())
      expect(document.canonicals).toEqual([`${deployment.baseUrl}${path}`])
      const expected = [
        ...landingVisibilityExamples,
        ...applicationVisibilityExamples,
      ].find((entry) => entry.path === path)!
      expect(document.title).toBe(expected.title)
      expect(document.metas.description).toEqual([expected.description])
      expect(document.metas.robots).toEqual([
        path === '/de' || path === '/en' ? 'index, follow' : 'noindex, follow',
      ])
      if (path === '/de' || path === '/en')
        await landing.expectIntroduction({ locale })
      if (path === '/en/invoice') await invoice.expectProfileSetupPrompt('en')
      if (path.endsWith('/profile'))
        await businessProfile.expectEditorReady('en')
      if (path === '/en/settings') await settings.expectGeneralPage('en')
    }
    await page.goto(`${deployment.baseUrl}/de/einstellungen/profil`)
    await businessProfile.configureBusinessProfile(
      createBusinessProfileScenario(),
    )
    await businessProfile.expectProfileSaved()
    await appShell.navigateToInvoice()
    const scenario = createInvoiceScenario()
    await invoice.enterInvoice(scenario.input)
    await language.changeInterfaceLanguage('en')
    await language.expectInterfaceLanguage('en')
    await invoice.expectReady('en')
    const artifacts = new ArtifactSupport(page)
    const download = await artifacts.captureDownload(() => invoice.createPdf())
    expect(download.suggestedFilename()).toBe('Invoice_2026-001_2026-06-15.pdf')
    const pdf = await artifacts.readPdf(download)
    expect(pdf.pageCount).toBe(1)
    for (const text of [
      'Invoice number 2026-001',
      'Date: 15/06/2026',
      'Nordlicht Catering',
      'Max Mustermann',
      'Catering für die Firmenfeier',
      'Net:',
      '€146.73',
      '7% VAT:',
      '€10.27',
      'Gross:',
      '€157.00',
    ])
      expect(pdf.text).toContain(text)
    expect(pdf.text).not.toContain('Rechnungsnummer')
    await invoice.expectPdfCreated()
    await page.goto(`${deployment.baseUrl}/en/settings`)
    await language.expectPreferences('en', 'auto')
    await language.chooseInvoiceLanguage('de')
    await page.reload()
    await language.expectPreferences('en', 'de')
    await page.goto(`${deployment.baseUrl}/en/invoice`)
    const germanDownload = await artifacts.captureDownload(() =>
      invoice.createPdf(),
    )
    expect(germanDownload.suggestedFilename()).toBe(
      'Rechnung_2026-001_2026-06-15.pdf',
    )
    const germanPdf = await artifacts.readPdf(germanDownload)
    for (const text of scenario.expected.pdfText)
      expect(germanPdf.text).toContain(text)
    const offlineManifest = await controls.fetchResource(
      page,
      '/manifest.webmanifest',
    )
    expect(JSON.parse(offlineManifest.body)).toEqual(manifest)
    expect(manifest.id).toBe('/')
    for (const locale of ['de', 'en']) {
      const localizedManifest = await controls.fetchResource(
        page,
        `/manifest-${locale}.webmanifest`,
      )
      expect(localizedManifest.status).toBe(200)
      expect(JSON.parse(localizedManifest.body)).toMatchObject({
        id: '/',
        start_url: '/',
        scope: '/',
        lang: locale,
        icons: manifest.icons,
      })
    }
    // Installed/unprefixed launch must honor the remembered English UI offline.
    await page.goto(deployment.baseUrl)
    await language.expectInterfaceLanguage('en')
    await expect(page).toHaveURL(`${deployment.baseUrl}/en`)
    await page.reload()
    await landing.expectIntroduction({ locale: 'en' })
    for (const request of requests.snapshot())
      expect(new URL(request.url).origin).toBe(deployment.baseUrl)
  } finally {
    await controls.dispose()
    await deployment.dispose()
  }
})

async function readManifest(baseUrl: string) {
  const response = await fetch(`${baseUrl}/manifest.webmanifest`)
  expect(response.ok).toBe(true)
  return (await response.json()) as {
    id: string
    name: string
    lang: string
    start_url: string
    scope: string
    icons: Array<{ src: string; sizes: string; purpose?: string }>
  }
}

async function expectGeneratedWorker(
  baseUrl: string,
  deployment: PwaDeployment,
  release: 'a' | 'b',
) {
  const response = await fetch(`${baseUrl}/sw.js`)
  expect(response.ok).toBe(true)
  expect(response.headers.get('cache-control')).toBe(
    'no-cache, no-store, must-revalidate',
  )
  const body = await response.text()
  expect(body).toContain('precacheAndRoute')
  for (const route of [
    '/de',
    '/de/rechnung',
    '/de/einstellungen',
    '/de/einstellungen/profil',
    '/de/einstellungen/lizenzen',
    '/en',
    '/en/invoice',
    '/en/settings',
    '/en/settings/profile',
    '/en/settings/licenses',
    'third-party-notices.txt',
  ]) {
    expect(body).toContain(route)
  }
  const artifact = await readFile(
    await deployment.artifactPath(release, 'public/sw.js'),
    'utf8',
  )
  expect(body.trim()).toBe(artifact.trim())

  const html = await (await fetch(baseUrl)).text()
  const stylesheets = [...html.matchAll(/<link\b([^>]+)>/g)]
    .filter(([, attributes]) => /rel="stylesheet"/.test(attributes))
    .map(([, attributes]) => attributes.match(/href="([^"]+)"/)?.[1])
    .filter((href): href is string => Boolean(href))
  expect(stylesheets.length).toBeGreaterThan(0)
  for (const stylesheet of stylesheets) {
    const styleResponse = await fetch(new URL(stylesheet, baseUrl))
    expect(styleResponse.ok, `stylesheet was not served: ${stylesheet}`).toBe(
      true,
    )
    expect(body).toContain(new URL(stylesheet, baseUrl).pathname.slice(1))
  }
}

async function expectManifestAssets(
  baseUrl: string,
  manifest: Awaited<ReturnType<typeof readManifest>>,
) {
  expect(manifest.name).toBe('regningen')
  expect(manifest.lang).toBe('de')
  expect(manifest.start_url).toBe('/')
  expect(manifest.scope).toBe('/')
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true)
  expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true)

  for (const icon of manifest.icons) {
    const response = await fetch(new URL(icon.src, baseUrl))
    expect(response.ok).toBe(true)
    const bytes = new DataView(await response.arrayBuffer())
    const [width, height] = icon.sizes.split('x').map(Number)
    expect(bytes.getUint32(16)).toBe(width)
    expect(bytes.getUint32(20)).toBe(height)
  }

  const shell = await fetch(baseUrl)
  expect(shell.ok).toBe(true)
  const html = await shell.text()
  expect(html).toContain('rel="apple-touch-icon"')
  expect(html).toContain('apple-touch-icon-180x180.png')
  const touchIcon = await fetch(`${baseUrl}/apple-touch-icon-180x180.png`)
  expect(touchIcon.ok).toBe(true)
  const touchIconBytes = new DataView(await touchIcon.arrayBuffer())
  expect(touchIconBytes.getUint32(16)).toBe(180)
  expect(touchIconBytes.getUint32(20)).toBe(180)
}

async function expectActiveMetadata(
  page: Page,
  title: string,
  canonical: string,
  indexable = false,
) {
  await expect(page).toHaveTitle(title)
  const document = inspectHtml(await page.content())
  expect(document.language).toBe('de')
  expect(document.canonicals).toEqual([canonical])
  expect(document.metas.robots).toEqual([
    indexable ? 'index, follow' : 'noindex, follow',
  ])
  expect(document.metas['og:title']).toEqual([title])
  expect(document.metas['twitter:title']).toEqual([title])
  expect(document.metas['og:url']).toEqual([canonical])
  const description = [
    landingVisibilityExample,
    ...applicationVisibilityExamples,
  ].find(
    (expected) => expected.path === new URL(canonical).pathname,
  )?.description
  expect(document.metas.description).toEqual([description])
  expect(document.metas['og:description']).toEqual([description])
  expect(document.metas['twitter:description']).toEqual([description])
  if (indexable) {
    expect(document.alternates).toEqual(
      expect.arrayContaining([
        { language: 'de', href: canonical },
        { language: 'en', href: `${new URL(canonical).origin}/en` },
        { language: 'x-default', href: canonical },
      ]),
    )
    expect(document.alternates).toHaveLength(3)
    expect(document.structuredData).toHaveLength(1)
    expect(document.structuredData[0]).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({ '@type': 'WebPage', name: title }),
      ]),
    })
  } else {
    expect(document.alternates).toEqual([])
    expect(document.structuredData).toEqual([])
  }
}
