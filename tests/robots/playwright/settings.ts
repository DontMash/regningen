import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ThemePreference } from './theme'

export class SettingsRobot {
  constructor(private readonly page: Page) {}

  async openGeneral() {
    await this.page
      .getByRole('navigation', { name: 'Einstellungen', exact: true })
      .getByRole('link', { name: 'Allgemein', exact: true })
      .click()
  }

  async openProfile() {
    await this.page
      .getByRole('navigation', { name: 'Einstellungen', exact: true })
      .getByRole('link', { name: 'Profil', exact: true })
      .click()
  }

  async expectGeneralPage() {
    await expect(this.page).toHaveURL(/\/settings\/?$/)
    await expect(
      this.page.getByRole('heading', { name: 'Allgemein', exact: true }),
    ).toBeVisible()
    await expect(
      this.page.getByText('Benachrichtigungen', { exact: true }),
    ).toBeVisible()
    await expect(
      this.page.getByText('Installation', { exact: true }),
    ).toBeVisible()
    await expect(
      this.page.getByText(/nach einem erfolgreichen PDF-Export/),
    ).toBeVisible()
  }

  async expectActivePage(name: 'Allgemein' | 'Profil') {
    const navigation = this.page
      .getByRole('complementary')
      .getByRole('navigation', { name: 'Einstellungen', exact: true })
    await expect(
      navigation.getByRole('link', { name: 'Allgemein', exact: true }),
    ).toHaveAttribute('href', '/settings')
    await expect(
      navigation.getByRole('link', { name: 'Profil', exact: true }),
    ).toHaveAttribute('href', '/settings/profile')
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
      this.page.getByText(/Ändere sie in den Browser-Einstellungen/),
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
    await expect(error).toContainText('versuche es erneut')
    await this.expectGeneralPage()
  }

  async selectAppearance(mode: ThemePreference) {
    await this.page
      .getByRole('group', { name: 'Farbschema', exact: true })
      .getByRole('button', { name: mode, exact: true })
      .click()
  }

  async expectAppearance(mode: ThemePreference) {
    await expect(
      this.page
        .getByRole('group', { name: 'Farbschema', exact: true })
        .getByRole('button', { name: mode, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
  }
}
