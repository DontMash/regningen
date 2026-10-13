import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class ReleaseNotesRobot {
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

  async selectReleaseVersion(version: string) {
    await this.page
      .getByRole('dialog', { name: 'Versionshinweise', exact: true })
      .getByRole('combobox', { name: 'Version auswählen' })
      .click()
    const escapedVersion = version.replaceAll('.', '\\.')
    await this.page
      .getByRole('option', {
        name: new RegExp(`^${escapedVersion}(?: \\(laufend\\))?$`),
      })
      .click()
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
}
