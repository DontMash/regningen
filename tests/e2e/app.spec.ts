import { expect, test } from '../support/playwright/playwright'

test('shows the German Regningen shell and opens first-time Business Profile setup', async ({
  application,
  harness,
  layout,
}) => {
  await harness.open('/')
  await application.expectReleaseNotesDialog()
  await application.expectCurrentReleaseNotes()
  await application.dismissReleaseNotes()

  await application.expectGermanApplicationShell()
  const headerBorder = await layout.headerBorderColors()
  expect(headerBorder.actual).toBe(headerBorder.expected)
  await application.expectApplicationTypography()
  await application.expectProfilePage()
})

test('shows footer branding and feature destinations', async ({
  application,
  harness,
}) => {
  await harness.open('/business-profile')
  await application.dismissReleaseNotes()
  await application.expectFooterDestinations()
})

test('links the footer attribution to soren in a new tab', async ({
  application,
  harness,
}) => {
  await harness.open('/business-profile')
  await application.dismissReleaseNotes()
  await application.expectAuthorAttribution()
})

test('keeps the footer below the first screen on short pages', async ({
  application,
  harness,
  layout,
}) => {
  for (const width of [375, 1280]) {
    await harness.setViewport(width, 800)
    await harness.open('/not-a-route')
    await application.dismissReleaseNotes()
    await application.expectUnknownRoute()
    expect(await layout.mainContentHeight()).toBeGreaterThanOrEqual(800)
    await application.expectFooterBelowViewport()
  }
})

test('uses smooth scrolling unless reduced motion is requested', async ({
  application,
  harness,
}) => {
  await harness.useReducedMotion('no-preference')
  await harness.open('/business-profile')
  await application.dismissReleaseNotes()
  await application.expectSmoothScrollBehavior('smooth')

  await harness.useReducedMotion('reduce')
  await application.expectSmoothScrollBehavior('auto')

  await harness.useReducedMotion('no-preference')
  await application.expectSmoothScrollBehavior('smooth')
})

test('returns to the header through the keyboard-accessible footer link', async ({
  application,
  harness,
}) => {
  await harness.open('/business-profile')
  await application.dismissReleaseNotes()
  const scrollBefore = await application.activateBackToTopWithKeyboard()
  expect(scrollBefore).toBeGreaterThan(0)
  await application.expectBackToTopFragment()
  await application.expectPageAtTop()
})

test('standalone typography matches typeset-default at mobile and desktop widths', async ({
  application,
  harness,
  layout,
}) => {
  await harness.open('/business-profile')
  await application.dismissReleaseNotes()
  await harness.waitForFonts()

  for (const width of [375, 1024]) {
    await harness.setViewport(width, 800)
    const styles = await layout.standaloneTypography(width)
    for (const { actual, expected } of Object.values(styles)) {
      expect(actual).toEqual(expected)
    }
  }
})

test('cycles and persists the selected theme mode', async ({
  application,
  harness,
  layout,
}) => {
  await harness.open('/')
  await application.dismissReleaseNotes()
  await application.expectThemePreference('System')

  await application.cycleTheme()
  await application.expectThemePreference('Hell')
  await application.expectResolvedTheme('light')
  const lightBackground = await layout.bodyBackgroundColor()

  await application.cycleTheme()
  await application.expectThemePreference('Dunkel')
  await application.expectResolvedTheme('dark')
  await expect
    .poll(async () => layout.bodyBackgroundColor())
    .not.toBe(lightBackground)

  await harness.reload()
  await application.expectReleaseNotesDialog()
  await application.dismissReleaseNotes()
  await application.expectThemePreference('Dunkel')
  await application.expectResolvedTheme('dark')

  await application.cycleTheme()
  await application.expectThemePreference('System')
  await harness.useSystemTheme('dark')
  await application.expectResolvedTheme('dark')
})

test('follows the operating-system theme in system mode', async ({
  application,
  harness,
}) => {
  await harness.useSystemTheme('dark')
  await harness.open('/')
  await application.dismissReleaseNotes()

  await application.expectThemePreference('System')
  await application.expectResolvedTheme('dark')
})

test('recovers from an unknown route to first-time Business Profile setup', async ({
  application,
  harness,
}) => {
  await harness.open('/not-a-route')
  await application.dismissReleaseNotes()
  await application.expectUnknownRoute()
  await application.returnToHomeFromUnknownRoute()
  await application.expectProfilePage()
})

test('updates when the operating-system theme changes in system mode', async ({
  application,
  harness,
}) => {
  await harness.open('/')
  await application.dismissReleaseNotes()
  await application.expectResolvedTheme('light')

  await harness.useSystemTheme('dark')
  await application.expectResolvedTheme('dark')

  await harness.useSystemTheme('light')
  await application.expectResolvedTheme('light')
})

test('acknowledges the running release once and keeps its notes available from the footer', async ({
  application,
  harness,
}) => {
  await harness.open('/business-profile')
  await application.expectReleaseNotesDialog()
  await application.acknowledgeReleaseNotes()
  await application.expectReleaseNotesClosed()
  await application.expectFooterVersion('v1.0.0')
  await application.openReleaseNotesFromFooter()
  await application.expectReleaseNotesDialog()
  await application.expectCurrentReleaseNotes()
  await application.dismissReleaseNotes()

  await harness.reload()
  await application.expectReleaseNotesClosed()
})

test('postpones notes only for this launch and shares acknowledgments with another tab', async ({
  application,
  harness,
  robotsForPage,
}) => {
  await harness.open('/business-profile')
  await application.expectReleaseNotesDialog()
  await application.dismissReleaseNotesWithEscape()
  await application.expectReleaseNotesClosed()
  await application.navigateToInvoice()
  await application.expectReleaseNotesClosed()

  await harness.reload()
  await application.expectReleaseNotesDialog()
  const secondPage = await harness.openAdditionalPage('/business-profile')
  const secondApplication = robotsForPage(secondPage).application
  await secondApplication.expectReleaseNotesDialog()
  await secondApplication.acknowledgeReleaseNotes()
  await secondApplication.expectReleaseNotesClosed()
  await application.expectReleaseNotesClosed()

  await harness.reload()
  await application.expectReleaseNotesClosed()
  const thirdPage = await harness.openAdditionalPage('/business-profile')
  await robotsForPage(thirdPage).application.expectReleaseNotesClosed()
})

test('chooses the drawer below 768px and the dialog at 768px', async ({
  application,
  harness,
}) => {
  await harness.setViewport(767, 900)
  await harness.open('/business-profile')
  await application.expectReleaseNotesPresentation('drawer-popup')
  await application.dismissReleaseNotes()

  await harness.setViewport(768, 900)
  await harness.open('/business-profile')
  await application.expectReleaseNotesPresentation('dialog-popup')
  await application.dismissReleaseNotesOutside()
  await application.expectReleaseNotesClosed()
})

for (const width of [375, 1024]) {
  test(`keeps release version controls pinned and scrolls content flush to the footer at ${width}px`, async ({
    application,
    harness,
    layout,
  }) => {
    await harness.setViewport(width, 600)
    await harness.open('/business-profile')
    await application.expectReleaseNotesDialog()
    await application.selectReleaseVersion('v1.0.0')
    const before = await layout.releaseNotesScrollLayout()

    await application.scrollReleaseNotes('middle')
    const scrolled = await layout.releaseNotesScrollLayout()

    expect(scrolled.viewport.scrollTop).toBeGreaterThan(0)
    expect(scrolled.version.y).toBeCloseTo(before.version.y, 0)
    expect(scrolled.selector.y).toBeCloseTo(before.selector.y, 0)
    expect(scrolled.firstHeading.y).toBeLessThan(before.firstHeading.y)
    expect(scrolled.viewport.bottom).toBeCloseTo(scrolled.footer.y, 0)
    expect(scrolled.viewport.paddingTop).toBe(0)
    expect(scrolled.viewport.paddingBottom).toBe(0)

    await application.scrollReleaseNotes('end')
    await application.expectReleaseNotesEndVisible()
    await application.selectReleaseVersion('v1.0.0')
    await application.acknowledgeReleaseNotes()
    await application.expectReleaseNotesClosed()
  })
}

test.describe('release notes at fractional pixel scaling', () => {
  test.use({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1.1 })

  test('does not let scrolled text peek between the title and pinned version controls', async ({
    application,
    harness,
    layout,
  }) => {
    await harness.useSystemTheme('dark')
    await harness.open('/business-profile')
    await application.expectReleaseNotesDialog()
    await application.selectReleaseVersion('v1.0.0')
    await harness.waitForFonts()

    // Align changelog text with the seam exposed by fractional-pixel painting.
    await application.scrollReleaseNotes(226)

    expect(await layout.releaseNotesHeaderSeamBrightPixels()).toBe(0)
  })
})

test('keeps profile editing available when release-note acknowledgment cannot be saved', async ({
  application,
  businessProfile,
  harness,
  storageFaults,
}) => {
  await storageFaults.preventReleaseNotesWrites()
  await harness.open('/business-profile')
  await application.expectReleaseNotesDialog()
  await application.acknowledgeReleaseNotes()
  await application.expectReleaseAcknowledgmentWarning()
  await application.expectReleaseNotesClosed()

  await businessProfile.expectEditorReady()
  await businessProfile.enterDetails({ businessName: 'Nordlicht Catering' })
  await businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
})
