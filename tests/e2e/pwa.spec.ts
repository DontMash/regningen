import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from '../support/playwright/playwright'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { createInvoiceScenario } from '../scenarios/invoice'
import { ArtifactSupport } from '../support/playwright/artifacts'
import { PwaBrowserControls } from '../support/playwright/pwa-browser'
import { PwaBrowserCapabilities } from '../support/playwright/pwa-capabilities'
import { PwaDeployment } from '../support/playwright/pwa-deployment'
import { inspectHtml } from '../support/playwright/http-documents'
import {
  landingVisibilityExample,
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
  const releaseA = deployment.version('a')
  const releaseB = deployment.version('b')
  await capabilities.observeNotifications(deployment.baseUrl)
  const pageA = await pwaBrowser.openPage()
  const pageB = await pwaBrowser.openPage()
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
    await pageA.goto(`${deployment.baseUrl}/invoice`)
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
      `${deployment.baseUrl}/invoice`,
    )
    const offlineManifest = await pwaBrowser.fetchResource(
      pageA,
      '/manifest.webmanifest',
    )
    expect(offlineManifest.status).toBe(200)
    expect(JSON.parse(offlineManifest.body)).toEqual(manifest)
    // The public landing document was not visited online in this browser.
    await pageA.goto(deployment.baseUrl)
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      landingTitle,
      `${deployment.baseUrl}/`,
      true,
    )
    await landingA.expectFeatureHeadings()
    await pageA.reload()
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      landingTitle,
      `${deployment.baseUrl}/`,
      true,
    )
    // Client navigation must retain the server-resolved policy without a network.
    await shellA.navigateToSettings()
    await settingsA.expectGeneralPage()
    await expectActiveMetadata(
      pageA,
      'Einstellungen – regningen',
      `${deployment.baseUrl}/settings`,
    )
    await pageA.reload()
    await settingsA.expectGeneralPage()
    await settingsA.expectActivePage('Allgemein')
    await pageA.goto(`${deployment.baseUrl}/settings/profile/`)
    await profileA.expectEditorReady()
    await expectActiveMetadata(
      pageA,
      'Unternehmensprofil – regningen',
      `${deployment.baseUrl}/settings/profile`,
    )
    await pageA.reload()
    await profileA.expectEditorReady()
    await expectActiveMetadata(
      pageA,
      'Unternehmensprofil – regningen',
      `${deployment.baseUrl}/settings/profile`,
    )
    await settingsA.expectActivePage('Profil')
    const profile = createBusinessProfileScenario()
    await profileA.configureBusinessProfile(profile)
    await profileA.expectProfileSaved()
    await expect(pageA).toHaveURL(`${deployment.baseUrl}/settings/profile/`)
    await shellA.navigateToInvoice()

    await pageA.goto(`${deployment.baseUrl}/invoice/`)
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

    await pageB.goto(`${deployment.baseUrl}/invoice`)
    await invoiceB.expectReady()
    const independentDraft = createInvoiceScenario({
      number: 'draft-tab-b',
      subject: 'Independent tab',
    })
    await invoiceB.enterInvoiceNumber(independentDraft.input.number)
    await invoiceB.enterSubject(independentDraft.input.subject)
    await pageB.goto(`${deployment.baseUrl}/settings/profile`)
    await profileB.expectEditorReady()

    await shellA.navigateToSettings()
    await pwaA.enableNotifications()
    await pwaA.expectNotificationsEnabled()
    await capabilities.failNotificationDelivery(pageA)
    await pwaBrowser.createUnrelatedOriginCache(pageA)

    await pageA.goto(deployment.baseUrl)
    await shellA.expectApplicationShell()
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      landingTitle,
      `${deployment.baseUrl}/`,
      true,
    )
    await shellA.navigateToInvoice()
    await invoiceA.expectReady()
    await expectActiveMetadata(
      pageA,
      'Rechnung erstellen – regningen',
      `${deployment.baseUrl}/invoice`,
    )
    await invoiceA.expectInvoiceNumber('draft-tab-a')
    await pageA.goto(`${deployment.baseUrl}/settings/profile/`)
    await profileA.expectEditorReady()
    await profileA.expectFieldValue('businessName', profile.businessName)
    await shellA.navigateToInvoice()
    await invoiceA.expectReady()
    await invoiceA.expectNewPositionValues({
      description: '  unfinished row  ',
      amount: 'not-money',
    })

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
    const notification = (await capabilities.notificationObservation(pageA))
      .notifications[0]
    expect(notification.title).toBe('PDF wurde erstellt')
    expect(notification.body).toContain('Rechnung_draft-tab-a_')
    expect(notification.body).toContain('Du findest es in den Downloads.')
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
    await expect(pageA).toHaveURL(`${deployment.baseUrl}/settings/profile`)
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

    await expect(pageA).toHaveURL(`${deployment.baseUrl}/settings/profile`)
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
      `${deployment.baseUrl}/`,
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
    await expect(pageB).toHaveURL(`${deployment.baseUrl}/settings/profile`)
    await pwaB.reopenUpdate()
    const pageBReloaded = pageB.waitForEvent(
      'framenavigated',
      (frame) => frame === pageB.mainFrame(),
    )
    await pwaB.applyUpdate()
    await profileB.expectUnsavedChangesWarning()
    await profileB.discardUnsavedChanges()
    await pageBReloaded
    await expect(pageB).toHaveURL(`${deployment.baseUrl}/settings/profile`)
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
      /url:"\/",revision:"([^"]+)"/,
      /url:"\/invoice",revision:"([^"]+)"/,
    ]) {
      const revisionA = documentRevision.exec(workerA)?.[1]
      const revisionB = documentRevision.exec(workerB)?.[1]
      expect(revisionA).toBeTruthy()
      expect(revisionB).toBeTruthy()
      expect(revisionA).not.toBe(revisionB)
    }
    expect(workerA).toContain('/invoice')
    expect(workerB).toContain('/settings/profile')
    expect(workerB).toContain('/settings')
    expect(workerB).not.toContain('/business-profile')

    await pwaBrowser.setOffline(true)
    await pageA.goto(deployment.baseUrl)
    await landingA.expectIntroduction()
    await expectActiveMetadata(
      pageA,
      updatedLandingTitle,
      `${deployment.baseUrl}/`,
      true,
    )
    expect(inspectHtml(await pageA.content()).mainText).toContain(
      'Release B landing document fixture',
    )
    await pageA.reload()
    await expectActiveMetadata(
      pageA,
      updatedLandingTitle,
      `${deployment.baseUrl}/`,
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
      `${deployment.baseUrl}/invoice`,
    )
    await pwaA.expectReleaseBInvoiceAsset()
    await invoiceA.expectPdfEnabled()
    expect(await pwaBrowser.cacheNames(pageA)).toContain(
      pwaBrowser.unrelatedCacheName,
    )

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

async function readManifest(baseUrl: string) {
  const response = await fetch(`${baseUrl}/manifest.webmanifest`)
  expect(response.ok).toBe(true)
  return (await response.json()) as {
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
  for (const route of ['/', '/invoice', '/settings', '/settings/profile']) {
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
        { language: 'x-default', href: canonical },
      ]),
    )
    expect(document.alternates).toHaveLength(2)
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
