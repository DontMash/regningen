import { test } from '../support/playwright/vitals'
import { budgets } from '../support/playwright/vitals-budgets'

test('general settings in its normal usable state', async ({ vitals }) => {
  await vitals.audit({
    path: '/de/einstellungen',
    budgets: budgets.settings,
    prepare: async ({ page, releaseNotes, settings }) => {
      await page.goto('/de')
      await releaseNotes.expectReleaseNotesDialog()
      await releaseNotes.acknowledgeReleaseNotes()
      await releaseNotes.expectReleaseNotesClosed()
      await page.goto('/de/einstellungen')
      await settings.selectAppearance('Hell')
    },
    verify: async ({ releaseNotes, settings }) => {
      await releaseNotes.expectReleaseNotesClosed()
      await settings.expectGeneralPage()
      await settings.expectAppearance('Hell')
    },
  })
})
