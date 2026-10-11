import { expect, test } from '../support/playwright'

test('shows the German Regningen shell and opens first-time Business Profile setup', async ({
  application,
  harness,
  layout,
}) => {
  await harness.open('/')

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
  await application.expectFooterDestinations()
})

test('links the footer attribution to soren in a new tab', async ({
  application,
  harness,
}) => {
  await harness.open('/business-profile')
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
  const scrollBefore = await application.activateBackToTopWithKeyboard()
  expect(scrollBefore).toBeGreaterThan(0)
  await application.expectBackToTopFragment()
  await application.expectPageAtTop()
})

test('standalone typography matches typeset-default at mobile and desktop widths', async ({
  harness,
  layout,
}) => {
  await harness.open('/business-profile')
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

  await application.expectThemePreference('System')
  await application.expectResolvedTheme('dark')
})

test('recovers from an unknown route to first-time Business Profile setup', async ({
  application,
  harness,
}) => {
  await harness.open('/not-a-route')
  await application.expectUnknownRoute()
  await application.returnToHomeFromUnknownRoute()
  await application.expectProfilePage()
})

test('updates when the operating-system theme changes in system mode', async ({
  application,
  harness,
}) => {
  await harness.open('/')
  await application.expectResolvedTheme('light')

  await harness.useSystemTheme('dark')
  await application.expectResolvedTheme('dark')

  await harness.useSystemTheme('light')
  await application.expectResolvedTheme('light')
})
