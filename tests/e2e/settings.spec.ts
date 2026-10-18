import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { PwaBrowserCapabilities } from '../support/playwright/pwa-capabilities'
import { expect, test } from '../support/playwright/playwright'

test('opens all Settings destinations with one active link, normal history and localized notices', async ({
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
  await settings.expectActivePage('Lizenzen und Hinweise')
  await harness.goBack()
  await appShell.expectProfilePage()
  await settings.expectActivePage('Profil')
  await harness.goForward()
  await settings.expectLicensesPage()
  await settings.expectActivePage('Lizenzen und Hinweise')
  await language.changeInterfaceLanguage('en')
  await settings.expectLicensesPage('en')
  await settings.expectActivePage('Licenses and notices', 'en')
  await harness.reload()
  await settings.expectLicensesPage('en')
  await settings.expectActivePage('Licenses and notices', 'en')
})

test('reads complete original project, software and font notices and saves the same local texts', async ({
  harness,
  releaseNotes,
  settings,
  language,
  artifacts,
}) => {
  await harness.open('/de/einstellungen/lizenzen')
  await releaseNotes.acknowledgeReleaseNotes()
  await settings.expectLicensesPage()
  await settings.openProjectLicense()
  await settings.expectProjectLicenseScope()
  const projectLicense = await settings.readProjectLicense()
  for (const text of [
    'GNU AFFERO GENERAL PUBLIC LICENSE',
    'Version 3, 19 November 2007',
    'Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>',
    '13. Remote Network Interaction; Use with the GNU General Public License.',
    'END OF TERMS AND CONDITIONS',
    'How to Apply These Terms to Your New Programs',
    'If your software can interact with users remotely through a computer',
  ])
    expect(projectLicense).toContain(text)
  expect(projectLicense!.length).toBeGreaterThan(34000)

  await settings.openNotice('ibantools', '4.5.4')
  await settings.expectNotice('ibantools', '4.5.4', 'MIT', [ibantoolsMit])
  const germanIbanTexts = await settings.readNoticeTexts('ibantools', '4.5.4')
  await settings.openNotice('pako', '1.0.11')
  await settings.expectNotice('pako', '1.0.11', '(MIT AND Zlib)', [
    pakoMit,
    pakoZlib,
  ])
  const pakoTexts = await settings.readNoticeTexts('pako', '1.0.11')
  for (const font of fontNotices) {
    await settings.openNotice(font.name, '5.3.0')
    await settings.expectFontNotice(font.name, '5.3.0')
    await settings.expectNotice(font.name, '5.3.0', 'OFL-1.1', [
      `${font.copyright}\n\n${openFontLicense}`,
    ])
  }
  await settings.openNotice('class-variance-authority', '0.7.1')
  await settings.expectNotice(
    'class-variance-authority',
    '0.7.1',
    'Apache-2.0',
    [
      'Apache License',
      'Version 2.0, January 2004',
      'END OF TERMS AND CONDITIONS',
      'Copyright 2022 Joe Bell',
    ],
  )

  const download = await artifacts.captureDownload(() =>
    settings.downloadNotices(),
  )
  expect(download.suggestedFilename()).toBe('third-party-notices.txt')
  const downloaded = await artifacts.readText(download)
  for (const text of [
    'regningen 1.0.0',
    'AGPL-3.0-only',
    'Copyright (C) 2026 soren.codes',
    'ibantools@4.5.4',
    'pako@1.0.11',
    'MIT AND Zlib',
    ...fontNotices.map((font) => `${font.name}@5.3.0`),
    projectLicense!,
    ibantoolsMit,
    pakoMit,
    pakoZlib,
    ...germanIbanTexts,
    ...pakoTexts,
    ...fontNotices.map((font) => `${font.copyright}\n\n${openFontLicense}`),
  ])
    expect(downloaded).toContain(text)

  await language.changeInterfaceLanguage('en')
  await settings.expectLicensesPage('en')
  await settings.openProjectLicense()
  await settings.expectProjectLicenseScope('en')
  expect(await settings.readProjectLicense()).toBe(projectLicense)
  await settings.openNotice('ibantools', '4.5.4')
  await settings.expectNotice('ibantools', '4.5.4', 'MIT', [ibantoolsMit])
  expect(await settings.readNoticeTexts('ibantools', '4.5.4')).toEqual(
    germanIbanTexts,
  )
  for (const font of fontNotices)
    await settings.expectFontNotice(font.name, '5.3.0', 'en')
  const englishDownload = await artifacts.captureDownload(() =>
    settings.downloadNotices(),
  )
  expect(await artifacts.readText(englishDownload)).toBe(downloaded)
})

test('opens Settings notices and full legal disclosures with the keyboard at 320px in both themes', async ({
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
  await settings.expectActivePage('Lizenzen und Hinweise')
  await settings.openProjectLicense(true)
  await settings.expectProjectLicenseScope()
  await settings.openNotice('ibantools', '4.5.4', true)
  await settings.expectNotice('ibantools', '4.5.4', 'MIT', [ibantoolsMit])
  await settings.openNotice(
    '@fontsource-variable/jetbrains-mono',
    '5.3.0',
    true,
  )
  await settings.expectNotice(
    '@fontsource-variable/jetbrains-mono',
    '5.3.0',
    'OFL-1.1',
    [openFontLicense],
  )
  await theme.expectResolvedTheme('light')
  expect(await layout.documentOverflows()).toBe(false)
  await harness.useSystemTheme('dark')
  await theme.expectResolvedTheme('dark')
  await settings.expectNotice('ibantools', '4.5.4', 'MIT', [ibantoolsMit])
  expect(await layout.documentOverflows()).toBe(false)
  await appShell.openMenuWithKeyboard()
  await language.changeInterfaceLanguageWithKeyboard('en')
  await appShell.expectMenuClosed()
  await settings.expectLicensesPage('en')
  await settings.expectActivePage('Licenses and notices', 'en')
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

// Independent upstream legal evidence, not expectations derived from the generated dataset.
const mitGrant = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:`

const ibantoolsMit = `MIT License

Copyright (c) Saša Jovanić

${mitGrant}

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

const pakoMit = `(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

${mitGrant}

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`

const pakoZlib = `Copyright notice:

 (C) 1995-2013 Jean-loup Gailly and Mark Adler

Copyright (c) <''year''> <''copyright holders''>

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.


  Jean-loup Gailly        Mark Adler
  jloup@gzip.org          madler@alumni.caltech.edu
`

const fontNotices = [
  {
    name: '@fontsource-variable/inter',
    copyright:
      'Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) Inter-Italic[opsz,wght].ttf: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)',
  },
  {
    name: '@fontsource-variable/lora',
    copyright:
      'Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora". Lora-Italic[wght].ttf: Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora".',
  },
  {
    name: '@fontsource-variable/jetbrains-mono',
    copyright:
      'Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) JetBrainsMono-Italic[wght].ttf: Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)',
  },
]

const openFontLicense = `This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
`
