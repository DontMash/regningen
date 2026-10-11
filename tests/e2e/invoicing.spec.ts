import type { BusinessProfileScenarioInput } from '../scenarios/business-profile'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import type { InvoiceScenario } from '../scenarios/invoice'
import { createInvoiceScenario } from '../scenarios/invoice'
import type { BrowserControls } from '../support/browser'
import { expect, test } from '../support/playwright'
import type { PlaywrightRobots } from '../support/playwright'

async function establishBusinessProfile(
  harness: BrowserControls,
  businessProfile: PlaywrightRobots['businessProfile'],
  profile: BusinessProfileScenarioInput = createBusinessProfileScenario(),
) {
  await harness.open('/business-profile')
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
    application,
    businessProfile,
    invoice,
    layout,
  }) => {
    await harness.setViewport(width, 900)
    await establishBusinessProfile(harness, businessProfile)
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

    await application.navigateToBusinessProfile()
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
      businessProfile,
      invoice,
      layout,
    }) => {
      await harness.setViewport(width, 900)
      await harness.useSystemTheme(theme)
      await establishBusinessProfile(harness, businessProfile)
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

test('submits new positions with Enter without downloading or validating the invoice form', async ({
  harness,
  businessProfile,
  invoice,
  artifacts,
}) => {
  await establishBusinessProfile(harness, businessProfile)
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

test('shows an error instead of claiming the Business Profile was saved when storage fails', async ({
  harness,
  businessProfile,
  storageFaults,
}) => {
  await storageFaults.preventProfileWrites()
  await harness.open('/')
  await businessProfile.enterDetails({ businessName: 'Lokaler Betrieb' })
  await businessProfile.expectStorageSaveError()
  await businessProfile.closeStorageError()
  await businessProfile.expectSaveDisabled()
})

test('stops at an error screen when browser storage cannot load the Business Profile', async ({
  harness,
  application,
  storageFaults,
}) => {
  await storageFaults.preventProfileReads()
  await harness.open('/')
  await application.expectRootStorageError()
})

test('keeps invoicing blocked after an existing Business Profile fails to save', async ({
  harness,
  application,
  businessProfile,
  invoice,
  storageFaults,
}) => {
  await establishBusinessProfile(harness, businessProfile)
  await application.navigateToBusinessProfile()
  await storageFaults.preventProfileWrites()
  await harness.reload()
  await businessProfile.enterDetails({
    businessName: 'Nicht gespeicherter Name',
  })
  await businessProfile.expectStorageSaveError()
  await businessProfile.closeStorageError()
  await application.navigateToInvoice()
  await invoice.expectBlockedByStorageFailure()
  await invoice.closeBlockingNotice()
  await invoice.expectPdfDisabled()
})

test('configures a Business Profile through its UI before opening Invoices', async ({
  harness,
  application,
  businessProfile,
  invoice,
  requests: requestObserver,
}) => {
  const observedRequests = requestObserver.observeRequests()
  await harness.open('/')
  await application.expectProfilePage()
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
  await invoice.expectReady()

  await harness.reload()
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
  businessProfile,
  invoice,
  artifacts,
}) => {
  const profile = createBusinessProfileScenario()
  await establishBusinessProfile(harness, businessProfile, profile)
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
})

test('caps invoices at 16 line items and confirms starting a new invoice', async ({
  harness,
  businessProfile,
  invoice,
}) => {
  await establishBusinessProfile(harness, businessProfile)
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
  await invoice.startNewInvoice()
  await invoice.confirmNewInvoice()
  await invoice.expectNewInvoiceDraft()

  await invoice.enterNewPosition({ description: 'Unfertig' })
  await invoice.startNewInvoice()
  await invoice.expectNewInvoiceConfirmation()
  await invoice.confirmNewInvoice()
  await invoice.expectNewInvoiceDraft()
  await invoice.expectNewPositionValues({ description: '' })
})

test('reflects a Business Profile change from another tab without discarding Invoice entries', async ({
  harness,
  businessProfile,
  invoice,
  robotsForPage,
  artifacts,
}) => {
  await establishBusinessProfile(harness, businessProfile)
  const scenario = createInvoiceScenario({
    number: 'tab-2026-001',
    positions: [{ description: 'Catering', amount: '107,00' }],
  })
  await enterInvoiceScenario(invoice, scenario)

  const profileTab = robotsForPage(
    await harness.openAdditionalPage('/business-profile'),
  )
  await profileTab.businessProfile.enterDetails({
    businessName: 'Nordlicht Partyservice',
  })

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
  businessProfile,
  artifacts,
}) => {
  await establishBusinessProfile(harness, businessProfile)
  await harness.open('/business-profile')
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

test('exports an imported partial Business Profile without unlocking invoicing', async ({
  harness,
  application,
  businessProfile,
  invoice,
  artifacts,
}) => {
  await harness.open('/business-profile')
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

  const download = await artifacts.captureDownload(() =>
    businessProfile.exportBackup(),
  )
  const exported = JSON.parse(await artifacts.readText(download))
  expect(exported.profile).toEqual(partialProfile)

  await application.navigateToInvoice()
  await invoice.expectProfileSetupPrompt()
})

test('discards invoice form values when the page reloads', async ({
  harness,
  businessProfile,
  invoice,
}) => {
  await establishBusinessProfile(harness, businessProfile)
  await invoice.enterInvoiceNumber('not-persisted')
  await invoice.addPosition({
    description: 'Unfertige Position',
    amount: '10,00',
  })

  await harness.reload()

  await invoice.expectInvoiceNumber('')
  await invoice.expectEmptyPositions()
})

test('shows validation feedback for a missing recipient and an invalid line amount', async ({
  harness,
  businessProfile,
  invoice,
}) => {
  await establishBusinessProfile(harness, businessProfile)
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
  application,
  businessProfile,
  invoice,
}) => {
  await establishBusinessProfile(harness, businessProfile)
  await invoice.enterInvoiceNumber('preserved-001')
  await invoice.addPosition({ description: 'Catering', amount: '107,00' })

  await application.navigateToBusinessProfile()
  await businessProfile.deleteProfile()
  await businessProfile.cancelProfileDeletion()
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
  await businessProfile.deleteProfile()
  await businessProfile.confirmProfileDeletion()
  await businessProfile.expectProfileDeleted()

  await application.navigateToInvoice()
  await invoice.expectInvoiceNumber('preserved-001')
  await invoice.expectProfileMissingWarning()
  await invoice.closeBlockingNotice()
  await invoice.expectPositionValue(1, 'description', 'Catering')
  await invoice.expectPdfDisabled()

  await application.navigateToBusinessProfile()
  const replacement = createBusinessProfileScenario({
    businessName: 'Neu eingerichteter Betrieb',
  })
  await businessProfile.enterDetails(replacement)
  await businessProfile.saveProfile()
  await invoice.expectInvoiceEntriesPreserved('preserved-001', 'Catering')
})

test('warns a Business Profile editor when another tab changes the Business Profile', async ({
  harness,
  businessProfile,
  robotsForPage,
}) => {
  await establishBusinessProfile(harness, businessProfile)
  await harness.open('/business-profile')

  const otherProfileTab = robotsForPage(
    await harness.openAdditionalPage('/business-profile'),
  )
  await otherProfileTab.businessProfile.enterDetails({
    businessName: 'Aktualisierte Firma',
  })

  await businessProfile.expectExternalChangeWarning()
  await businessProfile.dismissExternalChangeWarning()
  await businessProfile.expectBusinessNameFieldDisabled()

  await harness.reload()
  await businessProfile.expectFieldValue('businessName', 'Aktualisierte Firma')
  await businessProfile.expectBusinessNameFieldEnabled()
})
