import { expect, test } from '../support/playwright/playwright'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { createInvoiceScenario } from '../scenarios/invoice'
import { PwaDeployment } from '../support/playwright/pwa-deployment'

// Each parallel worker prepares its own real deployment; browser contexts remain isolated.
let deployment: PwaDeployment

test.beforeAll(async () => {
  test.setTimeout(240_000)
  deployment = await PwaDeployment.create({ updates: false })
  await deployment.deploy('a')
})
test.beforeEach(async () => deployment.deploy('a'))
test.afterAll(async () => deployment.dispose())

test('keeps home stable until a keyboard action opens actual first-time profile setup', async ({
  harness,
  releaseNotes,
  landing,
  appShell,
}) => {
  await harness.open(`${deployment.baseUrl}/`)
  await releaseNotes.dismissReleaseNotes()
  await landing.expectIntroduction()
  await landing.startInvoiceWithKeyboard()
  await appShell.expectProfilePage()
  await landing.expectVisibility(
    'Unternehmensprofil – regningen',
    `${deployment.baseUrl}/de/einstellungen/profil`,
  )
})

test('uses the saved profile only after explicit entry and clears stale head information across application navigation', async ({
  harness,
  releaseNotes,
  landing,
  appShell,
  businessProfile,
  invoice,
  settings,
  requests,
}) => {
  const observation = requests.observeRequests()
  await harness.open(`${deployment.baseUrl}/settings/profile`)
  await releaseNotes.dismissReleaseNotes()
  const profile = createBusinessProfileScenario({
    businessName: 'Privatbetrieb Nichtveröffentlichen',
    ownerName: 'Geheime Inhaberin',
  })
  await businessProfile.configureBusinessProfile(profile)
  await landing.returnHome()
  await landing.expectIntroduction()
  await landing.expectVisibility(
    'regningen – Rechnungen erstellen und als PDF herunterladen',
    `${deployment.baseUrl}/de`,
    true,
  )
  await landing.startInvoice('final')
  await invoice.expectReady()
  const draft = createInvoiceScenario({
    number: 'PRIVAT-93821',
    recipient: { company: 'Privatempfänger Nichtveröffentlichen' },
    subject: 'Geheimer Entwurf',
    positions: [{ description: 'Vertrauliche Position', amount: '119,00' }],
  })
  await invoice.enterInvoice(draft.input)
  await landing.expectVisibility(
    'Rechnung erstellen – regningen',
    `${deployment.baseUrl}/de/rechnung`,
  )
  await appShell.navigateToSettings()
  await settings.expectGeneralPage()
  await landing.expectVisibility(
    'Einstellungen – regningen',
    `${deployment.baseUrl}/de/einstellungen`,
  )
  await settings.openProfile()
  await landing.expectVisibility(
    'Unternehmensprofil – regningen',
    `${deployment.baseUrl}/de/einstellungen/profil`,
  )
  await landing.returnHome()
  await landing.expectIntroduction()
  await landing.expectVisibility(
    'regningen – Rechnungen erstellen und als PDF herunterladen',
    `${deployment.baseUrl}/de`,
    true,
  )
  const publicInformation = JSON.stringify(await landing.publicInformation())
  for (const value of [
    profile.businessName,
    profile.ownerName,
    draft.input.number,
    draft.input.subject,
    'Privatempfänger Nichtveröffentlichen',
    'Vertrauliche Position',
  ]) {
    expect(publicInformation).not.toContain(value)
    expect(JSON.stringify(observation.snapshot())).not.toContain(value)
    for (const path of ['/sitemap.xml', '/llms.txt', '/robots.txt']) {
      expect(
        await (await fetch(`${deployment.baseUrl}${path}`)).text(),
      ).not.toContain(value)
    }
  }
})

test('returns to profile setup after incomplete working details are discarded instead of pretending they were saved', async ({
  harness,
  releaseNotes,
  landing,
  businessProfile,
  appShell,
}) => {
  await harness.open(`${deployment.baseUrl}/settings/profile`)
  await releaseNotes.dismissReleaseNotes()
  await businessProfile.enterDetails({
    businessName: 'Unvollständiger Beispielbetrieb',
  })
  await landing.returnHome()
  await businessProfile.expectUnsavedChangesWarning()
  await businessProfile.discardUnsavedChanges()
  await landing.expectIntroduction()
  await landing.startInvoice('final')
  await appShell.expectProfilePage()
  await businessProfile.expectFieldValue('businessName', '')
})

test('keeps the public explanation readable when profile storage is unavailable', async ({
  harness,
  releaseNotes,
  landing,
  storageFaults,
}) => {
  await storageFaults.preventProfileReads()
  await harness.open(`${deployment.baseUrl}/`)
  await releaseNotes.dismissReleaseNotes()
  await landing.expectIntroduction()
  await landing.startInvoice()
  await landing.expectEntryError()
})

test('shows six readable features in light and dark narrow layouts and honors reduced motion', async ({
  harness,
  releaseNotes,
  landing,
  layout,
  theme,
  appShell,
}) => {
  await harness.setViewport(320, 720)
  await harness.useReducedMotion('reduce')
  await harness.open(`${deployment.baseUrl}/`)
  await releaseNotes.dismissReleaseNotes()
  for (const appearance of ['light', 'dark'] as const) {
    await harness.useSystemTheme(appearance)
    await theme.expectResolvedTheme(appearance)
    await landing.expectFeatureHeadings()
    expect(await layout.documentOverflows()).toBe(false)
  }
  await appShell.expectSmoothScrollBehavior('auto')
})

test('retains a foreign deployment’s exclusion policy through hydration and client navigation', async ({
  harness,
  releaseNotes,
  landing,
  appShell,
}) => {
  await deployment.deploy('a', { ORIGIN: 'https://regningen.soren.codes' })
  await harness.open(`${deployment.baseUrl}/`)
  await releaseNotes.dismissReleaseNotes()
  await landing.expectIntroduction()
  await landing.expectVisibility(
    'regningen – Rechnungen erstellen und als PDF herunterladen',
    'https://regningen.soren.codes/de',
  )
  await landing.startInvoice()
  await appShell.expectProfilePage()
  await landing.expectVisibility(
    'Unternehmensprofil – regningen',
    'https://regningen.soren.codes/de/einstellungen/profil',
  )
  await landing.returnHome()
  await landing.expectVisibility(
    'regningen – Rechnungen erstellen und als PDF herunterladen',
    'https://regningen.soren.codes/de',
  )
})
