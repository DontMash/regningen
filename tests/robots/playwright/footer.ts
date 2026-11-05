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
    ).toHaveAttribute('href', '/de')
    await expect(footer.locator('img')).toHaveAttribute('src', '/favicon.svg')
    await expect(
      footer.getByText(
        'Rechnungen erstellen und als PDF herunterladen. Direkt im Browser.',
      ),
    ).toBeVisible()
    const features = footer.getByRole('navigation', {
      name: 'Funktionsnavigation',
    })
    await expect(features.locator('a[href^="/"]')).toHaveCount(1)
    await expect(
      features.getByRole('link', { name: 'Rechnung' }),
    ).toHaveAttribute('href', '/de/rechnung')
    for (const [name, href] of [
      ['Impressum', 'https://www.soren.codes/de/impressum'],
      ['Datenschutz', 'https://www.soren.codes/de/datenschutz'],
    ]) {
      const link = features.getByRole('link', { name })
      expect((await link.getAttribute('href'))?.trim()).toBe(href)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', /noopener/)
    }
  }

  async expectProjectSourceLink() {
    const source = this.page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'GitHub', exact: true })
    await expect(source).toBeVisible()
    await expect(source).toHaveAttribute(
      'href',
      'https://github.com/DontMash/regningen',
    )
    await expect(source).toHaveAttribute('target', '_blank')
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
  }

  async expectAuthorAttribution(locale: 'de' | 'en' = 'de') {
    const footer = this.page.getByRole('contentinfo')
    await expect(
      footer.getByText(locale === 'de' ? 'Mit' : 'Made with', { exact: false }),
    ).toHaveText(
      locale === 'de'
        ? 'Mit Liebe von soren erstellt'
        : 'Made with love by soren',
    )
    const author = footer.getByRole('link', { name: 'soren' })
    await expect(author).toHaveAttribute(
      'href',
      'https://www.soren.codes/?utm_source=regningen&utm_medium=referral',
    )
    await expect(author).toHaveAttribute('rel', /noreferrer/)
    await expect(author).toHaveAttribute('target', '_blank')
    await expect(author).toHaveAttribute('rel', /noopener/)
  }

  async followAuthorCredit() {
    await this.page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'soren' })
      .click()
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
