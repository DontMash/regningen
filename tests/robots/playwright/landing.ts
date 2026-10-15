import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class LandingRobot {
  constructor(private readonly page: Page) {}

  async expectIntroduction({ obscured = false }: { obscured?: boolean } = {}) {
    await expect(this.page).toHaveURL(/\/$/)
    await expect(
      this.page.getByRole('heading', { level: 1, includeHidden: obscured }),
    ).toHaveText('Rechnungen erstellen. Direkt im Browser.')
    await expect(
      this.page.getByRole('button', {
        name: 'Rechnung erstellen',
        exact: true,
        includeHidden: obscured,
      }),
    ).toHaveCount(2)
  }

  async startInvoice(position: 'hero' | 'final' = 'hero') {
    const actions = this.page.getByRole('button', {
      name: 'Rechnung erstellen',
      exact: true,
    })
    await (position === 'hero' ? actions.first() : actions.last()).click()
  }

  async startInvoiceWithKeyboard() {
    const action = this.page
      .getByRole('button', { name: 'Rechnung erstellen', exact: true })
      .first()
    await action.focus()
    await expect(action).toBeFocused()
    await action.press('Enter')
  }

  async expectFeatureHeadings() {
    await expect(
      this.page.getByRole('main').getByRole('heading', { level: 1 }),
    ).toHaveCount(1)
    for (const name of [
      'Unternehmensprofil wiederverwenden',
      'Positionen und Summen erfassen',
      'PDF direkt herunterladen',
      'Entwurf während der Sitzung behalten',
      'Unternehmensprofil sichern',
      'Installieren und offline nutzen',
    ]) {
      await expect(
        this.page.getByRole('heading', { name, exact: true }),
      ).toBeVisible()
    }
  }

  async returnHome() {
    await this.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'regningen', exact: true })
      .click()
  }

  async expectEntryError() {
    await expect(
      this.page.getByRole('alert').filter({ hasText: /Unternehmensprofil/ }),
    ).toBeVisible()
    await expect(
      this.page.getByRole('button', { name: /Erneut/ }),
    ).toBeEnabled()
    await this.expectIntroduction()
  }

  async expectVisibility(title: string, canonical: string, indexable = false) {
    await expect(this.page).toHaveTitle(title)
    await expect(this.page.locator('head link[rel="canonical"]')).toHaveCount(1)
    await expect(
      this.page.locator('head link[rel="canonical"]'),
    ).toHaveAttribute('href', canonical)
    await expect(this.page.locator('head meta[name="robots"]')).toHaveCount(1)
    await expect(this.page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      indexable ? 'index, follow' : 'noindex, follow',
    )
    await expect(
      this.page.locator('head meta[property="og:title"]'),
    ).toHaveAttribute('content', title)
    await expect(
      this.page.locator('head meta[name="twitter:title"]'),
    ).toHaveAttribute('content', title)
    await expect(this.page.locator('head link[rel="alternate"]')).toHaveCount(
      indexable ? 2 : 0,
    )
    await expect(
      this.page.locator('head script[type="application/ld+json"]'),
    ).toHaveCount(indexable ? 1 : 0)
  }

  async publicInformation() {
    return {
      head: await this.page.locator('head').innerHTML(),
      illustration: await this.page
        .getByRole('main')
        .locator('figure')
        .allTextContents(),
    }
  }
}
