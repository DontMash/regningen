import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class PwaRobot {
  constructor(private readonly page: Page) {}

  async expectOfflineReady() {
    await expect(
      this.page.getByText('Offline bereit', { exact: true }),
    ).toBeVisible()
  }

  async acknowledgeRunningReleaseNotes() {
    await this.page
      .getByRole('dialog', { name: 'Versionshinweise' })
      .getByRole('button', { name: 'Verstanden' })
      .click()
  }

  async expectRunningVersion(version: string) {
    await expect(
      this.page.getByRole('button', {
        name: `Versionshinweise zu Version v${version} anzeigen`,
      }),
    ).toBeVisible()
  }

  private updateDialog() {
    return this.page.getByRole('dialog', {
      name: /^(Aktualisierung verfügbar|Update available)$/,
    })
  }

  async expectUpdateAvailable() {
    await expect(this.updateDialog()).toBeVisible({ timeout: 30_000 })
  }

  async postponeUpdate() {
    await this.updateDialog()
      .getByRole('button', { name: /^(Später|Later)$/ })
      .click()
  }

  async expectUpdateDiscoverable() {
    await expect(
      this.page.getByRole('button', {
        name: /^(Update verfügbar|Update available)$/,
      }),
    ).toBeVisible()
  }

  async reopenUpdate() {
    await this.page
      .getByRole('button', {
        name: /^(Update verfügbar|Update available)$/,
      })
      .click()
    await expect(this.updateDialog()).toBeVisible()
  }

  async applyUpdate() {
    await this.updateDialog()
      .getByRole('button', { name: /^(Update jetzt|Update now)$/ })
      .click()
  }

  async expectUpdateClosed() {
    await expect(this.updateDialog()).toHaveCount(0)
  }

  async enableNotifications() {
    await this.page
      .getByRole('button', { name: 'Benachrichtigungen aktivieren' })
      .click()
  }

  async expectNotificationsEnabled() {
    await expect(
      this.page.getByRole('button', {
        name: 'Benachrichtigungen deaktivieren',
      }),
    ).toBeVisible()
  }

  async disableNotifications() {
    await this.page
      .getByRole('button', {
        name: 'Benachrichtigungen deaktivieren',
        exact: true,
      })
      .click()
  }

  async expectNotificationsDisabled() {
    await expect(
      this.page.getByRole('button', {
        name: 'Benachrichtigungen aktivieren',
        exact: true,
      }),
    ).toBeVisible()
  }

  async expectReleaseBInvoiceAsset() {
    await expect(
      this.page.getByText('Release B lazy asset fixture'),
    ).toBeVisible()
  }
}
