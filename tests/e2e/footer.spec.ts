import { expect, test } from '../support/playwright/playwright'

test('shows footer branding and feature destinations', async ({
  footer,
  harness,
  releaseNotes,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await footer.expectFooterDestinations()
})

test('links the footer attribution to soren in a new tab', async ({
  footer,
  harness,
  releaseNotes,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await footer.expectAuthorAttribution()
})

test('keeps the footer below the first screen on short pages', async ({
  appShell,
  footer,
  harness,
  layout,
  releaseNotes,
}) => {
  for (const width of [375, 1280]) {
    await harness.setViewport(width, 800)
    await harness.open('/not-a-route')
    await releaseNotes.dismissReleaseNotes()
    await appShell.expectUnknownRoute()
    expect(await layout.mainContentHeight()).toBeGreaterThanOrEqual(800)
    await footer.expectFooterBelowViewport()
  }
})

test('returns to the header through the keyboard-accessible footer link', async ({
  footer,
  harness,
  layout,
  releaseNotes,
}) => {
  await harness.open('/settings/profile')
  await releaseNotes.dismissReleaseNotes()
  await footer.scrollToBackToTopLink()
  const scrollBefore = await layout.pageScrollPosition()
  await footer.activateBackToTopWithKeyboard()
  expect(scrollBefore).toBeGreaterThan(0)
  await footer.expectBackToTopFragment()
  await expect.poll(() => layout.pageScrollPosition()).toBe(0)
})
