import { expect, test } from '../support/playwright/playwright'

test('opens first-time Business Profile setup from home', async ({
  appShell,
  harness,
  releaseNotes,
}) => {
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()
  await appShell.expectProfilePage()
})

test('shows the Regningen shell with its application typography and header border', async ({
  appShell,
  harness,
  layout,
  releaseNotes,
}) => {
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()

  await appShell.expectApplicationShell()
  const headerBorder = await layout.headerBorderColors()
  expect(headerBorder.actual).toBe(headerBorder.expected)
  await appShell.expectApplicationTypography()
})

test('uses smooth scrolling unless reduced motion is requested', async ({
  appShell,
  harness,
  releaseNotes,
}) => {
  await harness.useReducedMotion('no-preference')
  await harness.open('/business-profile')
  await releaseNotes.dismissReleaseNotes()
  await appShell.expectSmoothScrollBehavior('smooth')

  await harness.useReducedMotion('reduce')
  await appShell.expectSmoothScrollBehavior('auto')

  await harness.useReducedMotion('no-preference')
  await appShell.expectSmoothScrollBehavior('smooth')
})

test('standalone typography matches typeset-default at mobile and desktop widths', async ({
  harness,
  layout,
  releaseNotes,
}) => {
  await harness.open('/business-profile')
  await releaseNotes.dismissReleaseNotes()
  await harness.waitForFonts()

  for (const width of [375, 1024]) {
    await harness.setViewport(width, 800)
    const styles = await layout.standaloneTypography(width)
    for (const { actual, expected } of Object.values(styles)) {
      expect(actual).toEqual(expected)
    }
  }
})

test('recovers from an unknown route to first-time Business Profile setup', async ({
  appShell,
  harness,
  releaseNotes,
}) => {
  await harness.open('/not-a-route')
  await releaseNotes.dismissReleaseNotes()
  await appShell.expectUnknownRoute()
  await appShell.returnToHomeFromUnknownRoute()
  await appShell.expectProfilePage()
})
