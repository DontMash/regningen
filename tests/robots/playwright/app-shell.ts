import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class AppShellRobot {
  constructor(private readonly page: Page) {}

  async expectApplicationShell() {
    await expect(this.page).toHaveTitle(/regningen/)
    await expect(this.page.getByRole('main')).toHaveCount(1)
    await expect(
      this.page
        .getByRole('navigation', { name: 'Hauptnavigation' })
        .getByRole('link', { name: 'regningen' }),
    ).toBeVisible()
    await expect(this.page.getByRole('contentinfo')).toHaveCount(1)
    await expect(
      this.page.getByText(
        /TanStack Start Base Template|Demos|About This Starter/i,
      ),
    ).toHaveCount(0)
  }

  private menu() {
    return this.page.getByRole('dialog', { name: 'Navigation', exact: true })
  }

  async openMenu() {
    await this.page.getByRole('button', { name: 'Menü öffnen' }).click()
  }

  async closeMenu() {
    await this.menu().getByRole('button', { name: 'Menü schließen' }).click()
  }

  async expectMenuOpen() {
    await expect(this.menu()).toBeVisible()
  }

  async expectMenuClosed() {
    await expect(this.menu()).toHaveCount(0)
  }

  async expectCompactHeader(businessName?: string) {
    const navigation = this.page.getByRole('navigation', {
      name: 'Hauptnavigation',
    })
    await expect(
      navigation.getByRole('link', { name: 'regningen' }),
    ).toBeVisible()
    await expect(
      navigation.getByRole('link', { name: 'regningen' }),
    ).toHaveAttribute('href', '/de')
    await expect(
      navigation.getByRole('button', { name: 'Menü öffnen' }),
    ).toBeVisible()
    await expect(
      navigation.getByRole('link', { name: 'Rechnung', exact: true }),
    ).toBeHidden()
    await expect(
      navigation.getByRole('link', { name: 'Einstellungen', exact: true }),
    ).toBeHidden()
    await expect(
      navigation.getByRole('button', { name: 'Darstellung umschalten' }),
    ).toBeHidden()
    if (businessName)
      await expect(
        navigation.getByText(businessName, { exact: true }),
      ).toBeHidden()
  }

  async expectDesktopHeader(businessName?: string) {
    const navigation = this.page.getByRole('navigation', {
      name: 'Hauptnavigation',
    })
    await expect(
      navigation.getByRole('button', { name: 'Menü öffnen' }),
    ).toBeHidden()
    await expect(
      navigation.getByRole('link', { name: 'Rechnung', exact: true }),
    ).toBeVisible()
    await expect(
      navigation.getByRole('button', { name: 'Darstellung umschalten' }),
    ).toBeEnabled()
    await this.expectSettingsEntry()
    if (businessName)
      await expect(
        navigation.getByText(businessName, { exact: true }),
      ).toBeVisible()
  }

  async expectMenuBusinessNameAbsent() {
    await expect(this.menu().getByRole('paragraph')).toHaveCount(0)
  }

  async openMenuWithKeyboard() {
    const trigger = this.page.getByRole('button', { name: 'Menü öffnen' })
    await trigger.focus()
    await trigger.press('Enter')
  }

  async closeMenuWithKeyboard() {
    await this.menu()
      .getByRole('button', { name: 'Menü schließen' })
      .press('Enter')
  }

  async dismissMenuWithEscape() {
    await this.page.keyboard.press('Escape')
  }

  async dismissMenuViaBackdrop() {
    await this.page.mouse.click(16, 120)
  }

  async expectMenuTriggerFocused() {
    await expect(
      this.page.getByRole('button', { name: 'Menü öffnen' }),
    ).toBeFocused()
  }

  async expectMenuFocusContained() {
    const close = this.menu().getByRole('button', { name: 'Menü schließen' })
    const theme = this.menu().getByRole('button', {
      name: 'Darstellung umschalten',
    })
    await close.focus()
    await this.page.keyboard.press('Shift+Tab')
    await expect(theme).toBeFocused()
    await this.page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    for (let index = 0; index < 3; index++)
      await this.page.keyboard.press('Tab')
    await expect(theme).toBeFocused()
  }

  async chooseMenuDestinationWithKeyboard(
    destination: 'Rechnung' | 'Einstellungen',
  ) {
    await this.menu()
      .getByRole('link', { name: destination, exact: true })
      .press('Enter')
  }

  async expectDestinationFocused() {
    await expect
      .poll(() =>
        this.page
          .getByRole('main')
          .evaluate((content) => content.contains(document.activeElement)),
      )
      .toBe(true)
  }

  async expectDesktopNavigationUsable() {
    const invoice = this.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'Rechnung', exact: true })
    await invoice.focus()
    await expect(invoice).toBeFocused()
  }

  async expectMenuContents(businessName?: string) {
    const menu = this.menu()
    await expect(menu).toBeVisible()
    await expect(
      menu.getByRole('heading', { name: 'Navigation', exact: true }),
    ).toBeAttached()
    await expect(
      menu.getByRole('link', { name: 'Rechnung', exact: true }),
    ).toHaveAttribute('href', '/de/rechnung')
    const settings = menu.getByRole('link', {
      name: 'Einstellungen',
      exact: true,
    })
    await expect(settings).toHaveAttribute('href', '/de/einstellungen')
    await expect(settings).toHaveText('')
    await expect(settings.locator('svg')).toBeVisible()
    const theme = menu.getByRole('button', { name: 'Darstellung umschalten' })
    await expect(theme).toBeEnabled()
    await expect(theme).toHaveText('')
    await expect(
      menu.getByRole('button', { name: 'Menü schließen' }),
    ).toBeVisible()
    await expect(menu.getByRole('link')).toHaveCount(2)
    await expect(
      menu.getByRole('link', { name: /Startseite|regningen/ }),
    ).toHaveCount(0)
    if (businessName)
      await expect(menu.getByText(businessName, { exact: true })).toBeVisible()
  }

  async expectApplicationTypography() {
    await expect(this.page.locator('body')).toHaveCSS(
      'font-family',
      /Inter Variable/,
    )
    await expect(
      this.page
        .getByRole('navigation', { name: 'Hauptnavigation' })
        .getByRole('link', { name: 'regningen' }),
    ).toHaveCSS('font-family', /Lora Variable/)
  }

  async expectProfilePage() {
    await expect(this.page).toHaveURL(/\/de\/einstellungen\/profil$/)
    await expect(
      this.page.getByRole('heading', {
        name: 'Unternehmensprofil',
        exact: true,
      }),
    ).toBeVisible()
  }

  private navigationSurface() {
    return this.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .or(this.menu())
  }

  async navigateToInvoice() {
    await this.navigationSurface()
      .getByRole('link', { name: 'Rechnung', exact: true })
      .click()
  }

  async navigateToSettings() {
    await this.navigationSurface()
      .getByRole('link', { name: 'Einstellungen', exact: true })
      .click()
  }

  async navigateToBusinessProfile() {
    await this.navigateToSettings()
    await this.page
      .getByRole('navigation', { name: 'Einstellungen' })
      .getByRole('link', { name: 'Profil', exact: true })
      .click()
  }

  async expectSettingsEntry() {
    const link = this.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'Einstellungen', exact: true })
    await expect(link).toHaveAttribute('href', '/de/einstellungen')
    await expect(link).toHaveText('')
    await expect(link.locator('svg')).toBeVisible()
    await expect(
      this.page.getByRole('link', { name: 'Profile', exact: true }),
    ).toHaveCount(0)
    await expect(this.page.locator('a[href="/business-profile"]')).toHaveCount(
      0,
    )
  }

  async expectUnknownRoute() {
    await expect(
      this.page.getByRole('heading', { name: 'Seite nicht gefunden' }),
    ).toBeVisible()
  }

  async returnToHomeFromUnknownRoute() {
    await this.page.getByRole('link', { name: 'Zur Startseite' }).click()
  }

  async expectSmoothScrollBehavior(behavior: 'smooth' | 'auto') {
    await expect(this.page.locator('html')).toHaveCSS(
      'scroll-behavior',
      behavior,
    )
  }
}
