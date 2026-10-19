import { readFile } from 'node:fs/promises'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { PwaBrowserCapabilities } from '../support/playwright/pwa-capabilities'
import { expect, test } from '../support/playwright/playwright'

test('opens all Settings destinations with one active link, normal history and localized license', async ({
  harness,
  appShell,
  releaseNotes,
  settings,
  language,
}) => {
  await harness.open('/')
  await releaseNotes.acknowledgeReleaseNotes()
  await appShell.expectSettingsEntry()
  await appShell.navigateToSettings()
  await settings.expectGeneralPage()
  await settings.expectActivePage('Allgemein')
  await settings.openProfile()
  await appShell.expectProfilePage()
  await settings.expectActivePage('Profil')
  await settings.openLicenses()
  await settings.expectLicensesPage()
  await settings.expectActivePage('Lizenz')
  await harness.goBack()
  await appShell.expectProfilePage()
  await settings.expectActivePage('Profil')
  await harness.goForward()
  await settings.expectLicensesPage()
  await settings.expectActivePage('Lizenz')
  await language.changeInterfaceLanguage('en')
  await settings.expectLicensesPage('en')
  await settings.expectActivePage('License', 'en')
  await harness.reload()
  await settings.expectLicensesPage('en')
  await settings.expectActivePage('License', 'en')
})

test('shows the complete unchanged project license in both interface languages', async ({
  harness,
  releaseNotes,
  settings,
  language,
}) => {
  const originalLicense = await readFile('LICENSE', 'utf8')
  await harness.open('/de/einstellungen/lizenzen')
  await releaseNotes.acknowledgeReleaseNotes()
  await settings.expectLicensesPage()
  await settings.openProjectLicense()
  await settings.expectProjectLicenseScope()
  const displayedLicense = await settings.readProjectLicense()
  expect(displayedLicense).toBe(originalLicense)
  for (const passage of [
    'Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>',
    '13. Remote Network Interaction; Use with the GNU General Public License.',
    'END OF TERMS AND CONDITIONS',
    'How to Apply These Terms to Your New Programs',
  ])
    expect(displayedLicense).toContain(passage)

  await language.changeInterfaceLanguage('en')
  await settings.expectLicensesPage('en')
  await settings.openProjectLicense()
  await settings.expectProjectLicenseScope('en')
  expect(await settings.readProjectLicense()).toBe(originalLicense)
})

test('opens the project license with the keyboard at 320px in both themes', async ({
  harness,
  releaseNotes,
  settings,
  layout,
  theme,
  appShell,
  language,
}) => {
  await harness.setViewport(320, 900)
  await harness.useSystemTheme('light')
  await harness.open('/settings')
  await releaseNotes.acknowledgeReleaseNotes()
  await settings.expectNavigationKeyboardOrder()
  await settings.openLicensesWithKeyboard()
  await settings.expectLicensesPage()
  await settings.expectActivePage('Lizenz')
  await settings.openProjectLicense(true)
  await settings.expectProjectLicenseScope()
  await theme.expectResolvedTheme('light')
  expect(await layout.documentOverflows()).toBe(false)
  await harness.useSystemTheme('dark')
  await theme.expectResolvedTheme('dark')
  await settings.expectProjectLicenseScope()
  expect(await layout.documentOverflows()).toBe(false)
  await appShell.openMenuWithKeyboard()
  await language.changeInterfaceLanguageWithKeyboard('en')
  await appShell.expectMenuClosed()
  await settings.expectLicensesPage('en')
  await settings.expectActivePage('License', 'en')
  await settings.openProjectLicense(true)
  await settings.expectProjectLicenseScope('en')
  expect(await layout.documentOverflows()).toBe(false)
  await harness.useSystemTheme('light')
  await theme.expectResolvedTheme('light')
  await settings.expectProjectLicenseScope('en')
  expect(await layout.documentOverflows()).toBe(false)
})

test('synchronizes explicit appearance selection with the header shortcut and persists System mode', async ({
  harness,
  releaseNotes,
  settings,
  theme,
}) => {
  await harness.open('/settings')
  await releaseNotes.acknowledgeReleaseNotes()
  await settings.expectAppearance('System')
  await settings.selectAppearance('Dunkel')
  await settings.expectAppearance('Dunkel')
  await theme.expectThemePreference('Dunkel')
  await theme.expectResolvedTheme('dark')
  await theme.cycleTheme()
  await settings.expectAppearance('System')
  await settings.selectAppearance('Hell')
  await theme.expectThemePreference('Hell')
  await theme.expectResolvedTheme('light')
  await harness.reload()
  await settings.expectAppearance('Hell')
  await theme.expectThemePreference('Hell')
  await settings.selectAppearance('System')
  await harness.useSystemTheme('dark')
  await theme.expectResolvedTheme('dark')
  await harness.useSystemTheme('light')
  await theme.expectResolvedTheme('light')
  await harness.reload()
  await settings.expectAppearance('System')
})

test('keeps profile changes unsaved, guards aside navigation, and exports only the saved profile', async ({
  harness,
  releaseNotes,
  appShell,
  settings,
  businessProfile,
  artifacts,
}) => {
  const saved = createBusinessProfileScenario()
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(saved)
  await businessProfile.expectProfileSaved()
  await appShell.expectProfilePage()
  await businessProfile.enterDetails({
    businessName: 'Noch nicht gespeicherter Betrieb',
  })
  const download = await artifacts.captureDownload(() =>
    businessProfile.exportBackup(),
  )
  expect(download.suggestedFilename()).toBe('regningen-unternehmensprofil.json')
  expect(JSON.parse(await artifacts.readText(download)).profile).toEqual(saved)

  await settings.openGeneral()
  await businessProfile.expectUnsavedChangesWarning()
  await businessProfile.keepUnsavedChanges()
  await appShell.expectProfilePage()
  await businessProfile.expectFieldValue(
    'businessName',
    'Noch nicht gespeicherter Betrieb',
  )
  await settings.openLicenses()
  await businessProfile.expectUnsavedChangesWarning()
  await businessProfile.keepUnsavedChanges()
  await appShell.expectProfilePage()
  await businessProfile.expectFieldValue(
    'businessName',
    'Noch nicht gespeicherter Betrieb',
  )
  await settings.openLicenses()
  await businessProfile.discardUnsavedChanges()
  await settings.expectLicensesPage()
  await settings.openProfile()
  await businessProfile.expectFieldValue('businessName', saved.businessName)
  await businessProfile.enterDetails({
    businessName: 'Bewusst gespeicherter Betrieb',
  })
  await businessProfile.saveProfile()
  await businessProfile.expectProfileSaved()
  await appShell.expectProfilePage()
  await businessProfile.openInvoiceEditor()
  await businessProfile.expectUnsavedChangesWarningAbsent()
  await appShell.navigateToBusinessProfile()
  await businessProfile.expectFieldValue(
    'businessName',
    'Bewusst gespeicherter Betrieb',
  )
})

for (const width of [320, 1024]) {
  test(`keeps settings navigation visible ${width < 768 ? 'above' : 'beside'} content at ${width}px`, async ({
    harness,
    releaseNotes,
    settings,
    layout,
  }) => {
    await harness.setViewport(width, 900)
    await harness.open('/settings')
    await releaseNotes.acknowledgeReleaseNotes()
    await settings.expectActivePage('Allgemein')
    const arrangement = await layout.settingsArrangement()
    expect(arrangement.overflows).toBe(false)
    if (width < 768) {
      expect(
        arrangement.aside.y + arrangement.aside.height,
      ).toBeLessThanOrEqual(arrangement.content.y)
    } else {
      expect(arrangement.aside.x + arrangement.aside.width).toBeLessThanOrEqual(
        arrangement.content.x,
      )
    }
  })
}

test('stages imported backup replacement until Save and allows cancelling replacement', async ({
  harness,
  releaseNotes,
  settings,
  businessProfile,
  artifacts,
}) => {
  const saved = createBusinessProfileScenario()
  const imported = createBusinessProfileScenario({
    businessName: 'Importierter Betrieb',
  })
  const backup = {
    name: 'profile.json',
    contents: JSON.stringify({
      format: 'regningen-business-profile',
      version: 1,
      profile: imported,
    }),
  }
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(saved)
  await businessProfile.enterDetails({ businessName: 'Lokale Bearbeitung' })
  await businessProfile.chooseBackup(backup)
  await businessProfile.cancelBackupReplacement()
  await businessProfile.expectFieldValue('businessName', 'Lokale Bearbeitung')
  await businessProfile.chooseBackup(backup)
  await businessProfile.confirmBackupReplacement()
  await businessProfile.expectFieldValue('businessName', imported.businessName)
  const beforeSave = await artifacts.captureDownload(() =>
    businessProfile.exportBackup(),
  )
  expect(JSON.parse(await artifacts.readText(beforeSave)).profile).toEqual(
    saved,
  )
  await businessProfile.saveProfile()
  await businessProfile.expectProfileSaved()
  await settings.openGeneral()
  await businessProfile.expectUnsavedChangesWarningAbsent()
  await settings.openProfile()
  await businessProfile.expectFieldValue('businessName', imported.businessName)
  const afterSave = await artifacts.captureDownload(() =>
    businessProfile.exportBackup(),
  )
  expect(JSON.parse(await artifacts.readText(afterSave)).profile).toEqual(
    imported,
  )
})

test('guards browser Back and native reload while profile changes are unsaved, but not reverted changes', async ({
  harness,
  releaseNotes,
  appShell,
  settings,
  businessProfile,
}) => {
  const saved = createBusinessProfileScenario()
  await harness.open('/settings')
  await releaseNotes.acknowledgeReleaseNotes()
  await settings.openProfile()
  await businessProfile.configureBusinessProfile(saved)
  await businessProfile.enterDetails({
    businessName: 'Nicht gespeicherte Bearbeitung',
  })
  expect(await harness.cancelReloadAtUnsavedWarning()).toBe('beforeunload')
  await businessProfile.expectFieldValue(
    'businessName',
    'Nicht gespeicherte Bearbeitung',
  )
  await harness.goBack()
  await businessProfile.expectUnsavedChangesWarning()
  await businessProfile.keepUnsavedChanges()
  await appShell.expectProfilePage()
  await harness.goBack()
  await businessProfile.discardUnsavedChanges()
  await settings.expectGeneralPage()
  await harness.goForward()
  await appShell.expectProfilePage()
  await businessProfile.expectFieldValue('businessName', saved.businessName)
  await businessProfile.enterDetails({ businessName: 'Revert me' })
  await businessProfile.enterDetails({ businessName: saved.businessName })
  await settings.openGeneral()
  await settings.expectGeneralPage()
  await businessProfile.expectUnsavedChangesWarningAbsent()
})

test('retains incomplete Invoice Draft and an unsubmitted Position through all settings pages', async ({
  harness,
  releaseNotes,
  appShell,
  settings,
  businessProfile,
  invoice,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await appShell.navigateToInvoice()
  await invoice.enterInvoiceNumber('  settings-draft  ')
  await invoice.enterSubject('  unfinished subject  ')
  await invoice.enterRecipient({
    company: 'Recipient GmbH',
    name: '',
    street: 'Main Street 1',
    postalCode: 'invalid',
    town: '',
  })
  await invoice.chooseInvoiceDate('2026-06-15')
  await invoice.chooseVatRate(19)
  await invoice.addPosition({
    description: 'Existing position',
    amount: '12,00',
  })
  await invoice.editPosition(1, 'amount', 'not-money')
  await invoice.enterNewPosition({
    description: '  unsubmitted  ',
    amount: '0,',
  })
  await appShell.navigateToSettings()
  await settings.expectGeneralPage()
  await settings.openProfile()
  await businessProfile.expectEditorReady()
  await settings.openLicenses()
  await settings.expectLicensesPage()
  await settings.openProfile()
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
  await appShell.navigateToInvoice()
  await invoice.expectInvoiceNumber('  settings-draft  ')
  await invoice.expectSubject('  unfinished subject  ')
  await invoice.expectRecipientField('company', 'Recipient GmbH')
  await invoice.expectRecipientField('name', '')
  await invoice.expectRecipientField('street', 'Main Street 1')
  await invoice.expectRecipientField('postalCode', 'invalid')
  await invoice.expectRecipientField('town', '')
  await invoice.expectSelectedDate('2026-06-15')
  await invoice.expectVatRate(19)
  await invoice.expectPositionValue(1, 'description', 'Existing position')
  await invoice.expectPositionValue(1, 'amount', 'not-money')
  await invoice.expectNewPositionValues({
    description: '  unsubmitted  ',
    amount: '0,',
  })
})

test('cancels reset without losing work, then clears app data without deleting unrelated storage or downloaded backups', async ({
  harness,
  releaseNotes,
  appShell,
  settings,
  businessProfile,
  invoice,
  theme,
  artifacts,
}) => {
  const profile = createBusinessProfileScenario()
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(profile)
  const backup = await artifacts.captureDownload(() =>
    businessProfile.exportBackup(),
  )
  const backupContents = await artifacts.readText(backup)
  await harness.createUnrelatedOriginData()
  await appShell.navigateToInvoice()
  await invoice.enterInvoiceNumber('reset-draft')
  await invoice.enterNewPosition({
    description: '  pending position  ',
    amount: 'not-money',
  })
  await appShell.navigateToSettings()
  await settings.selectAppearance('Dunkel')
  await settings.requestReset()
  await settings.expectResetConfirmation()
  await settings.cancelReset()
  await settings.expectAppearance('Dunkel')
  await settings.openProfile()
  await businessProfile.expectFieldValue('businessName', profile.businessName)
  await appShell.navigateToInvoice()
  await invoice.expectInvoiceNumber('reset-draft')
  await invoice.expectNewPositionValues({
    description: '  pending position  ',
    amount: 'not-money',
  })
  await appShell.navigateToSettings()
  await settings.requestReset()
  await settings.confirmReset()
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.acknowledgeReleaseNotes()
  await appShell.expectProfilePage()
  for (const field of Object.keys(profile) as Array<keyof typeof profile>) {
    await businessProfile.expectFieldValue(field, '')
  }
  await businessProfile.expectBackupExportDisabled()
  await theme.expectThemePreference('System')
  expect(await harness.unrelatedOriginData()).toEqual({
    local: 'unrelated local data',
    session: 'unrelated session data',
    cached: 'unrelated cached data',
  })
  expect(await artifacts.readText(backup)).toBe(backupContents)
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario({ businessName: 'Fresh business' }),
  )
  await appShell.navigateToInvoice()
  await invoice.expectNewInvoiceDraft()
  await invoice.expectSubject('')
  await invoice.expectNewPositionValues({ description: '', amount: '' })
  await harness.reload()
  await invoice.expectNewInvoiceDraft()
  await invoice.expectNewPositionValues({ description: '', amount: '' })
})

test('reports incomplete reset and can retry after browser removal recovers', async ({
  harness,
  releaseNotes,
  appShell,
  settings,
  businessProfile,
  storageFaults,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await appShell.navigateToSettings()
  await storageFaults.preventProfileRemoval()
  await settings.requestReset()
  await settings.confirmReset()
  await settings.expectIncompleteReset()
  await storageFaults.restoreProfileRemoval()
  await settings.requestReset()
  await settings.confirmReset()
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.acknowledgeReleaseNotes()
  await appShell.expectProfilePage()
  await businessProfile.expectFieldValue('businessName', '')
  await businessProfile.expectBackupExportDisabled()
})

test('invalidates dirty profile edits and a suspended tab’s independent Invoice Draft after application reset', async ({
  harness,
  releaseNotes,
  appShell,
  settings,
  businessProfile,
  invoice,
  robotsForPage,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await appShell.navigateToInvoice()
  await invoice.enterInvoiceNumber('active-old-draft')
  const suspendedPage = await harness.openAdditionalPage('/invoice')
  const suspended = robotsForPage(suspendedPage)
  await suspended.invoice.enterInvoiceNumber('suspended-old-draft')
  await suspended.invoice.enterNewPosition({
    description: 'Stale pending row',
    amount: 'not-money',
  })
  const profileEditor = robotsForPage(
    await harness.openAdditionalPage('/settings/profile'),
  )
  await profileEditor.businessProfile.enterDetails({
    businessName: 'Stale unsaved profile',
  })
  await harness.suspendPage(suspendedPage)
  await appShell.navigateToSettings()
  await settings.requestReset()
  await settings.confirmReset()
  await releaseNotes.expectReleaseNotesDialog()
  await profileEditor.releaseNotes.expectReleaseNotesDialog()
  await harness.resumePage(suspendedPage)
  await suspended.releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.acknowledgeReleaseNotes()
  await profileEditor.releaseNotes.expectReleaseNotesClosed()
  await suspended.releaseNotes.expectReleaseNotesClosed()
  await profileEditor.appShell.expectProfilePage()
  await profileEditor.businessProfile.expectFieldValue('businessName', '')
  await profileEditor.businessProfile.expectSaveDisabled()
  await suspended.appShell.expectProfilePage()
  await suspended.businessProfile.expectFieldValue('businessName', '')
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario({ businessName: 'New generation' }),
  )
  await appShell.navigateToInvoice()
  await invoice.expectNewInvoiceDraft()
  await suspended.appShell.navigateToInvoice()
  await suspended.invoice.expectNewInvoiceDraft()
  await suspended.invoice.expectNewPositionValues({
    description: '',
    amount: '',
  })
})

test('requests installation and PDF notification permission only after explicit settings interaction', async ({
  page,
  context,
  harness,
  releaseNotes,
  appShell,
  settings,
  businessProfile,
  invoice,
  pwa,
}) => {
  const capabilities = new PwaBrowserCapabilities(context)
  await capabilities.observeNotifications('http://127.0.0.1:3000', 'default')
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await businessProfile.configureBusinessProfile(
    createBusinessProfileScenario(),
  )
  await appShell.navigateToInvoice()
  await invoice.enterInvoiceNumber('keep-after-install-cancel')
  await appShell.navigateToSettings()
  await settings.expectCentralizedControls()
  await capabilities.offerDismissedInstallation(page)
  expect(await capabilities.installationPromptCount(page)).toBe(0)
  expect(
    (await capabilities.notificationObservation(page)).permissionRequests,
  ).toBe(0)
  await settings.requestInstallation()
  expect(await capabilities.installationPromptCount(page)).toBe(1)
  expect(
    (await capabilities.notificationObservation(page)).permissionRequests,
  ).toBe(0)
  await pwa.enableNotifications()
  await pwa.expectNotificationsEnabled()
  expect(
    (await capabilities.notificationObservation(page)).permissionRequests,
  ).toBe(1)
  await pwa.disableNotifications()
  await pwa.expectNotificationsDisabled()
  expect((await capabilities.notificationObservation(page)).permission).toBe(
    'granted',
  )
  await capabilities.setNotificationPermission(page, 'denied')
  await settings.expectNotificationsDenied()
  expect(
    (await capabilities.notificationObservation(page)).permissionRequests,
  ).toBe(1)
  await settings.openProfile()
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
  await appShell.navigateToInvoice()
  await invoice.expectInvoiceNumber('keep-after-install-cancel')
})
