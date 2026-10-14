import { createBusinessProfileScenario } from '../scenarios/business-profile'
import { expect, test } from '../support/playwright/playwright'

test('fits compact navigation into a 320px fullscreen menu', async ({
  appShell,
  harness,
  releaseNotes,
  layout,
}) => {
  await harness.setViewport(320, 720)
  await harness.open('/settings')
  await releaseNotes.acknowledgeReleaseNotes()
  await appShell.expectCompactHeader()
  await appShell.openMenu()
  await appShell.expectMenuContents()
  await appShell.expectMenuBusinessNameAbsent()
  const menu = await layout.navigationDrawer()
  expect(menu.surface).toEqual({ x: 0, y: 0, width: 320, height: 720 })
  expect(menu.overflows).toBe(false)
  expect(menu.settings.x + menu.settings.width).toBeLessThan(menu.theme.x)
  expect(menu.settings.y).toBe(menu.theme.y)
  expect(menu.theme.y + menu.theme.height).toBeGreaterThan(680)
  await appShell.closeMenu()
  await appShell.expectMenuClosed()
})

test('adapts the same open menu at 639, 640 and 1023px, then releases the desktop shell at 1024px', async ({
  appShell,
  harness,
  releaseNotes,
  layout,
}) => {
  await harness.setViewport(639, 600)
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  await appShell.expectCompactHeader()
  await appShell.openMenu()
  for (const width of [639, 640, 1023]) {
    await harness.setViewport(width, 600)
    await appShell.expectMenuContents()
    const menu = await layout.navigationDrawer()
    expect(menu.surface).toEqual({
      x: width < 640 ? 0 : width - 384,
      y: 0,
      width: width < 640 ? width : 384,
      height: 600,
    })
    expect(menu.overflows).toBe(false)
  }
  await harness.scrollPageBy(500)
  expect(await layout.pageScrollPosition()).toBe(0)
  await harness.setViewport(1024, 600)
  await appShell.expectMenuClosed()
  await appShell.expectDesktopHeader()
  await appShell.expectDesktopNavigationUsable()
  await harness.scrollPageBy(500)
  await expect.poll(() => layout.pageScrollPosition()).toBeGreaterThan(0)
  await harness.setViewport(639, 600)
  await appShell.expectMenuClosed()
  await appShell.expectCompactHeader()
  await appShell.openMenu()
  await appShell.expectMenuOpen()
})

for (const width of [375, 768]) {
  test(`navigates and retains an Invoice Draft using the menu at ${width}px, including current destinations`, async ({
    appShell,
    harness,
    releaseNotes,
    businessProfile,
    settings,
    invoice,
    layout,
  }) => {
    await harness.setViewport(width, 800)
    await harness.open('/settings/profile')
    await releaseNotes.acknowledgeReleaseNotes()
    await businessProfile.configureBusinessProfile(
      createBusinessProfileScenario(),
    )
    await appShell.openMenuWithKeyboard()
    await appShell.chooseMenuDestinationWithKeyboard('Rechnung')
    await appShell.expectMenuClosed()
    await invoice.expectReady()
    await appShell.expectDestinationFocused()
    await expect
      .poll(async () => {
        await harness.scrollPageBy(500)
        return layout.pageScrollPosition()
      })
      .toBeGreaterThan(0)
    await invoice.enterInvoiceNumber('compact-draft')
    await invoice.enterNewPosition({ description: 'Unsubmitted', amount: '0,' })
    await appShell.openMenuWithKeyboard()
    await appShell.chooseMenuDestinationWithKeyboard('Rechnung')
    await appShell.expectMenuClosed()
    await invoice.expectInvoiceNumber('compact-draft')
    await appShell.expectDestinationFocused()
    await appShell.openMenuWithKeyboard()
    await appShell.chooseMenuDestinationWithKeyboard('Einstellungen')
    await appShell.expectMenuClosed()
    await settings.expectGeneralPage()
    await appShell.expectDestinationFocused()
    await appShell.openMenuWithKeyboard()
    await appShell.chooseMenuDestinationWithKeyboard('Einstellungen')
    await appShell.expectMenuClosed()
    await settings.expectGeneralPage()
    await appShell.expectDestinationFocused()
    await appShell.openMenu()
    await appShell.navigateToInvoice()
    await invoice.expectInvoiceNumber('compact-draft')
    await invoice.expectNewPositionValues({
      description: 'Unsubmitted',
      amount: '0,',
    })
  })

  test(`keeps unsaved profile confirmation usable after menu navigation at ${width}px`, async ({
    appShell,
    harness,
    releaseNotes,
    businessProfile,
    settings,
    invoice,
  }) => {
    await harness.setViewport(width, 800)
    await harness.open('/settings/profile')
    await releaseNotes.acknowledgeReleaseNotes()
    const saved = createBusinessProfileScenario()
    await businessProfile.configureBusinessProfile(saved)
    for (const destination of ['invoice', 'settings'] as const) {
      const navigate =
        destination === 'invoice'
          ? () => appShell.navigateToInvoice()
          : () => appShell.navigateToSettings()
      await businessProfile.enterDetails({
        businessName: 'Ungespeicherter Betrieb',
      })
      await appShell.openMenu()
      await navigate()
      await appShell.expectMenuClosed()
      await businessProfile.expectUnsavedChangesWarning()
      await businessProfile.keepUnsavedChanges()
      await appShell.expectProfilePage()
      await appShell.expectDestinationFocused()
      await businessProfile.expectFieldValue(
        'businessName',
        'Ungespeicherter Betrieb',
      )
      await appShell.expectMenuClosed()
      await appShell.openMenu()
      await navigate()
      await appShell.expectMenuClosed()
      await businessProfile.expectUnsavedChangesWarning()
      await businessProfile.discardUnsavedChanges()
      if (destination === 'invoice') {
        await invoice.expectReady()
        await appShell.expectDestinationFocused()
        await appShell.openMenu()
        await appShell.navigateToSettings()
      }
      await settings.expectGeneralPage()
      await appShell.expectDestinationFocused()
      await settings.openProfile()
      await businessProfile.expectFieldValue('businessName', saved.businessName)
    }
  })

  test(`contains keyboard focus and unlocks scrolling after menu dismissal at ${width}px`, async ({
    appShell,
    harness,
    releaseNotes,
    layout,
  }) => {
    await harness.setViewport(width, 400)
    await harness.open('/settings/profile')
    await releaseNotes.acknowledgeReleaseNotes()
    await appShell.openMenuWithKeyboard()
    await appShell.expectMenuContents()
    await appShell.expectMenuFocusContained()
    await harness.scrollPageBy(500)
    expect(await layout.pageScrollPosition()).toBe(0)
    await appShell.dismissMenuWithEscape()
    await appShell.expectMenuClosed()
    await appShell.expectMenuTriggerFocused()
    await harness.scrollPageBy(500)
    await expect.poll(() => layout.pageScrollPosition()).toBeGreaterThan(0)
    await appShell.openMenuWithKeyboard()
    await appShell.closeMenuWithKeyboard()
    await appShell.expectMenuClosed()
    await appShell.expectMenuTriggerFocused()
    if (width >= 640) {
      await appShell.openMenu()
      await appShell.dismissMenuViaBackdrop()
      await appShell.expectMenuClosed()
      await appShell.expectMenuTriggerFocused()
    }
  })
}

test('cycles and persists appearance with the keyboard inside the open menu, synchronized with settings', async ({
  appShell,
  harness,
  releaseNotes,
  settings,
  theme,
}) => {
  await harness.setViewport(375, 800)
  await harness.useSystemTheme('dark')
  await harness.open('/settings')
  await releaseNotes.acknowledgeReleaseNotes()
  await settings.expectAppearance('System')
  await appShell.openMenu()
  await theme.expectThemePreference('System')
  await theme.expectResolvedTheme('dark')
  for (const [preference, resolved] of [
    ['Hell', 'light'],
    ['Dunkel', 'dark'],
    ['System', 'dark'],
  ] as const) {
    await theme.cycleThemeWithKeyboard()
    await appShell.expectMenuOpen()
    await theme.expectThemePreference(preference)
    await theme.expectResolvedTheme(resolved)
    await appShell.closeMenu()
    await settings.expectAppearance(preference)
    await appShell.openMenu()
  }
  await theme.cycleThemeWithKeyboard()
  await harness.reload()
  await appShell.expectMenuClosed()
  await settings.expectAppearance('Hell')
  await appShell.openMenu()
  await theme.expectThemePreference('Hell')
  await theme.expectResolvedTheme('light')
  await appShell.closeMenu()
  await settings.selectAppearance('Dunkel')
  await appShell.openMenu()
  await theme.expectThemePreference('Dunkel')
  await theme.expectResolvedTheme('dark')
})

test('wraps long saved Business names above menu navigation without crowding the closed header', async ({
  appShell,
  harness,
  releaseNotes,
  businessProfile,
  layout,
}) => {
  await harness.setViewport(320, 720)
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  const profile = createBusinessProfileScenario({
    businessName:
      'Nordlicht Catering und Veranstaltungsservice für besondere Anlässe',
  })
  await businessProfile.configureBusinessProfile(profile)
  await appShell.expectCompactHeader(profile.businessName)
  await appShell.openMenu()
  for (const width of [320, 768]) {
    await harness.setViewport(width, 720)
    await appShell.expectMenuContents(profile.businessName)
    const menu = await layout.navigationDrawer()
    const name = await layout.navigationBusinessName(profile.businessName, true)
    expect(name.height).toBeGreaterThan(name.lineHeight)
    expect(name.y + name.height).toBeLessThanOrEqual(menu.invoice.y)
    expect(menu.overflows).toBe(false)
  }
})

test('preserves truncated saved Business context and the original navigation on desktop', async ({
  appShell,
  harness,
  releaseNotes,
  businessProfile,
  layout,
}) => {
  await harness.setViewport(1024, 800)
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  const profile = createBusinessProfileScenario({
    businessName:
      'Nordlicht Catering und Veranstaltungsservice für besondere Anlässe',
  })
  await businessProfile.configureBusinessProfile(profile)
  await appShell.expectDesktopHeader(profile.businessName)
  const name = await layout.navigationBusinessName(profile.businessName, false)
  expect(name.truncated).toBe(true)
  expect(name.wraps).toBe(false)
})

test('synchronizes the saved Business name in an open menu when another tab saves a profile change', async ({
  appShell,
  harness,
  releaseNotes,
  businessProfile,
  settings,
  robotsForPage,
}) => {
  await harness.setViewport(375, 720)
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  const profile = createBusinessProfileScenario()
  await businessProfile.configureBusinessProfile(profile)
  await settings.openGeneral()
  await appShell.openMenu()
  await appShell.expectMenuContents(profile.businessName)
  const other = robotsForPage(
    await harness.openAdditionalPage('/settings/profile'),
  )
  await other.businessProfile.enterDetails({
    businessName: 'Neuer gespeicherter Betrieb',
  })
  await other.businessProfile.saveProfile()
  await other.businessProfile.expectProfileSaved()
  await appShell.expectMenuContents('Neuer gespeicherter Betrieb')
})

test('keeps close and bottom controls reachable with an unbroken Business name in short viewports', async ({
  appShell,
  harness,
  releaseNotes,
  businessProfile,
  layout,
}) => {
  await harness.setViewport(320, 240)
  await harness.open('/settings/profile')
  await releaseNotes.acknowledgeReleaseNotes()
  const profile = createBusinessProfileScenario({
    businessName: 'Nordlicht'.repeat(7),
  })
  await businessProfile.configureBusinessProfile(profile)
  await appShell.openMenu()
  for (const width of [320, 768]) {
    await harness.setViewport(width, 240)
    const menu = await layout.navigationDrawer()
    const name = await layout.navigationBusinessName(profile.businessName, true)
    expect(name.height).toBeGreaterThan(name.lineHeight)
    expect(name.wraps).toBe(true)
    expect(name.x + name.width).toBeLessThanOrEqual(
      menu.surface.x + menu.surface.width,
    )
    expect(menu.overflows).toBe(false)
    expect(menu.close.y).toBeGreaterThanOrEqual(0)
    expect(menu.close.y + menu.close.height).toBeLessThan(240)
    expect(menu.theme.y + menu.theme.height).toBe(224)
    expect(menu.settings.y).toBe(menu.theme.y)
    expect(menu.settings.x + menu.settings.width).toBeLessThan(menu.theme.x)
  }
  await appShell.closeMenu()
  await appShell.expectMenuClosed()
  await appShell.expectMenuTriggerFocused()
})

test('opens first-time Business Profile setup from an explicit home action', async ({
  appShell,
  harness,
  releaseNotes,
  landing,
}) => {
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()
  await landing.expectIntroduction()
  await landing.startInvoice()
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
  await appShell.expectSettingsEntry()
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
  await harness.open('/settings/profile')
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
  await harness.open('/settings/profile')
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

test('does not retain an alias for the removed Business Profile route', async ({
  appShell,
  harness,
  releaseNotes,
}) => {
  await harness.open('/business-profile')
  await releaseNotes.dismissReleaseNotes()
  await appShell.expectUnknownRoute()
})

test('recovers from an unknown route to the stable introduction and explicit profile setup', async ({
  appShell,
  harness,
  releaseNotes,
  landing,
}) => {
  await harness.open('/not-a-route')
  await releaseNotes.dismissReleaseNotes()
  await appShell.expectUnknownRoute()
  await appShell.returnToHomeFromUnknownRoute()
  await landing.expectIntroduction()
  await landing.startInvoice()
  await appShell.expectProfilePage()
})
