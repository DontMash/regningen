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
