import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export type ThemePreference = 'System' | 'Hell' | 'Dunkel'

export class ApplicationShellRobot {
  constructor(private readonly page: Page) {}

  async expectReleaseNotesDialog() {
    await expect(
      this.page.getByRole('dialog', {
        name: 'Versionshinweise',
        exact: true,
      }),
    ).toBeVisible()
  }

  async expectCurrentReleaseNotes() {
    const dialog = this.page.getByRole('dialog', {
      name: 'Versionshinweise',
      exact: true,
    })
    await expect(dialog.getByText('Version 1.0.0')).toBeVisible()
    await expect(
      dialog.getByRole('heading', { name: '🚀 Enhancements' }),
    ).toBeVisible()
  }

  async expectReleaseNotesClosed() {
    await expect(
      this.page.getByRole('dialog', {
        name: 'Versionshinweise',
        exact: true,
      }),
    ).toHaveCount(0)
  }

  async expectReleaseNotesPresentation(slot: 'dialog-popup' | 'drawer-popup') {
    await expect(
      this.page.getByRole('dialog', {
        name: 'Versionshinweise',
        exact: true,
      }),
    ).toHaveAttribute('data-slot', slot)
  }

  async dismissReleaseNotes() {
    await this.page
      .getByRole('dialog', {
        name: 'Versionshinweise',
        exact: true,
      })
      .getByRole('button', { name: 'Schließen' })
      .click()
  }

  async dismissReleaseNotesWithEscape() {
    await this.page.keyboard.press('Escape')
  }

  async dismissReleaseNotesOutside() {
    await this.page.locator('[data-slot="dialog-backdrop"]').click({
      position: { x: 4, y: 4 },
    })
  }

  async acknowledgeReleaseNotes() {
    await this.page
      .getByRole('dialog', {
        name: 'Versionshinweise',
        exact: true,
      })
      .getByRole('button', { name: 'Verstanden' })
      .click()
  }

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

  async selectReleaseVersion(version: string) {
    await this.page
      .getByRole('dialog', { name: 'Versionshinweise', exact: true })
      .getByRole('combobox', { name: 'Version auswählen' })
      .click()
    await this.page.getByRole('option', { name: version, exact: true }).click()
  }

  async scrollReleaseNotes(to: 'middle' | 'end' | number) {
    await this.page
      .getByRole('dialog', { name: 'Versionshinweise', exact: true })
      .locator('.overflow-y-auto')
      .first()
      .evaluate((element, position) => {
        const maximum = element.scrollHeight - element.clientHeight
        element.scrollTop =
          typeof position === 'number'
            ? position
            : position === 'end'
              ? maximum
              : maximum / 2
      }, to)
  }

  async expectReleaseNotesEndVisible() {
    const dialog = this.page.getByRole('dialog', {
      name: 'Versionshinweise',
      exact: true,
    })
    await expect(
      dialog.locator('article').getByRole('listitem').last(),
    ).toBeInViewport({ ratio: 1 })
    await expect(
      dialog.getByRole('combobox', { name: 'Version auswählen' }),
    ).toBeInViewport({ ratio: 1 })
    await expect(
      dialog.getByRole('button', { name: 'Verstanden' }),
    ).toBeInViewport({ ratio: 1 })
  }

  async expectReleaseAcknowledgmentWarning() {
    await expect(
      this.page.getByText(
        'Die Versionshinweise können beim nächsten Start erneut erscheinen.',
      ),
    ).toBeVisible()
  }

  async expectGermanApplicationShell() {
    await expect(this.page).toHaveTitle('regningen')
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'de')
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
    await expect(this.page).toHaveURL(/\/business-profile$/)
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

  async navigateToBusinessProfile() {
    await this.page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'Profile', exact: true })
      .click()
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
    await expect(features.getByRole('link')).toHaveCount(2)
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

  async expectFooterBelowViewport() {
    await expect(this.page.getByRole('contentinfo')).not.toBeInViewport()
  }

  async expectSmoothScrollBehavior(behavior: 'smooth' | 'auto') {
    await expect(this.page.locator('html')).toHaveCSS(
      'scroll-behavior',
      behavior,
    )
  }

  async activateBackToTopWithKeyboard() {
    await expect(this.page.locator('body > header')).toHaveAttribute(
      'id',
      'top',
    )
    const backToTop = this.page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Nach oben' })
    await expect(backToTop).toHaveAttribute('href', '#top')
    await backToTop.scrollIntoViewIfNeeded()
    const scrollBefore = await this.page.evaluate(() => window.scrollY)
    await backToTop.press('Enter')
    return scrollBefore
  }

  async expectBackToTopFragment() {
    await expect(this.page).toHaveURL(/#top$/)
  }

  async expectPageAtTop() {
    await expect.poll(() => this.page.evaluate(() => window.scrollY)).toBe(0)
  }

  async cycleTheme() {
    await this.page
      .getByRole('button', { name: 'Darstellung umschalten' })
      .click()
  }

  async expectThemePreference(preference: ThemePreference) {
    await expect(
      this.page.getByRole('button', { name: 'Darstellung umschalten' }),
    ).toHaveAttribute('title', `Darstellung: ${preference}`)
  }

  async expectResolvedTheme(theme: 'light' | 'dark') {
    await expect(this.page.locator('html')).toHaveAttribute('data-theme', theme)
  }
}
