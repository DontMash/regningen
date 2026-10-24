import { test } from '../support/playwright/vitals'
import { budgets } from '../support/playwright/vitals-budgets'
import { createBusinessProfileScenario } from '../scenarios/business-profile'

test('Business Profile editing with a saved fictional profile', async ({
  vitals,
}) => {
  const profile = createBusinessProfileScenario()
  await vitals.audit({
    path: '/de/einstellungen/profil',
    expectedNoindex: true,
    budgets: budgets.profile,
    prepare: async ({ page, releaseNotes, settings, businessProfile }) => {
      await page.goto('/de')
      await releaseNotes.expectReleaseNotesDialog()
      await releaseNotes.acknowledgeReleaseNotes()
      await releaseNotes.expectReleaseNotesClosed()
      await page.goto('/de/einstellungen')
      await settings.selectAppearance('Hell')
      await settings.openProfile()
      await businessProfile.expectEditorReady()
      await businessProfile.configureBusinessProfile(profile)
      await businessProfile.expectProfileSaved()
    },
    verify: async ({ releaseNotes, businessProfile }) => {
      await releaseNotes.expectReleaseNotesClosed()
      await businessProfile.expectEditorReady()
      await businessProfile.expectFieldValue(
        'businessName',
        profile.businessName,
      )
      await businessProfile.expectFieldValue('iban', profile.iban)
    },
  })
})
