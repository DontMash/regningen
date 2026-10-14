import { expect, test } from '../support/playwright/playwright'

test('acknowledges the running release once and keeps its notes available from the footer', async ({
  footer,
  harness,
  releaseNotes,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.expectCurrentReleaseNotes()
  await releaseNotes.acknowledgeReleaseNotes()
  await releaseNotes.expectReleaseNotesClosed()
  await footer.expectFooterVersion('v1.0.0')
  await footer.openReleaseNotesFromFooter()
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.expectCurrentReleaseNotes()
  await releaseNotes.dismissReleaseNotes()

  await harness.reload()
  await releaseNotes.expectReleaseNotesClosed()
})

test('postpones notes only for this launch and shares acknowledgments with another tab', async ({
  appShell,
  harness,
  releaseNotes,
  robotsForPage,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.dismissReleaseNotesWithEscape()
  await releaseNotes.expectReleaseNotesClosed()
  await appShell.navigateToInvoice()
  await releaseNotes.expectReleaseNotesClosed()

  await harness.reload()
  await releaseNotes.expectReleaseNotesDialog()
  const secondPage = await harness.openAdditionalPage('/settings/profile')
  const secondReleaseNotes = robotsForPage(secondPage).releaseNotes
  await secondReleaseNotes.expectReleaseNotesDialog()
  await secondReleaseNotes.acknowledgeReleaseNotes()
  await secondReleaseNotes.expectReleaseNotesClosed()
  await releaseNotes.expectReleaseNotesClosed()

  await harness.reload()
  await releaseNotes.expectReleaseNotesClosed()
  const thirdPage = await harness.openAdditionalPage('/settings/profile')
  await robotsForPage(thirdPage).releaseNotes.expectReleaseNotesClosed()
})

test('chooses the drawer below 768px and the dialog at 768px', async ({
  harness,
  releaseNotes,
}) => {
  await harness.setViewport(767, 900)
  await harness.open('/settings/profile')
  await releaseNotes.expectReleaseNotesPresentation('drawer-popup')
  await releaseNotes.dismissReleaseNotes()

  await harness.setViewport(768, 900)
  await harness.open('/settings/profile')
  await releaseNotes.expectReleaseNotesPresentation('dialog-popup')
  await releaseNotes.dismissReleaseNotesOutside()
  await releaseNotes.expectReleaseNotesClosed()
})

for (const width of [375, 1024]) {
  test(`keeps release version controls pinned and scrolls content flush to the footer at ${width}px`, async ({
    harness,
    layout,
    releaseNotes,
  }) => {
    await harness.setViewport(width, 600)
    await harness.open('/settings/profile')
    await releaseNotes.expectReleaseNotesDialog()
    await releaseNotes.selectReleaseVersion('v1.0.0')
    const before = await layout.releaseNotesScrollLayout()

    await releaseNotes.scrollReleaseNotes('middle')
    const scrolled = await layout.releaseNotesScrollLayout()

    expect(scrolled.viewport.scrollTop).toBeGreaterThan(0)
    expect(scrolled.version.y).toBeCloseTo(before.version.y, 0)
    expect(scrolled.selector.y).toBeCloseTo(before.selector.y, 0)
    expect(scrolled.firstHeading.y).toBeLessThan(before.firstHeading.y)
    expect(scrolled.viewport.bottom).toBeCloseTo(scrolled.footer.y, 0)
    expect(scrolled.viewport.paddingTop).toBe(0)
    expect(scrolled.viewport.paddingBottom).toBe(0)

    await releaseNotes.scrollReleaseNotes('end')
    await releaseNotes.expectReleaseNotesEndVisible()
    await releaseNotes.selectReleaseVersion('v1.0.0')
    await releaseNotes.acknowledgeReleaseNotes()
    await releaseNotes.expectReleaseNotesClosed()
  })
}

test.describe('release notes at fractional pixel scaling', () => {
  test.use({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1.1 })

  test('does not let scrolled text peek between the title and pinned version controls', async ({
    harness,
    layout,
    releaseNotes,
  }) => {
    await harness.useSystemTheme('dark')
    await harness.open('/settings/profile')
    await releaseNotes.expectReleaseNotesDialog()
    await releaseNotes.selectReleaseVersion('v1.0.0')
    await harness.waitForFonts()

    // Align changelog text with the seam exposed by fractional-pixel painting.
    await releaseNotes.scrollReleaseNotes(226)

    expect(await layout.releaseNotesHeaderSeamBrightPixels()).toBe(0)
  })
})

test('keeps profile editing available when release-note acknowledgment cannot be saved', async ({
  businessProfile,
  harness,
  releaseNotes,
  storageFaults,
}) => {
  await storageFaults.preventReleaseNotesWrites()
  await harness.open('/settings/profile')
  await releaseNotes.expectReleaseNotesDialog()
  await releaseNotes.acknowledgeReleaseNotes()
  await releaseNotes.expectReleaseAcknowledgmentWarning()
  await releaseNotes.expectReleaseNotesClosed()

  await businessProfile.expectEditorReady()
  await businessProfile.enterDetails({ businessName: 'Nordlicht Catering' })
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
})
