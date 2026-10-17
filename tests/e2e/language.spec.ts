import { expect, test } from '../support/playwright/playwright'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { createInvoiceScenario } from '../scenarios/invoice'

test('declares German as the application language', async ({
  harness,
  language,
  releaseNotes,
}) => {
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()
  await language.expectGermanLanguage()
  await language.expectHeaderChoices('de')
})

test('the menu language switch retains the logical page, query and fragment at mobile width', async ({
  harness,
  appShell,
  language,
  releaseNotes,
  page,
}) => {
  await harness.setViewport(390, 844)
  await harness.open('/de/einstellungen?source=language-test#preferences')
  await releaseNotes.acknowledgeReleaseNotes()
  await appShell.openMenu()
  await language.expectInterfaceLanguage('de')
  await language.expectHeaderChoices('de')
  await language.changeInterfaceLanguageWithKeyboard('en')
  await expect(page).toHaveURL(
    /\/en\/settings\?source=language-test#preferences$/,
  )
  await appShell.expectMenuClosed()
  await language.expectPreferences('en', 'auto')
  await appShell.openMenu()
  await language.expectInterfaceLanguage('en')
  await language.expectHeaderChoices('en')
  await appShell.closeMenu()
  await language.expectPreferences('en', 'auto')
  await language.changeInterfaceLanguageInSettings('de')
  await expect(page).toHaveURL(
    /\/de\/einstellungen\?source=language-test#preferences$/,
  )
  await language.expectPreferences('de', 'auto')
  await appShell.openMenu()
  await language.expectInterfaceLanguage('de')
  await appShell.closeMenu()
  await language.expectPreferences('de', 'auto')
})

test('English introduction entry retains English for first-time setup and configured invoicing', async ({
  harness,
  releaseNotes,
  landing,
  businessProfile,
  invoice,
  language,
  page,
}) => {
  await harness.open('/en')
  await releaseNotes.acknowledgeReleaseNotes()
  await landing.expectIntroduction({ locale: 'en' })
  await landing.startInvoice('hero', 'en')
  await businessProfile.expectEditorReady('en')
  await expect(page).toHaveURL(/\/en\/settings\/profile$/)
  await language.expectInterfaceLanguage('en')
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await businessProfile.expectProfileSaved()
  await landing.returnHome()
  await landing.startInvoice('final', 'en')
  await invoice.expectReady('en')
  await expect(page).toHaveURL(/\/en\/invoice$/)
})

test('fixed Invoice Language persists across UI switches and returning to automatic changes the same draft PDF', async ({
  harness,
  language,
  businessProfile,
  releaseNotes,
  appShell,
  invoice,
  artifacts,
}) => {
  const pageErrors = harness.observePageErrors()
  await harness.open('/de/einstellungen/profil')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await businessProfile.expectProfileSaved()
  await appShell.navigateToInvoice()
  const scenario = createInvoiceScenario()
  await invoice.enterInvoice(scenario.input)
  await language.expectNoInvoiceLanguageControl()

  await appShell.navigateToSettings()
  await language.expectPreferences('de', 'auto')
  await language.chooseInvoiceLanguage('en')
  await language.changeInterfaceLanguage('en')
  await language.expectInterfaceLanguage('en')
  await harness.reload()
  await language.expectPreferences('en', 'en')
  await language.chooseInvoiceLanguage('de')
  await harness.open('/en/invoice')
  await invoice.expectReady('en')
  await invoice.expectInvoiceNumber(scenario.input.number)
  await invoice.expectSubject(scenario.input.subject)
  await invoice.expectSummaryTotals({
    net: '€146.73',
    tax: '€10.27',
    gross: '€157.00',
  })
  const germanDownload = await artifacts.captureDownload(() =>
    invoice.createPdf(),
  )
  expect(germanDownload.suggestedFilename()).toBe(
    'Rechnung_2026-001_2026-06-15.pdf',
  )
  const germanPdf = await artifacts.readPdf(germanDownload)
  expect(germanPdf.pageCount).toBe(1)
  for (const text of scenario.expected.pdfText)
    expect(germanPdf.text).toContain(text)
  await invoice.expectPdfCreated()

  await harness.open('/en/settings')
  await language.chooseInvoiceLanguage('en')
  await language.changeInterfaceLanguage('de')
  await language.expectInterfaceLanguage('de')
  await harness.reload()
  await language.expectPreferences('de', 'en')
  await harness.open('/de/rechnung')
  const englishDownload = await artifacts.captureDownload(() =>
    invoice.createPdf(),
  )
  expect(englishDownload.suggestedFilename()).toBe(
    'Invoice_2026-001_2026-06-15.pdf',
  )
  const englishPdf = await artifacts.readPdf(englishDownload)
  expect(englishPdf.pageCount).toBe(1)
  for (const text of [
    'Invoice number 2026-001',
    'Date: 15/06/2026',
    'Subject: Catering für die Firmenfeier',
    'Nordlicht Catering',
    'Max Mustermann',
    'Catering',
    'Reinigung',
    'Net:',
    '€146.73',
    '7% VAT:',
    '€10.27',
    'Gross:',
    '€157.00',
  ])
    expect(englishPdf.text).toContain(text)
  expect(englishPdf.text).not.toContain('Rechnungsnummer')
  await invoice.expectPdfCreated()

  await appShell.navigateToSettings()
  await language.chooseInvoiceLanguage('auto')
  await language.expectPreferences('de', 'auto')
  await appShell.navigateToInvoice()
  const automaticDownload = await artifacts.captureDownload(() =>
    invoice.createPdf(),
  )
  expect(automaticDownload.suggestedFilename()).toBe(
    'Rechnung_2026-001_2026-06-15.pdf',
  )
  const automaticPdf = await artifacts.readPdf(automaticDownload)
  for (const text of scenario.expected.pdfText)
    expect(automaticPdf.text).toContain(text)
  expect(
    pageErrors.filter((message) => /hydration|react error #418/i.test(message)),
  ).toEqual([])
})

test('a language switch and reload retain invalid raw fields and an unsubmitted Invoice Position', async ({
  harness,
  language,
  businessProfile,
  releaseNotes,
  appShell,
  invoice,
}) => {
  await harness.open('/de/einstellungen/profil')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await businessProfile.expectProfileSaved()
  await appShell.navigateToInvoice()
  await invoice.enterInvoiceNumber('  Entwurf / unvollständig  ')
  await invoice.enterSubject('  Unveränderter Betreff & subject  ')
  await invoice.enterRecipient({ name: '  Léa Beispiel  ', postalCode: '' })
  await invoice.addPosition({
    description: '  Gespeicherte Position  ',
    amount: '107,00',
  })
  await invoice.editPosition(1, 'amount', '1,')
  await invoice.enterNewPosition({
    description: '  Noch nicht hinzugefügt  ',
    amount: '1.234,',
  })

  await language.changeInterfaceLanguage('en')
  await language.expectInterfaceLanguage('en')
  await harness.reload()
  await invoice.expectReady('en')
  await invoice.expectInvoiceNumber('  Entwurf / unvollständig  ')
  await invoice.expectSubject('  Unveränderter Betreff & subject  ')
  await invoice.expectRecipientField('name', '  Léa Beispiel  ')
  await invoice.expectRecipientField('postalCode', '')
  await invoice.expectPositionCount(1)
  await invoice.expectPositionValue(
    1,
    'description',
    '  Gespeicherte Position  ',
  )
  await invoice.expectPositionValue(1, 'amount', '1,')
  await invoice.expectNewPositionValues({
    description: '  Noch nicht hinzugefügt  ',
    amount: '1.234,',
  })
  await invoice.expectPdfDisabled()
})

test('cancelling a dirty-profile language switch preserves edits, route and remembered choice', async ({
  harness,
  language,
  businessProfile,
  releaseNotes,
  robotsForPage,
  page,
}) => {
  await harness.open('/de/einstellungen/profil')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await businessProfile.expectProfileSaved()
  // Establish a remembered German choice through the language UI.
  await language.changeInterfaceLanguage('en')
  await language.expectInterfaceLanguage('en')
  await language.changeInterfaceLanguage('de')
  await language.expectInterfaceLanguage('de')
  await businessProfile.enterDetails({
    businessName: '  Ungespeichert & unverändert  ',
  })

  await language.changeInterfaceLanguage('en')
  await businessProfile.expectUnsavedChangesWarning()
  await businessProfile.keepUnsavedChanges()
  await language.expectInterfaceLanguage('de')
  await expect(page).toHaveURL(/\/de\/einstellungen\/profil$/)
  await businessProfile.expectFieldValue(
    'businessName',
    '  Ungespeichert & unverändert  ',
  )

  const otherPage = await harness.openAdditionalNegotiatedPage('/')
  await robotsForPage(otherPage).language.expectInterfaceLanguage('de')
  await expect(otherPage).toHaveURL(/\/de$/)
  await otherPage.close()

  await language.changeInterfaceLanguage('en')
  await businessProfile.expectUnsavedChangesWarning()
  await businessProfile.discardUnsavedChanges()
  await language.expectInterfaceLanguage('en')
  await expect(page).toHaveURL(/\/en\/settings\/profile$/)
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
  await harness.reload()
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
})

for (const { browserLocale, language: locale, path } of [
  { browserLocale: 'en-GB', language: 'en', path: '/en/settings' },
  { browserLocale: 'en-US', language: 'en', path: '/en/settings' },
  { browserLocale: 'de-AT', language: 'de', path: '/de/einstellungen' },
  { browserLocale: 'fr-FR', language: 'de', path: '/de/einstellungen' },
] as const) {
  test.describe(`first visit with ${browserLocale}`, () => {
    test.use({ locale: browserLocale })
    test('negotiates a canonical language address without losing the query', async ({
      harness,
      language,
      releaseNotes,
      page,
    }) => {
      await harness.openNegotiated('/settings?source=first-visit')
      await releaseNotes.acknowledgeReleaseNotes()
      await language.expectInterfaceLanguage(locale)
      await expect(page).toHaveURL(new RegExp(`${path}\\?source=first-visit$`))
    })
  })
}

test.describe('remembered choice with a German browser', () => {
  test.use({ locale: 'de-DE' })
  test('unprefixed entry remembers English, while an explicit English URL overrides a later German choice', async ({
    harness,
    language,
    releaseNotes,
    page,
  }) => {
    await harness.open('/de/einstellungen')
    await releaseNotes.acknowledgeReleaseNotes()
    await language.changeInterfaceLanguage('en')
    await language.expectInterfaceLanguage('en')
    await harness.openNegotiated('/')
    await expect(page).toHaveURL(/\/en$/)
    await language.expectInterfaceLanguage('en')
    await language.changeInterfaceLanguage('de')
    await language.expectInterfaceLanguage('de')
    await harness.open('/en/settings')
    await language.expectInterfaceLanguage('en')
    await expect(page).toHaveURL(/\/en\/settings$/)
  })
})

test.describe('explicit language URLs', () => {
  test.use({ locale: 'en-GB' })

  test('a German URL wins over an English browser and remembered English choice', async ({
    harness,
    language,
    releaseNotes,
    page,
  }) => {
    await harness.open('/de')
    await releaseNotes.acknowledgeReleaseNotes()
    await language.expectInterfaceLanguage('de')
    await language.changeInterfaceLanguage('en')
    await language.expectInterfaceLanguage('en')
    await expect(page).toHaveURL(/\/en$/)

    await harness.open('/de/einstellungen')
    await language.expectInterfaceLanguage('de')
    await expect(page).toHaveURL(/\/de\/einstellungen$/)
  })
})
