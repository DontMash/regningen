import { test } from '../support/playwright/vitals'
import { budgets } from '../support/playwright/vitals-budgets'
import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { createInvoiceScenario } from '../scenarios/invoice'

test('populated Invoice editor retains its per-tab Invoice Draft', async ({
  vitals,
}) => {
  const profile = createBusinessProfileScenario()
  const example = createInvoiceScenario()
  await vitals.audit({
    path: '/invoice',
    budgets: budgets.invoice,
    prepare: async ({
      page,
      releaseNotes,
      settings,
      businessProfile,
      invoice,
    }) => {
      await page.goto('/')
      await releaseNotes.expectReleaseNotesDialog()
      await releaseNotes.acknowledgeReleaseNotes()
      await releaseNotes.expectReleaseNotesClosed()
      await page.goto('/settings')
      await settings.selectAppearance('Hell')
      await settings.openProfile()
      await businessProfile.expectEditorReady()
      await businessProfile.configureBusinessProfile(profile)
      await businessProfile.expectProfileSaved()
      await businessProfile.expectFieldValue(
        'businessName',
        profile.businessName,
      )
      await businessProfile.openInvoiceEditor()
      await invoice.expectReady()
      await invoice.enterInvoice(example.input)
      await invoice.expectSummaryTotals(example.expected.totals)
    },
    verify: async ({ releaseNotes, invoice }) => {
      await releaseNotes.expectReleaseNotesClosed()
      await invoice.expectReady()
      await invoice.expectInvoiceNumber(example.input.number)
      await invoice.expectSubject(example.input.subject)
      await invoice.expectRecipientField('name', example.input.recipient.name)
      await invoice.expectSelectedDate(example.input.date)
      await invoice.expectPositionCount(example.input.positions.length)
      await invoice.expectPositionValue(
        1,
        'description',
        example.input.positions[0].description,
      )
      await invoice.expectSummaryTotals(example.expected.totals)
      await invoice.expectPdfEnabled()
    },
  })
})
