import { expect, test } from '../support/playwright/playwright'

test('cycles and persists the selected theme mode', async ({
  harness,
  layout,
  releaseNotes,
  theme,
}) => {
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()
  await theme.expectThemePreference('System')

  await theme.cycleTheme()
  await theme.expectThemePreference('Hell')
  await theme.expectResolvedTheme('light')
  const lightBackground = await layout.bodyBackgroundColor()

  await theme.cycleTheme()
  await theme.expectThemePreference('Dunkel')
  await theme.expectResolvedTheme('dark')
  await expect
    .poll(async () => layout.bodyBackgroundColor())
    .not.toBe(lightBackground)

  await harness.reload()
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.dismissReleaseNotes()
  await theme.expectThemePreference('Dunkel')
  await theme.expectResolvedTheme('dark')

  await theme.cycleTheme()
  await theme.expectThemePreference('System')
  await harness.useSystemTheme('dark')
  await theme.expectResolvedTheme('dark')
})

test('follows the operating-system theme in system mode', async ({
  harness,
  releaseNotes,
  theme,
}) => {
  await harness.useSystemTheme('dark')
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()

  await theme.expectThemePreference('System')
  await theme.expectResolvedTheme('dark')
})

test('updates when the operating-system theme changes in system mode', async ({
  harness,
  releaseNotes,
  theme,
}) => {
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()
  await theme.expectResolvedTheme('light')

  await harness.useSystemTheme('dark')
  await theme.expectResolvedTheme('dark')

  await harness.useSystemTheme('light')
  await theme.expectResolvedTheme('light')
})

for (const locale of ['de', 'en'] as const) {
  for (const fault of ['access', 'write'] as const) {
    for (const control of ['header', 'settings'] as const) {
      test(`applies ${control} choice for this session despite storage ${fault} failure (${locale})`, async ({
        harness,
        releaseNotes,
        theme,
        settings,
        storageFaults,
      }) => {
        await harness.useSystemTheme('dark')
        await harness.open(
          locale === 'de' ? '/de/einstellungen' : '/en/settings',
        )
        await releaseNotes.dismissReleaseNotes()
        await settings.expectGeneralPage(locale)
        await settings.expectAppearance('System')
        await theme.expectThemePreference('System')
        await theme.expectResolvedTheme('dark')

        // Install faults only after ordinary route and release-note setup.
        await storageFaults.preventThemePersistence(fault)
        const light = locale === 'de' ? 'Hell' : 'Light'
        if (control === 'header') await theme.cycleTheme()
        else await settings.selectAppearance(light)
        await settings.expectAppearance(light)
        await theme.expectThemePreference(light)
        await theme.expectResolvedTheme('light')
        await theme.expectSessionWarning(locale)
        await harness.useSystemTheme('light')
        await harness.useSystemTheme('dark')
        await theme.expectResolvedTheme('light')
        await storageFaults.restoreThemePersistence()
      })
    }
  }
}

test('retains the session choice when opening a newly mounted mobile shortcut after a failed write', async ({
  harness,
  releaseNotes,
  settings,
  theme,
  appShell,
  storageFaults,
}) => {
  await harness.setViewport(390, 844)
  await harness.useSystemTheme('dark')
  await harness.open('/de/einstellungen')
  await releaseNotes.dismissReleaseNotes()
  await settings.expectGeneralPage()
  await storageFaults.preventThemePersistence('write')
  await settings.selectAppearance('Hell')
  await settings.expectAppearance('Hell')
  await theme.expectResolvedTheme('light')
  await theme.expectSessionWarning('de')
  await appShell.openMenu()
  await theme.expectThemePreference('Hell')
  await theme.expectResolvedTheme('light')
  await appShell.closeMenu()
  await settings.expectAppearance('Hell')
  await storageFaults.restoreThemePersistence()
})
