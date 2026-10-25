import { test } from '../support/playwright/vitals'
import { budgets } from '../support/playwright/vitals-budgets'

test('licenses in its normal readable state', async ({ vitals }) => {
  await vitals.audit({
    path: '/de/einstellungen/lizenzen',
    expectedNoindex: true,
    budgets: budgets.licenses,
    prepare: async ({ page, releaseNotes, settings }) => {
      await page.goto('/de')
      await releaseNotes.expectReleaseNotesDialog()
      await releaseNotes.acknowledgeReleaseNotes()
      await releaseNotes.expectReleaseNotesClosed()
      await page.goto('/de/einstellungen')
      await settings.selectAppearance('Hell')
      await settings.openLicenses()
      await settings.expectLicensesPage()
    },
    verify: async ({ releaseNotes, settings }) => {
      await releaseNotes.expectReleaseNotesClosed()
      await settings.expectLicensesPage()
    },
  })
})
