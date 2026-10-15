import { test } from '../support/playwright/vitals'
import { budgets } from '../support/playwright/vitals-budgets'

test('general settings in its normal usable state', async ({ vitals }) => {
  await vitals.audit({
    path: '/settings',
    budgets: budgets.settings,
    prepare: async ({ page, releaseNotes, settings }) => {
      await page.goto('/')
      await releaseNotes.expectReleaseNotesDialog()
      await releaseNotes.acknowledgeReleaseNotes()
      await releaseNotes.expectReleaseNotesClosed()
      await page.goto('/settings')
      await settings.selectAppearance('Hell')
    },
    verify: async ({ releaseNotes, settings }) => {
      await releaseNotes.expectReleaseNotesClosed()
      await settings.expectGeneralPage()
      await settings.expectAppearance('Hell')
    },
  })
})
