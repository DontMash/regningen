import type { BusinessProfileScenarioInput } from '../scenarios/business-profile'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import type { InvoiceScenario } from '../scenarios/invoice'
import { createInvoiceScenario } from '../scenarios/invoice'
import { expect, test } from '../support/playwright/playwright'
import type { PlaywrightRobots } from '../support/playwright/playwright'

async function establishBusinessProfile(
  businessProfile: PlaywrightRobots['businessProfile'],
  profile: BusinessProfileScenarioInput = createBusinessProfileScenario(),
) {
  await businessProfile.configureBusinessProfile(profile)
}

async function enterInvoiceScenario(
  invoice: PlaywrightRobots['invoice'],
  scenario: InvoiceScenario,
) {
  await invoice.enterInvoice(scenario.input)
}

for (const width of [320, 768, 1024, 1440]) {
  test(`reserves one error line and lets wrapped feedback expand at ${width}px`, async ({
    harness,
    appShell,
    releaseNotes,
    businessProfile,
    invoice,
    layout,
  }) => {
    await harness.setViewport(width, 900)
    await harness.open('/settings/profile')
    await releaseNotes.dismissReleaseNotes()
    await establishBusinessProfile(businessProfile)
    if (width < 1024) await appShell.openMenu()
    await appShell.navigateToInvoice()
    await invoice.expectReady()
    await harness.waitForFonts()

    const subjectBefore = await layout.invoiceControl('subject')
    await invoice.enterInvoiceNumber('')
    await invoice.blurInvoiceNumber()
    await invoice.expectInvoiceNumberValidation()
    expect(await layout.invoiceControl('subject')).toEqual(subjectBefore)
    await invoice.enterInvoiceNumber('layout-001')
    expect(await layout.invoiceControl('subject')).toEqual(subjectBefore)

    const streetBefore = await layout.invoiceRecipientControl('street')
    await invoice.focusRecipient('name')
    await invoice.blurRecipient('name')
    const recipientError = 'Unternehmen oder Name des Empfängers angeben.'
    const recipientGrowth = await layout.invoiceErrorGrowth(recipientError)
    expect(await layout.invoiceRecipientControl('street')).toEqual({
      ...streetBefore,
      y: streetBefore.y + recipientGrowth,
    })
    await invoice.enterRecipient({ name: 'Max Mustermann' })
    await invoice.expectValidationMessageAbsent(recipientError)
    expect(await layout.invoiceRecipientControl('street')).toEqual(streetBefore)

    const positionControlsBefore = await layout.invoiceNewPositionControls()
    await invoice.submitNewPosition()
    const amountGrowth = await layout.invoiceErrorGrowth(
      'Einen positiven Bruttopreis eingeben.',
    )
    const positionControlsAfter = await layout.invoiceNewPositionControls()
    expect(positionControlsAfter).toEqual([
      positionControlsBefore[0],
      positionControlsBefore[1],
      {
        ...positionControlsBefore[2],
        y: positionControlsBefore[2].y + (width < 768 ? amountGrowth : 0),
      },
    ])
    if (width >= 768) {
      expect(positionControlsBefore[0].y).toBe(positionControlsBefore[1].y)
      expect(positionControlsBefore[1].y).toBe(positionControlsBefore[2].y)
    }

    await invoice.addPosition({ description: 'Catering', amount: '107,00' })
    await invoice.addPosition({ description: 'Reinigung', amount: '50,00' })
    const rowBefore = await layout.invoiceExistingPositionControls(1)
    await invoice.editPosition(1, 'amount', 'invalid')
    await invoice.blurPositionAmount(1)
    await invoice.expectValidationMessage(
      'Einen positiven Bruttopreis eingeben.',
    )
    expect(await layout.invoiceExistingPositionControls(1)).toEqual(rowBefore)
    await invoice.editPosition(1, 'amount', '107,00')
    expect(await layout.invoiceExistingPositionControls(1)).toEqual(rowBefore)

    if (width < 1024) await appShell.openMenu()
    await appShell.navigateToBusinessProfile()
    await businessProfile.expectEditorReady()
    await harness.waitForFonts()
    const ownerAndSaveBefore = await layout.businessProfileOwnerAndSaveButton()
    await businessProfile.enterDetails({ ownerName: '' })
    await businessProfile.blurField('ownerName')
    const ownerGrowth = await layout.businessProfileErrorGrowth(
      'Name der Inhaberin oder des Inhabers fehlt.',
    )
    expect(await layout.businessProfileOwnerAndSaveButton()).toEqual([
      ownerAndSaveBefore[0],
      { ...ownerAndSaveBefore[1], y: ownerAndSaveBefore[1].y + ownerGrowth },
    ])
    await businessProfile.enterDetails({ ownerName: 'Erika Beispiel' })
    await businessProfile.expectValidationMessageHidden(
      'Name der Inhaberin oder des Inhabers fehlt.',
    )
    expect(await layout.businessProfileOwnerAndSaveButton()).toEqual(
      ownerAndSaveBefore,
    )

    const taxAndSaveBefore =
      await layout.businessProfileTaxNumberAndSaveButton()
    await businessProfile.enterDetails({ vatId: 'DE123' })
    const vatGrowth = await layout.businessProfileErrorGrowth(
      'Eine deutsche Umsatzsteuer-ID beginnt mit DE und hat neun Ziffern.',
    )
    expect(await layout.businessProfileTaxNumberAndSaveButton()).toEqual([
      {
        ...taxAndSaveBefore[0],
        y: taxAndSaveBefore[0].y + (width < 768 ? vatGrowth : 0),
      },
      { ...taxAndSaveBefore[1], y: taxAndSaveBefore[1].y + vatGrowth },
    ])
    await businessProfile.enterDetails({ vatId: '' })
    const missingTaxGrowth = await layout.businessProfileErrorGrowth(
      'Umsatzsteuer-ID oder Steuernummer angeben.',
    )
    expect(await layout.businessProfileTaxNumberAndSaveButton()).toEqual([
      taxAndSaveBefore[0],
      { ...taxAndSaveBefore[1], y: taxAndSaveBefore[1].y + missingTaxGrowth },
    ])
    await businessProfile.enterDetails({ taxNumber: '12/345/67890' })
    await businessProfile.expectValidationMessageHidden(
      'Umsatzsteuer-ID oder Steuernummer angeben.',
    )
    expect(await layout.businessProfileTaxNumberAndSaveButton()).toEqual(
      taxAndSaveBefore,
    )
  })
}

for (const width of [375, 1024]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`styles the date picker like an input in ${theme} mode at ${width}px`, async ({
      harness,
      appShell,
      releaseNotes,
      businessProfile,
      invoice,
      layout,
    }) => {
      await harness.setViewport(width, 900)
      await harness.useSystemTheme(theme)
      await harness.open('/settings/profile')
      await releaseNotes.dismissReleaseNotes()
      await establishBusinessProfile(businessProfile)
      if (width < 1024) await appShell.openMenu()
      await appShell.navigateToInvoice()
      await invoice.expectReady()
      await harness.waitForFonts()

      const appearance = await layout.invoiceDatePickerAppearance()
      expect(appearance.date).toEqual(appearance.number)
      if (width >= 768)
        expect(await layout.invoiceDatePickerAndNumberShareRow()).toBe(true)
      await invoice.openDatePicker()
      await invoice.expectDatePickerOpen()
    })
  }
}

for (const locale of ['de', 'en'] as const) {
  for (const width of [375, 1024]) {
    test(`keyboard date navigation moves actual focus and restores editing in ${locale} at ${width}px`, async ({
      harness,
      releaseNotes,
      businessProfile,
      invoice,
    }) => {
      await harness.setViewport(width, 900)
      await harness.open(
        locale === 'de' ? '/de/einstellungen/profil' : '/en/settings/profile',
      )
      await releaseNotes.dismissReleaseNotes()
      await establishBusinessProfile(businessProfile)
      await businessProfile.expectProfileSaved()
      await harness.open(locale === 'de' ? '/de/rechnung' : '/en/invoice')
      await releaseNotes.dismissReleaseNotes()
      await invoice.expectReady(locale)
      await invoice.chooseInvoiceDate('2026-06-24', locale)
      await invoice.openDatePickerWithKeyboard()
      await invoice.expectFocusedCalendarDate(
        locale === 'de'
          ? 'Mittwoch, 24. Juni 2026, ausgewählt'
          : 'Wednesday, 24 June 2026, selected',
      )
      await invoice.pressCalendarKey('ArrowDown')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Mittwoch, 1. Juli 2026' : 'Wednesday, 1 July 2026',
      )
      await invoice.pressCalendarKey('ArrowLeft')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Dienstag, 30. Juni 2026' : 'Tuesday, 30 June 2026',
      )
      await invoice.pressCalendarKey('ArrowUp')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Dienstag, 23. Juni 2026' : 'Tuesday, 23 June 2026',
      )
      await invoice.pressCalendarKey('ArrowRight')
      await invoice.expectFocusedCalendarDate(
        locale === 'de'
          ? 'Mittwoch, 24. Juni 2026, ausgewählt'
          : 'Wednesday, 24 June 2026, selected',
      )
      await invoice.pressCalendarKey('ArrowDown')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Mittwoch, 1. Juli 2026' : 'Wednesday, 1 July 2026',
      )
      await invoice.pressCalendarKey('Enter')
      await invoice.expectSelectedDate('2026-07-01')
      await invoice.expectDatePickerDismissedWithTriggerFocused()
      await invoice.openDatePickerWithKeyboard()
      await invoice.pressCalendarKey('ArrowRight')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Donnerstag, 2. Juli 2026' : 'Thursday, 2 July 2026',
      )
      await invoice.pressCalendarKey('Escape')
      await invoice.expectDatePickerDismissedWithTriggerFocused()
      await invoice.expectSelectedDate('2026-07-01')
      await invoice.openDatePickerWithKeyboard()
      await invoice.navigateCalendarMonthWithKeyboard('next')
      await invoice.pressCalendarKey('Tab')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Samstag, 1. August 2026' : 'Saturday, 1 August 2026',
      )
      await invoice.pressCalendarKey('ArrowRight')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Sonntag, 2. August 2026' : 'Sunday, 2 August 2026',
      )
      await invoice.pressCalendarKey('Enter')
      await invoice.expectSelectedDate('2026-08-02')
      await invoice.expectDatePickerDismissedWithTriggerFocused()
      await invoice.openDatePickerWithKeyboard()
      await invoice.navigateCalendarMonthWithKeyboard('previous')
      await invoice.pressCalendarKey('Tab')
      await invoice.pressCalendarKey('Tab')
      await invoice.expectFocusedCalendarDate(
        locale === 'de' ? 'Mittwoch, 1. Juli 2026' : 'Wednesday, 1 July 2026',
      )
      await invoice.pressCalendarKey('Enter')
      await invoice.expectSelectedDate('2026-07-01')
      await invoice.expectDatePickerDismissedWithTriggerFocused()
    })
  }
}

test('submits new positions with Enter without downloading or validating the invoice form', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
  artifacts,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()
  const scenario = createInvoiceScenario({
    number: 'keyboard-001',
    recipient: {
      name: 'Max Mustermann',
      street: 'Musterstraße 1',
      postalCode: '20095',
      town: 'Hamburg',
    },
    positions: [{ description: 'Catering', amount: '107,00' }],
  })
  await enterInvoiceScenario(invoice, scenario)
  await invoice.expectPdfEnabled()
  const downloads = artifacts.trackDownloads()

  await invoice.enterNewPosition({ amount: 'invalid' })
  await invoice.blurNewPositionAmount()
  await invoice.expectValidationMessageAbsent(
    'Einen positiven Bruttopreis eingeben.',
  )
  await invoice.pressEnterInNewPosition('amount')
  await invoice.expectValidationMessage('Positionsbeschreibung fehlt.')
  await invoice.expectValidationMessage('Einen positiven Bruttopreis eingeben.')
  await invoice.expectPdfEnabled()

  await invoice.enterNewPosition({ description: 'Reinigung', amount: '50,00' })
  await invoice.pressEnterInNewPosition('amount')
  await invoice.expectPositionValue(2, 'description', 'Reinigung')
  await invoice.expectNewPositionValues({ description: '', amount: '' })
  await invoice.enterNewPosition({ description: 'Service', amount: '25,00' })
  await invoice.pressEnterInNewPosition('description')
  await invoice.expectPositionValue(3, 'description', 'Service')
  await invoice.expectValidationMessageAbsent('Positionsbeschreibung fehlt.')
  await invoice.expectValidationMessageAbsent(
    'Einen positiven Bruttopreis eingeben.',
  )
  expect(downloads.snapshot()).toEqual([])

  await invoice.enterNewPosition({ amount: 'invalid' })
  await artifacts.captureDownload(() => invoice.createPdf())
  expect(downloads.snapshot()).toHaveLength(1)
  await invoice.expectValidationMessageAbsent(
    'Einen positiven Bruttopreis eingeben.',
  )
})

test('reports failed profile Save and retains edits for retry without reloading or retyping', async ({
  harness,
  releaseNotes,
  businessProfile,
  invoice,
  storageFaults,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await storageFaults.preventProfilePersistence()
  await businessProfile.enterDetails({ businessName: 'Lokaler Betrieb' })
  await businessProfile.saveProfile()
  await businessProfile.expectStorageSaveError()
  await businessProfile.closeStorageError()
  await businessProfile.expectFieldValue('businessName', 'Lokaler Betrieb')
  await businessProfile.expectSaveEnabled()
  await storageFaults.restoreProfilePersistence()
  await businessProfile.saveProfile()
  await businessProfile.expectProfileSaved()
  await businessProfile.expectFieldValue('businessName', 'Lokaler Betrieb')
  await businessProfile.expectBusinessNameFieldEnabled()
  await businessProfile.openInvoiceEditor()
  await invoice.expectReady()
  await invoice.expectStorageFailureAbsent()
})

test('keeps the introduction readable but reports failed application entry when the Business Profile cannot load', async ({
  harness,
  landing,
  releaseNotes,
  storageFaults,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.acknowledgeReleaseNotes()
  await storageFaults.preventProfileReads()
  await harness.open('/')
  await landing.expectIntroduction()
  await landing.startInvoice()
  await landing.expectEntryError()
})

test('keeps invoicing blocked after an existing Business Profile fails to save', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
  storageFaults,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await storageFaults.preventProfileWrites()
  await harness.reload()
  await releaseNotes.dismissReleaseNotes()
  await businessProfile.enterDetails({
    businessName: 'Nicht gespeicherter Name',
  })
  await businessProfile.saveProfile()
  await businessProfile.expectStorageSaveError()
  await businessProfile.closeStorageError()
  await appShell.navigateToInvoice()
  await businessProfile.discardUnsavedChanges()
  await invoice.expectBlockedByStorageFailure()
  await invoice.closeBlockingNotice()
  await invoice.expectPdfDisabled()
})

test('configures a Business Profile through its UI before opening Invoices', async ({
  harness,
  appShell,
  landing,
  releaseNotes,
  businessProfile,
  invoice,
  requests: requestObserver,
}) => {
  const observedRequests = requestObserver.observeRequests()
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()
  await landing.expectIntroduction()
  await landing.startInvoice()
  await appShell.expectProfilePage()
  await businessProfile.expectEditorReady()
  await businessProfile.expectSaveDisabled()
  await businessProfile.openIbanGuidance()
  await businessProfile.expectIbanGuidance()
  await businessProfile.pressEscape()

  const profile = createBusinessProfileScenario({
    iban: 'DE89 3704 0044 0532 0130 00',
  })
  await businessProfile.enterDetails({ ...profile, iban: '' })
  await businessProfile.enterDetails({ iban: 'ungültig' })
  await businessProfile.blurField('iban')
  await businessProfile.expectValidationMessage(
    'Bitte eine gültige IBAN eingeben.',
  )
  await businessProfile.expectSaveDisabled()
  await businessProfile.enterDetails({ iban: profile.iban })
  await businessProfile.expectValidationMessageHidden(
    'Bitte eine gültige IBAN eingeben.',
  )
  await businessProfile.saveProfile()
  await businessProfile.expectProfileSaved()
  await appShell.expectProfilePage()
  await appShell.navigateToInvoice()
  await invoice.expectReady()

  await harness.reload()
  await releaseNotes.dismissReleaseNotes()
  await invoice.expectReady()
  await invoice.expectBusinessName(profile.businessName)
  const scenario = createInvoiceScenario({
    number: 'privacy-001',
    recipient: {
      name: 'Private Recipient',
      street: 'Private Street 99',
      postalCode: '99999',
      town: 'Private Town',
    },
    positions: [{ description: 'Private invoice detail', amount: '10,00' }],
  })
  await enterInvoiceScenario(invoice, scenario)

  const requests = observedRequests.snapshot()
  expect(
    requests.every(({ method, body }) => method === 'GET' && body === null),
    JSON.stringify(
      requests.filter(({ method, body }) => method !== 'GET' || body !== null),
    ),
  ).toBe(true)
  const requestData = requests
    .map(({ url, body }) => `${decodeURIComponent(url)} ${body ?? ''}`)
    .join('\n')
  for (const privateValue of [
    profile.businessName,
    profile.ownerName,
    profile.street,
    profile.postalCode,
    profile.town,
    profile.iban,
    profile.iban.replaceAll(' ', ''),
    profile.vatId,
    scenario.input.recipient.name,
    scenario.input.recipient.street,
    scenario.input.positions[0].description,
  ]) {
    expect(requestData).not.toContain(privateValue)
  }
})

test('creates and downloads a one-page invoice PDF in the browser', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
  artifacts,
}) => {
  const pageErrors = await harness.observePageErrors()
  const profile = createBusinessProfileScenario()
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile, profile)
  await appShell.navigateToInvoice()
  await invoice.expectPdfDisabled()

  const scenario = createInvoiceScenario({
    number: '2026-001',
    subject: 'Service am Hafengeburtstag',
    positions: [{ description: 'Catering', amount: '107,00' }],
    expected: {
      totals: { net: '100,00 €', tax: '7,00 €', gross: '107,00 €' },
      pdfText: [
        profile.businessName,
        profile.serviceDescription,
        profile.ownerName,
        profile.street,
        `${profile.postalCode} ${profile.town}`,
        `Tel.: ${profile.phone}`,
        'Max Mustermann',
        'Musterstraße 1',
        'Rechnungsnummer 2026-001',
        'Datum: 15.06.2026',
        'Betreff: Service am Hafengeburtstag',
        'Catering',
        '107,00 €',
        'Netto:',
        '100,00 €',
        '7 % MwSt.:',
        '7,00 €',
        'Brutto:',
        '107,00 €',
        profile.iban,
        profile.vatId,
      ],
    },
  })
  await invoice.expectDateLabelMatches(/\d{2}\.\d{2}\.\d{4}/)
  await invoice.chooseInvoiceDate(scenario.input.date)
  const invoiceDate = await invoice.readSelectedDate()
  expect(invoiceDate).toBe('15.06.2026')

  await invoice.enterInvoiceNumber(scenario.input.number)
  await invoice.enterSubject(scenario.input.subject)
  await invoice.enterRecipient(scenario.input.recipient)
  await invoice.expectPdfDisabled()
  await invoice.addPosition(scenario.input.positions[0])
  await invoice.appendToPosition(1, 'description', ' & Service')
  await invoice.expectPdfEnabled()

  await invoice.expectSummaryTotals({
    net: '100,00 €',
    tax: '7,00 €',
    gross: '107,00 €',
  })
  await invoice.chooseVatRate(19)
  await invoice.expectSummaryTotals({
    net: '89,92 €',
    tax: '17,08 €',
    gross: '107,00 €',
  })
  await invoice.chooseVatRate(7)

  const download = await artifacts.captureDownload(() => invoice.createPdf())
  expect(download.suggestedFilename()).toMatch(
    /^Rechnung_2026-001_\d{4}-\d{2}-\d{2}\.pdf$/,
  )
  const document = await artifacts.readPdf(download)
  expect(document.pageCount).toBe(1)
  for (const expectedText of scenario.expected.pdfText) {
    expect(document.text).toContain(expectedText)
  }
  expect(document.text).toContain('Catering & Service')
  await invoice.expectPdfCreated()
  expect(pageErrors).toEqual([])
})

test('can read release notes from the footer without losing the in-memory invoice', async ({
  harness,
  appShell,
  releaseNotes,
  footer,
  businessProfile,
  invoice,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await appShell.navigateToInvoice()
  await invoice.expectReady()
  await invoice.enterInvoiceNumber('release-notes-001')
  await invoice.addPosition({ description: 'Catering', amount: '107,00' })

  await footer.openReleaseNotesFromFooter()
  await releaseNotes.expectCurrentReleaseNotes()
  await releaseNotes.dismissReleaseNotes()
  await invoice.expectInvoiceEntriesPreserved('release-notes-001', 'Catering')
})

test('caps invoices at 16 line items and confirms starting a new invoice', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()
  const scenario = createInvoiceScenario({
    number: '2026-001',
    positions: Array.from({ length: 16 }, (_, index) => ({
      description: `Position ${index + 1}`,
      amount: '10,00',
    })),
  })
  await invoice.enterInvoiceNumber(scenario.input.number)
  for (const position of scenario.input.positions)
    await invoice.addPosition(position)
  await invoice.expectPositionCount(16)
  await invoice.expectAddPositionDisabled()
  await invoice.editPosition(3, 'amount', 'abc')
  await invoice.blurPositionAmount(3)
  await invoice.expectValidationMessage('Einen positiven Bruttopreis eingeben.')
  await invoice.removePosition(1)
  await invoice.expectPositionValue(2, 'amount', 'abc')
  await invoice.expectValidationMessage('Einen positiven Bruttopreis eingeben.')

  await invoice.startNewInvoice()
  await invoice.expectNewInvoiceConfirmation()
  await invoice.cancelNewInvoice()
  await invoice.expectInvoiceNumber('2026-001')
  await harness.reload()
  await releaseNotes.dismissReleaseNotes()
  await invoice.expectInvoiceNumber('2026-001')
  await invoice.expectPositionValue(2, 'amount', 'abc')
  await invoice.startNewInvoice()
  await invoice.confirmNewInvoice()
  await invoice.expectNewInvoiceDraft()

  await invoice.enterNewPosition({ description: 'Unfertig' })
  await invoice.startNewInvoice()
  await invoice.expectNewInvoiceConfirmation()
  await invoice.confirmNewInvoice()
  await invoice.expectNewInvoiceDraft()
  await invoice.expectNewPositionValues({ description: '' })
  await harness.reload()
  await releaseNotes.dismissReleaseNotes()
  await invoice.expectNewInvoiceDraft()
  await invoice.expectNewPositionValues({ description: '' })
})

test('reflects a Business Profile change from another tab without discarding Invoice entries', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
  robotsForPage,
  artifacts,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()
  const scenario = createInvoiceScenario({
    number: 'tab-2026-001',
    positions: [{ description: 'Catering', amount: '107,00' }],
  })
  await enterInvoiceScenario(invoice, scenario)

  const profileTab = robotsForPage(
    await harness.openAdditionalPage('/settings/profile'),
  )
  await profileTab.releaseNotes.dismissReleaseNotes()
  await profileTab.businessProfile.enterDetails({
    businessName: 'Nordlicht Partyservice',
  })
  await invoice.expectBusinessName('Nordlicht Catering')
  await profileTab.businessProfile.saveProfile()

  await invoice.expectBusinessName('Nordlicht Partyservice')
  await invoice.expectProfileUpdateWarning()
  await invoice.closeBlockingNotice()
  await invoice.expectInvoiceEntriesPreserved('tab-2026-001', 'Catering')
  await invoice.expectPdfEnabled()

  const download = await artifacts.captureDownload(() => invoice.createPdf())
  const document = await artifacts.readPdf(download)
  expect(document.pageCount).toBe(1)
  for (const expectedText of [
    'Nordlicht Partyservice',
    'tab-2026-001',
    'Catering',
  ]) {
    expect(document.text).toContain(expectedText)
  }
})

test('rejects invalid Business Profile backups without locking the editor and restores a valid backup', async ({
  harness,
  releaseNotes,
  businessProfile,
  artifacts,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await businessProfile.expectBackupGuidance()

  const backupDownload = await artifacts.captureDownload(() =>
    businessProfile.exportBackup(),
  )
  expect(backupDownload.suggestedFilename()).toBe(
    'regningen-unternehmensprofil.json',
  )
  const backup = await artifacts.readText(backupDownload)

  await businessProfile.enterDetails({ businessName: 'Geänderter Name' })
  await businessProfile.chooseBackup({
    name: 'invalid.json',
    contents: 'kein JSON',
  })
  await businessProfile.confirmBackupReplacement()
  await businessProfile.expectImportError(
    'Die Profilsicherung enthält kein gültiges JSON.',
  )
  await businessProfile.expectBusinessNameFieldEnabled()
  await businessProfile.expectFieldValue('businessName', 'Geänderter Name')

  await businessProfile.chooseBackup({
    name: 'business-profile.json',
    contents: backup,
  })
  await businessProfile.confirmBackupReplacement()
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
})

test('stages an incomplete Business Profile backup without saving or unlocking invoicing', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await businessProfile.expectEditorReady()
  const partialProfile = {
    businessName: 'Teilprofil Betrieb',
    serviceDescription: '',
    ownerName: '',
    street: '',
    postalCode: '',
    town: '',
    phone: '',
    mobile: '',
    iban: '',
    vatId: '',
    taxNumber: '',
  }
  const backup = JSON.stringify({
    format: 'regningen-business-profile',
    version: 1,
    profile: partialProfile,
  })
  await businessProfile.chooseBackup({
    name: 'partial-profile.json',
    contents: backup,
  })
  await businessProfile.expectFieldValue('businessName', 'Teilprofil Betrieb')
  await businessProfile.expectSaveDisabled()

  await businessProfile.expectBackupExportDisabled()

  await appShell.navigateToInvoice()
  await businessProfile.discardUnsavedChanges()
  await invoice.expectProfileSetupPrompt()
})

test('restores incomplete Invoice Draft inputs after an ordinary reload', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()

  await invoice.enterInvoiceNumber('  draft-reload  ')
  await invoice.enterSubject('  unfinished subject  ')
  await invoice.enterRecipient({
    company: 'Recipient GmbH',
    street: 'Main Street 1',
    postalCode: '20095',
    town: 'Hamburg',
  })
  await invoice.addPosition({
    description: 'Incomplete existing row',
    amount: '12,00',
  })
  await invoice.editPosition(1, 'amount', 'not-money')
  await invoice.chooseVatRate(19)
  await invoice.enterNewPosition({
    description: ' Unsubmitted position ',
    amount: '0,',
  })
  const expectedDate = await invoice.readSelectedDate()

  await harness.reload()
  await releaseNotes.dismissReleaseNotes()

  await invoice.expectInvoiceNumber('  draft-reload  ')
  await invoice.expectSubject('  unfinished subject  ')
  await invoice.expectRecipientField('company', 'Recipient GmbH')
  await invoice.expectPositionValue(1, 'description', 'Incomplete existing row')
  await invoice.expectPositionValue(1, 'amount', 'not-money')
  await invoice.expectNewPositionValues({
    description: ' Unsubmitted position ',
    amount: '0,',
  })
  await invoice.expectVatRate(19)
  await invoice.expectDateLabelMatches(new RegExp(expectedDate.trim()))
})

test('retains unsaved Invoice Draft edits when a native reload warning is cancelled and saves again after storage recovers', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
  storageFaults,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()
  const scenario = createInvoiceScenario({ number: 'storage-recovered' })

  await storageFaults.preventDraftPersistence('write')
  await invoice.enterInvoiceNumber(scenario.input.number)
  await invoice.expectDraftPersistenceWarning()
  const reload = await harness.cancelReloadAtUnsavedWarning()
  expect(reload).toBe('beforeunload')
  await invoice.expectInvoiceNumber(scenario.input.number)

  await storageFaults.restoreDraftPersistence()
  await invoice.enterSubject(scenario.input.subject)
  await invoice.expectDraftPersistenceWarningAbsent()
  await harness.reload()
  await invoice.expectInvoiceNumber(scenario.input.number)
  await invoice.expectSubject(scenario.input.subject)
})

test('refuses to discard the Invoice Draft when session removal fails and can reset after recovery', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
  storageFaults,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()
  const scenario = createInvoiceScenario({
    number: 'keep-on-failed-reset',
    positions: [{ description: '  unfinished  ', amount: 'not-money' }],
  })
  const unfinished = scenario.input.positions[0]
  await invoice.enterInvoiceNumber(scenario.input.number)
  await invoice.enterNewPosition(unfinished)

  await storageFaults.preventDraftPersistence('remove')
  await invoice.startNewInvoice()
  await invoice.confirmNewInvoice()
  await invoice.expectNewInvoiceFailed()
  await invoice.cancelNewInvoice()
  await invoice.expectInvoiceNumber(scenario.input.number)
  await invoice.expectNewPositionValues(unfinished)

  await storageFaults.restoreDraftPersistence()
  await invoice.startNewInvoice()
  await invoice.confirmNewInvoice()
  await invoice.expectNewInvoiceDraft()
  await invoice.expectNewPositionValues({ description: '', amount: '' })
  await harness.reload()
  await invoice.expectNewInvoiceDraft()
  await invoice.expectNewPositionValues({ description: '', amount: '' })
})

for (const fault of ['access', 'read'] as const) {
  test(`keeps the Invoice editor usable when draft-session ${fault} fails`, async ({
    harness,
    appShell,
    releaseNotes,
    businessProfile,
    invoice,
    storageFaults,
  }) => {
    await harness.open('/settings/profile')
    await releaseNotes.acknowledgeReleaseNotes()
    await establishBusinessProfile(businessProfile)
    await appShell.navigateToInvoice()
    await storageFaults.preventDraftRecovery(fault)
    await harness.reload()
    await invoice.expectReady()
    const scenario = createInvoiceScenario({
      number: 'editable-without-storage',
    })
    await invoice.enterInvoiceNumber(scenario.input.number)
    await invoice.expectDraftPersistenceWarning()
    await invoice.expectInvoiceNumber(scenario.input.number)
  })
}

for (const kind of ['malformed', 'unsupported'] as const) {
  test(`warns and opens an empty Invoice Draft for ${kind} session data`, async ({
    harness,
    appShell,
    releaseNotes,
    businessProfile,
    invoice,
    storageFaults,
  }) => {
    await harness.open('/settings/profile')
    await releaseNotes.acknowledgeReleaseNotes()
    await establishBusinessProfile(businessProfile)
    await appShell.navigateToInvoice()
    const scenario = createInvoiceScenario({ number: 'never-guess-recovery' })
    await invoice.enterInvoiceNumber(scenario.input.number)
    await storageFaults.supplyInvalidDraft(kind)
    await harness.reload()
    await invoice.expectDraftRecoveryWarning()
    await invoice.expectNewInvoiceDraft()
    await invoice.expectNewPositionValues({ description: '', amount: '' })
  })
}

test('shows validation feedback for a missing recipient and an invalid line amount', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()
  const scenario = createInvoiceScenario({
    number: 'invalid-001',
    recipient: { name: '' },
    positions: [],
  })
  await invoice.enterInvoiceNumber(scenario.input.number)
  await invoice.focusRecipient('company')
  await invoice.blurRecipient('company')
  await invoice.expectValidationMessage(
    'Unternehmen oder Name des Empfängers angeben.',
  )

  await invoice.enterRecipient({
    name: 'Max Mustermann',
    street: 'Musterstraße 1',
    postalCode: '20095',
    town: 'Hamburg',
  })
  await invoice.enterNewPosition({ description: 'Catering', amount: 'abc' })
  await invoice.blurNewPositionAmount()
  await invoice.expectValidationMessageAbsent(
    'Einen positiven Bruttopreis eingeben.',
  )
  await invoice.submitNewPosition()
  await invoice.expectValidationMessage('Einen positiven Bruttopreis eingeben.')
  await invoice.expectPdfDisabled()
})

test('keeps Invoice entries while the Business Profile is deleted and set up again', async ({
  harness,
  appShell,
  releaseNotes,
  businessProfile,
  invoice,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await appShell.navigateToInvoice()
  await invoice.enterInvoiceNumber('preserved-001')
  await invoice.addPosition({ description: 'Catering', amount: '107,00' })

  await appShell.navigateToBusinessProfile()
  await businessProfile.deleteProfile()
  await businessProfile.cancelProfileDeletion()
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
  await businessProfile.deleteProfile()
  await businessProfile.confirmProfileDeletion()
  await businessProfile.expectProfileDeleted()

  await appShell.navigateToInvoice()
  await invoice.expectProfileMissingWarning()
  await invoice.closeBlockingNotice()
  await invoice.expectInvoiceNumber('preserved-001')
  await invoice.expectPositionValue(1, 'description', 'Catering')
  await invoice.expectPdfDisabled()

  await appShell.navigateToBusinessProfile()
  const replacement = createBusinessProfileScenario({
    businessName: 'Neu eingerichteter Betrieb',
  })
  await businessProfile.enterDetails(replacement)
  await businessProfile.saveProfile()
  await appShell.navigateToInvoice()
  await invoice.expectInvoiceEntriesPreserved('preserved-001', 'Catering')
})

test('preserves independent profile edits and silently lets the last successful tab save win', async ({
  harness,
  releaseNotes,
  businessProfile,
  robotsForPage,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await establishBusinessProfile(businessProfile)
  await businessProfile.enterDetails({ businessName: 'Lokale Firma' })

  const otherProfileTab = robotsForPage(
    await harness.openAdditionalPage('/settings/profile'),
  )
  await otherProfileTab.releaseNotes.dismissReleaseNotes()
  await otherProfileTab.businessProfile.enterDetails({
    businessName: 'Aktualisierte Firma',
  })
  await otherProfileTab.businessProfile.saveProfile()
  await otherProfileTab.businessProfile.expectProfileSaved()

  await businessProfile.expectNoExternalChangeWarning()
  await businessProfile.expectFieldValue('businessName', 'Lokale Firma')
  await businessProfile.expectBusinessNameFieldEnabled()
  await businessProfile.saveProfile()
  await businessProfile.expectProfileSaved()
  await harness.reload()
  await releaseNotes.dismissReleaseNotes()
  await businessProfile.expectFieldValue('businessName', 'Lokale Firma')

  await otherProfileTab.businessProfile.deleteProfile()
  await otherProfileTab.businessProfile.confirmProfileDeletion()
  await otherProfileTab.businessProfile.expectProfileDeleted()
  await businessProfile.expectNoExternalChangeWarning()
  await businessProfile.expectFieldValue('businessName', 'Lokale Firma')
  await businessProfile.saveProfile()
  await businessProfile.expectProfileSaved()
  await harness.reload()
  await releaseNotes.dismissReleaseNotes()
  await businessProfile.expectFieldValue('businessName', 'Lokale Firma')
})
