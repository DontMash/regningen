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

  async expectStagedVersion(version: string, runningVersion: string) {
    await expect(
      this.page.getByText(`Update v${version} verfügbar`, { exact: true }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      this.page.getByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeVisible()
    const dialog = this.page.getByRole('dialog', { name: 'Versionshinweise' })
    await expect(
      dialog.getByText(`Laufende Version: v${runningVersion}`),
    ).toBeVisible()
    await expect(
      dialog.getByText(`Neue Version bereit: v${version}`),
    ).toBeVisible()
    await expect(
      dialog.getByText(
        'Independently authored production release B notes include $& literally.',
      ),
    ).toBeVisible()
  }

  async postponeStagedUpdate() {
    await this.page
      .getByRole('dialog', { name: 'Versionshinweise' })
      .getByRole('button', { name: 'Später' })
      .click()
  }

  async reopenStagedUpdate() {
    await this.page
      .getByRole('button', { name: /^Versionshinweise zu Version/ })
      .click()
    await expect(
      this.page.getByRole('button', { name: 'Update jetzt' }),
    ).toBeVisible()
  }

  async applyStagedUpdate() {
    await this.page
      .getByRole('dialog', { name: 'Versionshinweise' })
      .getByRole('button', { name: 'Update jetzt' })
      .click()
  }

  async expectUpdateDeferred(reason: string) {
    const dialog = this.page.getByRole('dialog', { name: 'Versionshinweise' })
    await expect(dialog.getByRole('alert')).toHaveText(reason)
    await expect(
      dialog.getByRole('button', { name: 'Update jetzt' }),
    ).toBeEnabled()
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

  async expectStagedUpdateClosed() {
    await expect(
      this.page.getByRole('dialog', { name: 'Versionshinweise' }),
    ).toHaveCount(0)
  }

  async expectReleaseBInvoiceAsset() {
    await expect(
      this.page.getByText('Release B lazy asset fixture'),
    ).toBeVisible()
  }
}
