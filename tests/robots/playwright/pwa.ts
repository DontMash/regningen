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

  async expectUpdateAvailable() {
    await expect(
      this.page.getByRole('dialog', { name: 'Aktualisierung verfügbar' }),
    ).toBeVisible({ timeout: 30_000 })
  }

  async postponeUpdate() {
    await this.page
      .getByRole('dialog', { name: 'Aktualisierung verfügbar' })
      .getByRole('button', { name: 'Später' })
      .click()
    await expect(
      this.page.getByRole('button', { name: 'Update verfügbar' }),
    ).toBeVisible()
  }

  async reopenUpdate() {
    await this.page.getByRole('button', { name: 'Update verfügbar' }).click()
    await expect(
      this.page.getByRole('dialog', { name: 'Aktualisierung verfügbar' }),
    ).toBeVisible()
  }

  async applyUpdate() {
    await this.page
      .getByRole('dialog', { name: 'Aktualisierung verfügbar' })
      .getByRole('button', { name: 'Update jetzt' })
      .click()
  }

  async expectUpdateClosed() {
    await expect(
      this.page.getByRole('dialog', { name: 'Aktualisierung verfügbar' }),
    ).toHaveCount(0)
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

  async expectReleaseBInvoiceAsset() {
    await expect(
      this.page.getByText('Release B lazy asset fixture'),
    ).toBeVisible()
  }
}
