import { test } from '../support/playwright/vitals'
import { budgets } from '../support/playwright/vitals-budgets'

test('homepage after acknowledging release notes', async ({ vitals }) => {
  await vitals.audit({
    path: '/de',
    expectedNoindex: false,
    budgets: budgets.home,
    prepare: async ({ page, releaseNotes, settings }) => {
      await page.goto('/de')
      await releaseNotes.expectReleaseNotesDialog()
      await releaseNotes.acknowledgeReleaseNotes()
      await releaseNotes.expectReleaseNotesClosed()
      await page.goto('/de/einstellungen')
      await settings.selectAppearance('Hell')
    },
    verify: async ({ landing, releaseNotes }) => {
      await releaseNotes.expectReleaseNotesClosed()
      await landing.expectIntroduction()
    },
  })
})

test('first visit with automatic release notes', async ({ vitals }) => {
  await vitals.audit({
    path: '/de',
    expectedNoindex: false,
    budgets: budgets.homeFirst,
    prepare: async () => {},
    verify: async ({ landing, releaseNotes }) => {
      await releaseNotes.expectReleaseNotesDialog()
      await landing.expectIntroduction({ obscured: true })
    },
  })
})
