import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class FooterRobot {
  constructor(private readonly page: Page) {}

  async openReleaseNotesFromFooter() {
    await this.page
      .getByRole('contentinfo')
      .getByRole('button', { name: /Versionshinweise zu Version/ })
      .click()
  }

  async expectFooterVersion(version: string) {
    await expect(
      this.page.getByRole('contentinfo').getByRole('button', {
        name: `Versionshinweise zu Version ${version} anzeigen`,
      }),
    ).toHaveText(version)
  }

  async expectFooterDestinations() {
    const footer = this.page.getByRole('contentinfo')
    await expect(footer).toBeVisible()
    await expect(
      footer.getByRole('link', { name: 'regningen' }),
    ).toHaveAttribute('href', '/')
    await expect(footer.locator('img')).toHaveAttribute('src', '/favicon.svg')
    await expect(
      footer.getByText(
        'Rechnungen erstellen und als PDF herunterladen. Direkt im Browser.',
      ),
    ).toBeVisible()
    const features = footer.getByRole('navigation', {
      name: 'Funktionsnavigation',
    })
    await expect(features.locator('a[href^="/"]')).toHaveCount(2)
    await expect(
      features.getByRole('link', { name: 'Rechnung' }),
    ).toHaveAttribute('href', '/invoice')
    await expect(
      features.getByRole('link', { name: 'Profile' }),
    ).toHaveAttribute('href', '/business-profile')
  }

  async expectAuthorAttribution() {
    const footer = this.page.getByRole('contentinfo')
    await expect(footer.getByText('Made with', { exact: false })).toHaveText(
      'Made with love by soren',
    )
    const author = footer.getByRole('link', { name: 'soren' })
    await expect(author).toHaveAttribute('href', 'https://www.soren.codes/')
    await expect(author).toHaveAttribute('target', '_blank')
    await expect(author).toHaveAttribute('rel', /noopener/)
  }

  async expectFooterBelowViewport() {
    await expect(this.page.getByRole('contentinfo')).not.toBeInViewport()
  }

  async scrollToBackToTopLink() {
    await expect(this.page.locator('body > header')).toHaveAttribute(
      'id',
      'top',
    )
    const backToTop = this.page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Nach oben' })
    await expect(backToTop).toHaveAttribute('href', '#top')
    await backToTop.scrollIntoViewIfNeeded()
  }

  async activateBackToTopWithKeyboard() {
    await this.page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Nach oben' })
      .press('Enter')
  }

  async expectBackToTopFragment() {
    await expect(this.page).toHaveURL(/#top$/)
  }
}
