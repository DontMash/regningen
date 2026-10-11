import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { BusinessProfileScenarioInput } from '../../scenarios/business-profile'

export type BusinessProfileInput = BusinessProfileScenarioInput

export type BusinessProfileField = keyof BusinessProfileInput

const fieldLabels: Record<BusinessProfileField, string> = {
  businessName: 'Unternehmensname',
  serviceDescription: 'Leistungsbeschreibung',
  ownerName: 'Inhaber/in',
  street: 'Straße und Hausnummer',
  postalCode: 'Postleitzahl',
  town: 'Ort',
  phone: 'Telefon',
  mobile: 'Mobiltelefon',
  iban: 'IBAN',
  vatId: 'USt-IdNr.',
  taxNumber: 'Steuernummer',
}

export class BusinessProfileRobot {
  constructor(private readonly page: Page) {}

  async configureBusinessProfile(profile: BusinessProfileInput) {
    await this.enterDetails(profile)
    await this.saveProfile()
  }

  async enterDetails(profile: Partial<BusinessProfileInput>) {
    for (const [field, value] of Object.entries(profile) as Array<
      [BusinessProfileField, string]
    >) {
      await this.page
        .getByRole('textbox', { name: fieldLabels[field], exact: true })
        .fill(value)
    }
  }

  async focusField(field: BusinessProfileField) {
    await this.page
      .getByRole('textbox', { name: fieldLabels[field], exact: true })
      .focus()
  }

  async blurField(field: BusinessProfileField) {
    await this.page
      .getByRole('textbox', { name: fieldLabels[field], exact: true })
      .blur()
  }

  async pressEscape() {
    await this.page.keyboard.press('Escape')
  }

  async expectEditorReady() {
    await expect(
      this.page.getByRole('heading', {
        name: 'Unternehmensprofil',
        exact: true,
      }),
    ).toBeVisible()
  }

  async expectFieldValue(field: BusinessProfileField, value: string) {
    await expect(
      this.page.getByRole('textbox', { name: fieldLabels[field], exact: true }),
    ).toHaveValue(value)
  }

  async expectValidationMessage(message: string) {
    await expect(this.page.getByText(message, { exact: true })).toBeVisible()
  }

  async expectValidationMessageHidden(message: string) {
    await expect(this.page.getByText(message, { exact: true })).toHaveCount(0)
  }

  async expectSaveDisabled() {
    await expect(
      this.page.getByRole('button', { name: 'Profil speichern' }),
    ).toBeDisabled()
  }

  async saveProfile() {
    await this.page.getByRole('button', { name: 'Profil speichern' }).click()
  }

  async openIbanGuidance() {
    await this.page.getByRole('button', { name: 'Hinweis zu IBAN' }).click()
  }

  async expectIbanGuidance() {
    await expect(
      this.page.getByText(
        'Die IBAN muss gültig sein. Leerzeichen sind erlaubt.',
      ),
    ).toBeVisible()
  }

  async expectStorageSaveError() {
    await expect(
      this.page.getByRole('alertdialog', {
        name: 'Profil konnte nicht gespeichert werden',
      }),
    ).toBeVisible()
  }

  async closeStorageError() {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Schließen' })
      .click()
  }

  async dismissExternalChangeWarning() {
    await this.page
      .getByRole('alertdialog', {
        name: 'Profil in einem anderen Tab geändert',
      })
      .getByRole('button', { name: 'Schließen' })
      .click()
  }

  async expectBusinessNameFieldDisabled() {
    await expect(
      this.page.getByRole('textbox', {
        name: fieldLabels.businessName,
        exact: true,
      }),
    ).toBeDisabled()
  }

  async expectBusinessNameFieldEnabled() {
    await expect(
      this.page.getByRole('textbox', {
        name: fieldLabels.businessName,
        exact: true,
      }),
    ).toBeEnabled()
  }

  async expectBackupGuidance() {
    await expect(
      this.page.getByText(/unverschlüsselte JSON-Dateien/),
    ).toBeVisible()
  }

  async exportBackup() {
    await this.page
      .getByRole('button', { name: 'Sicherung exportieren' })
      .click()
  }

  async chooseBackup(file: { name: string; contents: string | Buffer }) {
    await this.page.getByLabel('Sicherung importieren').setInputFiles({
      name: file.name,
      mimeType: 'application/json',
      buffer:
        typeof file.contents === 'string'
          ? Buffer.from(file.contents)
          : file.contents,
    })
  }

  async confirmBackupReplacement() {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Profil ersetzen' })
      .click()
  }

  async expectImportError(message: string) {
    await expect(this.page.getByText(message, { exact: true })).toBeVisible()
  }

  async deleteProfile() {
    await this.page
      .getByRole('main')
      .getByRole('button', { name: 'Profil löschen' })
      .click()
  }

  async confirmProfileDeletion() {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Profil löschen' })
      .click()
  }

  async cancelProfileDeletion() {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Abbrechen' })
      .click()
  }

  async expectProfileDeleted() {
    await expect(this.page.getByText(/Profil gelöscht/)).toBeVisible()
  }

  async expectExternalChangeWarning() {
    await expect(
      this.page.getByText('Profil in einem anderen Tab geändert', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      this.page.getByRole('alertdialog', {
        name: 'Profil in einem anderen Tab geändert',
      }),
    ).toBeVisible()
  }
}
