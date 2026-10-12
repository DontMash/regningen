import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/playwright/playwright'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { createInvoiceScenario } from '../scenarios/invoice'
import { ArtifactSupport } from '../support/playwright/artifacts'
import { PwaBrowserControls } from '../support/playwright/pwa-browser'
import { PwaBrowserCapabilities } from '../support/playwright/pwa-capabilities'
import { PwaDeployment } from '../support/playwright/pwa-deployment'

test('a staged production release preserves both tabs and the offline Invoice workflow', async ({
  browser,
  robotsForPage,
}) => {
  test.setTimeout(240_000)
  const deployment = await PwaDeployment.create()
  const pwaBrowser = await PwaBrowserControls.create(browser)
  const capabilities = new PwaBrowserCapabilities(pwaBrowser.context)
  await capabilities.observeNotifications(deployment.baseUrl)
  const pageA = await pwaBrowser.openPage()
  const pageB = await pwaBrowser.openPage()
  const robotsA = robotsForPage(pageA)
  const robotsB = robotsForPage(pageB)
  const {
    appShell: shellA,
    businessProfile: profileA,
    invoice: invoiceA,
    pwa: pwaA,
  } = robotsA
  const {
    appShell: shellB,
    businessProfile: profileB,
    invoice: invoiceB,
    pwa: pwaB,
  } = robotsB
  const releaseA = deployment.version('a')
  const releaseB = deployment.version('b')

  try {
    await deployment.deploy('a')
    const manifestA = await readManifest(deployment.baseUrl)
    await expectProductionWorkerHeaders(deployment.baseUrl)
    await expectManifestIcons(deployment.baseUrl, manifestA)

    await pageA.goto(deployment.baseUrl)
    await pwaA.acknowledgeRunningReleaseNotes()
    await shellA.expectApplicationShell()
    await pwaA.expectOfflineReady()
    expect(
      (await capabilities.notificationObservation(pageA)).permissionRequests,
    ).toBe(0)
    await pwaA.enableNotifications()
    await pwaA.expectNotificationsEnabled()

    await pwaBrowser.createUnrelatedOriginCache(pageA)
    const applicationCachesBeforeUpdate =
      await pwaBrowser.applicationCacheNames(pageA)
    expect(applicationCachesBeforeUpdate).toHaveLength(1)

    const profile = createBusinessProfileScenario()
    const profileRobot = profileA
    await pwaBrowser.setOffline(true)
    await pageA.goto(`${deployment.baseUrl}/business-profile`)
    await profileRobot.expectEditorReady()
    await pwaBrowser.announceOffline(pageA)
    await profileRobot.configureBusinessProfile(profile)
    await pageA.goto(deployment.baseUrl)
    await pageA.waitForURL(`${deployment.baseUrl}/invoice`)
    await invoiceA.expectReady()

    const today = localIsoDate(new Date())
    const threeDaysAgo = localIsoDate(
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    )
    const postponedSubject = 'Still editable after postponing'
    const scenarioA = createInvoiceScenario({
      number: 'PWA-ALPHA',
      date: today,
      subject: 'Offline Invoice after update',
      positions: [{ description: 'Offline work', amount: '107,00' }],
    })
    const scenarioB = createInvoiceScenario({
      number: 'PWA-BETA',
      date: threeDaysAgo,
      subject: 'Draft kept on Profile route',
      vatRate: 19,
      recipient: {
        company: 'Other recipient',
        name: 'Different person',
        street: 'Second Street 9',
        postalCode: '10115',
        town: 'Berlin',
      },
      positions: [{ description: 'Incomplete tab work', amount: '81,60' }],
    })

    await pageB.goto(`${deployment.baseUrl}/invoice`)
    await invoiceB.expectReady()
    await invoiceB.enterInvoiceNumber(scenarioB.input.number)
    await invoiceB.chooseInvoiceDate(scenarioB.input.date)
    await invoiceB.enterSubject(scenarioB.input.subject)
    await invoiceB.enterRecipient(scenarioB.input.recipient)
    await invoiceB.addPosition(scenarioB.input.positions[0])
    await invoiceB.chooseVatRate(scenarioB.input.vatRate)
    await invoiceB.enterNewPosition({
      description: 'Unsubmitted B',
      amount: '0,',
    })
    await shellB.navigateToBusinessProfile()
    await profileB.expectEditorReady()

    await shellA.navigateToInvoice()
    await invoiceA.expectReady()
    await invoiceA.enterInvoice(scenarioA.input)
    await invoiceA.enterNewPosition({
      description: 'Unsubmitted A',
      amount: 'not-money',
    })

    await pwaBrowser.setOffline(false)
    await deployment.deploy('b')
    await pwaBrowser.returnToForeground(pageA)
    await pwaA.expectStagedVersion(releaseB, releaseA)
    await pwaA.postponeStagedUpdate()
    await pwaA.expectStagedUpdateClosed()
    await expect(pageA).toHaveURL(`${deployment.baseUrl}/invoice`)
    await invoiceA.enterSubject(postponedSubject)
    await pwaA.reopenStagedUpdate()

    await pwaBrowser.withSnapshotWritesBlocked(pageB, async () => {
      await pwaA.applyStagedUpdate()
      await pwaA.expectUpdateDeferred(
        'Ein geöffnetes Fenster konnte seine Eingaben nicht sicher vorbereiten. Alle Fenster bleiben geöffnet.',
      )
      await pwaA.postponeStagedUpdate()
      await pwaA.expectRunningVersion(releaseA)
      await invoiceA.expectSubject(postponedSubject)
      await invoiceA.enterSubject(postponedSubject)
    })

    await pwaA.reopenStagedUpdate()
    const heldPreparation = await pwaBrowser.holdPreparationResponse(pageB)
    await pwaA.applyStagedUpdate()
    await heldPreparation.waitUntilPrepared()
    const latePage = await pwaBrowser.openPage(
      `${deployment.baseUrl}/business-profile`,
    )
    try {
      await robotsForPage(latePage).pwa.expectStagedVersion(releaseB, releaseA)
      await heldPreparation.release()
      await pwaA.expectUpdateDeferred(
        'Die geöffneten Fenster haben sich während der Vorbereitung geändert. Bitte später erneut versuchen.',
      )
    } finally {
      await pwaBrowser.closePage(latePage)
    }
    await pwaA.postponeStagedUpdate()
    await invoiceA.enterSubject(postponedSubject)
    await pwaA.reopenStagedUpdate()

    const pageAReloaded = pageA.waitForEvent(
      'framenavigated',
      (frame) => frame === pageA.mainFrame(),
    )
    const pageBReloaded = pageB.waitForEvent(
      'framenavigated',
      (frame) => frame === pageB.mainFrame(),
    )
    await pwaA.applyStagedUpdate()
    await Promise.all([pageAReloaded, pageBReloaded])

    await expect(pageA).toHaveURL(`${deployment.baseUrl}/invoice`)
    await invoiceA.expectReady()
    await pwaA.expectRunningVersion(releaseB)
    await invoiceA.expectInvoiceNumber(scenarioA.input.number)
    await invoiceA.expectSubject(postponedSubject)
    await invoiceA.expectSelectedDate(scenarioA.input.date)
    await invoiceA.expectRecipientField('name', scenarioA.input.recipient.name)
    await invoiceA.expectPositionValue(
      1,
      'description',
      scenarioA.input.positions[0].description,
    )
    await invoiceA.expectNewPositionValues({
      description: 'Unsubmitted A',
      amount: 'not-money',
    })
    await pwaA.expectReleaseBInvoiceAsset()

    await expect(pageB).toHaveURL(`${deployment.baseUrl}/business-profile`)
    await profileB.expectEditorReady()
    await profileB.expectFieldValue('businessName', profile.businessName)
    await shellB.navigateToInvoice()
    await invoiceB.expectReady()
    await invoiceB.expectInvoiceNumber(scenarioB.input.number)
    await invoiceB.expectSubject(scenarioB.input.subject)
    await invoiceB.expectSelectedDate(scenarioB.input.date)
    await invoiceB.expectVatRate(19)
    await invoiceB.expectNewPositionValues({
      description: 'Unsubmitted B',
      amount: '0,',
    })
    await pwaB.expectReleaseBInvoiceAsset()

    await pwaA.expectStagedUpdateClosed()
    const manifestB = await readManifest(deployment.baseUrl)
    expect(manifestB).toEqual(manifestA)
    await expectProductionWorkerHeaders(deployment.baseUrl)
    const releaseAWorker = await readFile(
      await deployment.artifactPath('a', 'public/sw.js'),
      'utf8',
    )
    const releaseBWorker = await readFile(
      await deployment.artifactPath('b', 'public/sw.js'),
      'utf8',
    )
    expect(releaseAWorker).not.toBe(releaseBWorker)
    const invoiceAsset = (worker: string) =>
      worker.match(/\/assets\/invoice-[^"'\\]+\.js/)?.[0]
    expect(invoiceAsset(releaseAWorker)).toBeTruthy()
    expect(invoiceAsset(releaseBWorker)).toBeTruthy()
    expect(invoiceAsset(releaseBWorker)).not.toBe(invoiceAsset(releaseAWorker))

    const cacheNamesAfterUpdate = await pwaBrowser.cacheNames(pageA)
    expect(cacheNamesAfterUpdate).toContain(pwaBrowser.unrelatedCacheName)
    expect(cacheNamesAfterUpdate).not.toContain(
      applicationCachesBeforeUpdate[0],
    )

    await pwaBrowser.setOffline(true)
    await pageB.goto(`${deployment.baseUrl}/business-profile`)
    await profileB.expectEditorReady()
    await invoiceA.expectReady()
    await pwaA.expectReleaseBInvoiceAsset()
    await invoiceA.expectPdfEnabled()
    await pwaA.expectNotificationsEnabled()
    await capabilities.failNotificationDelivery(pageA)

    const download = await new ArtifactSupport(pageA).captureDownload(() =>
      invoiceA.createPdf(),
    )
    expect(download.suggestedFilename()).toBe(`Rechnung_PWA-ALPHA_${today}.pdf`)
    const pdf = await new ArtifactSupport(pageA).readPdf(download)
    expect(pdf.pageCount).toBe(1)
    expect(pdf.text).toContain(profile.businessName)
    expect(pdf.text).toContain(postponedSubject)
    expect(pdf.text).toContain('Offline work')
    expect(pdf.text).toContain('107,00 €')
    await invoiceA.expectPdfCreated()
    await invoiceA.expectInvoiceNumber(scenarioA.input.number)
    expect(
      (await capabilities.notificationObservation(pageA)).notifications,
    ).toEqual([
      {
        title: 'PDF wurde erstellt',
        body: `Rechnung_PWA-ALPHA_${today}.pdf wurde heruntergeladen. Du findest es in den Downloads.`,
      },
    ])
    await pageA.reload()
    await invoiceA.expectReady()
    await pwaA.expectReleaseBInvoiceAsset()
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
  return (await response.json()) as Record<string, unknown>
}

async function expectProductionWorkerHeaders(baseUrl: string) {
  const worker = await fetch(`${baseUrl}/sw.js`)
  expect(worker.ok).toBe(true)
  expect(worker.headers.get('cache-control')).toBe(
    'no-cache, no-store, must-revalidate',
  )
  const release = await fetch(`${baseUrl}/pwa-release.json`)
  expect(release.ok).toBe(true)
  expect(release.headers.get('cache-control')).toBe('no-cache')
}

async function expectManifestIcons(
  baseUrl: string,
  manifest: Record<string, unknown>,
) {
  expect(manifest.name).toBe('regningen')
  expect(manifest.start_url).toBe('/')
  expect(manifest.scope).toBe('/')
  const icons = manifest.icons as Array<{ src: string; sizes: string }>
  const expectedIcons = [
    ['/icons/icon-192.png', 192],
    ['/icons/icon-512.png', 512],
    ['/icons/icon-maskable-192.png', 192],
    ['/icons/icon-maskable-512.png', 512],
  ] as const

  for (const [path, expectedSize] of expectedIcons) {
    expect(icons.some((icon) => icon.src === path)).toBe(true)
    const response = await fetch(`${baseUrl}${path}`)
    expect(response.ok).toBe(true)
    const bytes = new DataView(await response.arrayBuffer())
    expect(bytes.getUint32(16)).toBe(expectedSize)
    expect(bytes.getUint32(20)).toBe(expectedSize)
  }

  const appleTouchIcon = await fetch(`${baseUrl}/icons/apple-touch-icon.png`)
  expect(appleTouchIcon.ok).toBe(true)
  const appleIconBytes = new DataView(await appleTouchIcon.arrayBuffer())
  expect(appleIconBytes.getUint32(16)).toBe(180)
  expect(appleIconBytes.getUint32(20)).toBe(180)
}

function localIsoDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}
