import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ThemePreference } from './theme'

export class SettingsRobot {
  constructor(private readonly page: Page) {}

  private navigation() {
    return this.page
      .getByRole('complementary')
      .getByRole('navigation', { name: /^(Einstellungen|Settings)$/ })
  }

  async openGeneral() {
    await this.navigation()
      .getByRole('link', { name: /^(Allgemein|General)$/ })
      .click()
  }

  async openProfile() {
    await this.navigation()
      .getByRole('link', { name: /^(Profil|Profile)$/ })
      .click()
  }

  async openLicenses() {
    await this.navigation()
      .getByRole('link', { name: /^(Lizenz|License)$/ })
      .click()
  }

  async expectLicensesPage(locale: 'de' | 'en' = 'de') {
    await expect(this.page).toHaveURL(
      locale === 'de'
        ? /\/de\/einstellungen\/lizenzen$/
        : /\/en\/settings\/licenses$/,
    )
    await expect(
      this.page.getByRole('heading', {
        name: locale === 'de' ? 'Lizenz' : 'License',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      this.page.getByRole('heading', {
        name: locale === 'de' ? 'Projektlizenz' : 'Project license',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      this.page.getByRole('heading', {
        name: /^(Drittanbieter|Third-party notices)$/,
      }),
    ).toHaveCount(0)
    await expect(
      this.page.getByRole('link', {
        name: /^(Hinweise als Text herunterladen|Download notices as text)$/,
      }),
    ).toHaveCount(0)
    const content = this.page.getByRole('main')
    await expect(
      content.locator('a[href="/third-party-notices.txt"]'),
    ).toHaveCount(0)
    await expect(content).not.toContainText(
      /ibantools|@fontsource-variable|JetBrains Mono|Font · separate font license|Schrift · eigene Schriftlizenz/,
    )
    await expect(
      this.page.getByText('Copyright (C) 2026 soren.codes', { exact: true }),
    ).toBeVisible()
    await expect(this.page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    )
    await expect(this.page).toHaveTitle(
      locale === 'de' ? 'Lizenz – regningen' : 'License – regningen',
    )
  }

  async openLicensesWithKeyboard() {
    const general = this.navigation().getByRole('link', {
      name: /^(Allgemein|General)$/,
    })
    await general.focus()
    await this.page.keyboard.press('Tab')
    await this.page.keyboard.press('Tab')
    await this.page.keyboard.press('Enter')
  }

  async expectNavigationKeyboardOrder() {
    const general = this.navigation().getByRole('link', {
      name: /^(Allgemein|General)$/,
    })
    await general.focus()
    await this.page.keyboard.press('Tab')
    await expect(
      this.navigation().getByRole('link', { name: /^(Profil|Profile)$/ }),
    ).toBeFocused()
    await this.page.keyboard.press('Tab')
    await expect(
      this.navigation().getByRole('link', {
        name: /^(Lizenz|License)$/,
      }),
    ).toBeFocused()
  }

  private projectLicense() {
    return this.page.getByRole('region', {
      name: /^(Projektlizenz|Project license)$/,
    })
  }

  async openProjectLicense(keyboard = false) {
    const summary = this.projectLicense().locator('summary')
    if (keyboard) {
      await summary.focus()
      await summary.press('Enter')
    } else {
      await summary.click()
    }
  }

  async readProjectLicense() {
    return this.projectLicense().locator('pre').textContent()
  }

  async expectProjectLicenseScope(locale: 'de' | 'en' = 'de') {
    const project = this.projectLicense()
    await expect(
      project.getByText('AGPL-3.0-only', { exact: true }),
    ).toBeVisible()
    await expect(
      project.getByText(
        locale === 'de'
          ? /Drittanbieter-Software, Schriften und übernommener Quellcode behalten ihre eigenen Lizenzbedingungen/
          : /Third-party software, fonts and copied source retain their own license terms/,
      ),
    ).toBeVisible()
    await expect(
      project.getByText(
        locale === 'de'
          ? /Rechnungen und eingegebenen Unternehmensdaten werden nicht allein durch die Nutzung dieser Anwendung AGPL-lizenziert/
          : /invoices and business data do not become AGPL-licensed merely through using this application/,
      ),
    ).toBeVisible()
    await expect(project.locator('pre')).toBeVisible()
  }

  async expectGeneralPage(locale: 'de' | 'en' = 'de') {
    await expect(this.page).toHaveURL(
      locale === 'de' ? /\/de\/einstellungen$/ : /\/en\/settings$/,
    )
    await expect(
      this.page.getByRole('heading', {
        name: locale === 'de' ? 'Allgemein' : 'General',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      this.page.getByText(
        locale === 'de' ? 'Benachrichtigungen' : 'Notifications',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(
      this.page.getByText('Installation', { exact: true }),
    ).toBeVisible()
    await expect(
      this.page.getByText(
        locale === 'de'
          ? /nach einem erfolgreichen PDF-Export/
          : /after a successful PDF export/,
      ),
    ).toBeVisible()
  }

  async expectActivePage(
    name: 'Allgemein' | 'Profil' | 'Lizenz' | 'License',
    locale: 'de' | 'en' = 'de',
  ) {
    const navigation = this.navigation()
    const base = locale === 'de' ? '/de/einstellungen' : '/en/settings'
    await expect(
      navigation.getByRole('link', {
        name: locale === 'de' ? 'Allgemein' : 'General',
        exact: true,
      }),
    ).toHaveAttribute('href', base)
    await expect(
      navigation.getByRole('link', {
        name: locale === 'de' ? 'Profil' : 'Profile',
        exact: true,
      }),
    ).toHaveAttribute(
      'href',
      `${base}/${locale === 'de' ? 'profil' : 'profile'}`,
    )
    await expect(
      navigation.getByRole('link', {
        name: locale === 'de' ? 'Lizenz' : 'License',
        exact: true,
      }),
    ).toHaveAttribute(
      'href',
      `${base}/${locale === 'de' ? 'lizenzen' : 'licenses'}`,
    )
    await expect(navigation.getByRole('link')).toHaveCount(3)
    await expect(
      navigation.getByRole('link', { name, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1)
  }

  async expectCentralizedControls() {
    await expect(
      this.page
        .getByRole('main')
        .getByRole('button', { name: 'Installieren', exact: true }),
    ).toBeVisible()
    await expect(
      this.page
        .getByRole('navigation', { name: 'Hauptnavigation' })
        .getByRole('button', { name: 'Installieren', exact: true }),
    ).toHaveCount(0)
    await expect(
      this.page
        .getByRole('contentinfo')
        .getByRole('button', { name: /Benachrichtigungen/ }),
    ).toHaveCount(0)
  }

  async requestInstallation() {
    await this.page
      .getByRole('main')
      .getByRole('button', { name: 'Installieren', exact: true })
      .click()
  }

  async expectNotificationsDenied() {
    await expect(
      this.page.getByRole('button', {
        name: 'Benachrichtigungen blockiert',
        exact: true,
      }),
    ).toBeDisabled()
    await expect(
      this.page.getByText(/Ändern Sie sie in den Browser-Einstellungen/),
    ).toBeVisible()
  }

  async requestReset() {
    await this.page
      .getByRole('main')
      .getByRole('button', { name: 'Anwendung zurücksetzen', exact: true })
      .click()
  }

  async expectResetConfirmation() {
    const dialog = this.page.getByRole('alertdialog', {
      name: 'Anwendung zurücksetzen?',
      exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Abbrechen', exact: true }),
    ).toBeFocused()
    await expect(dialog).toContainText('Tabs dieser Anwendung')
    await expect(dialog).toContainText('Heruntergeladene PDFs und Sicherungen')
    await expect(dialog).toContainText(
      'Browser-Berechtigungen, Installation und Offline-Verfügbarkeit bleiben erhalten',
    )
  }

  async cancelReset() {
    await this.page
      .getByRole('alertdialog', {
        name: 'Anwendung zurücksetzen?',
        exact: true,
      })
      .getByRole('button', { name: 'Abbrechen', exact: true })
      .click()
  }

  async confirmReset() {
    await this.page
      .getByRole('alertdialog', {
        name: 'Anwendung zurücksetzen?',
        exact: true,
      })
      .getByRole('button', { name: 'Anwendung zurücksetzen', exact: true })
      .click()
  }

  async expectIncompleteReset() {
    const error = this.page
      .getByRole('alert')
      .filter({ hasText: 'Anwendung nicht vollständig zurückgesetzt' })
    await expect(error).toBeVisible()
    await expect(error).toContainText(
      'Ein Teil der Daten wurde möglicherweise bereits gelöscht.',
    )
    await expect(error).toContainText('versuchen Sie es erneut')
    await this.expectGeneralPage()
  }

  async selectAppearance(mode: ThemePreference) {
    await this.page
      .getByRole('group', { name: /^(Farbschema|Colour scheme)$/, exact: true })
      .getByRole('button', { name: mode, exact: true })
      .click()
  }

  async expectAppearance(mode: ThemePreference) {
    await expect(
      this.page
        .getByRole('group', {
          name: /^(Farbschema|Colour scheme)$/,
          exact: true,
        })
        .getByRole('button', { name: mode, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
  }
}
