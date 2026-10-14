import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class AppShellRobot {
  constructor(private readonly page: Page) {}

  async expectApplicationShell() {
    await expect(this.page).toHaveTitle('regningen')
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
    await expect(this.page).toHaveURL(/\/settings\/profile\/?$/)
    await expect(
      this.page.getByRole('heading', {
        name: 'Unternehmensprofil',
        exact: true,
      }),
    ).toBeVisible()
  }

  async navigateToInvoice() {
    await this.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'Rechnung', exact: true })
      .click()
  }

  async navigateToSettings() {
    await this.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
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
    await expect(link).toHaveAttribute('href', '/settings')
    await expect(link).toHaveText('')
    await expect(link.locator('svg')).toBeVisible()
    await expect(
      this.page.getByRole('link', { name: 'Profile', exact: true }),
    ).toHaveCount(0)
    await expect(this.page.locator('a[href="/business-profile"]')).toHaveCount(
      0,
    )
  }

  async expectRootStorageError() {
    await expect(
      this.page.getByRole('alertdialog', { name: 'Rechnungen sind gesperrt' }),
    ).toBeVisible()
    await expect(
      this.page.getByText(/nicht aus diesem Browser geladen werden/),
    ).toBeVisible()
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
