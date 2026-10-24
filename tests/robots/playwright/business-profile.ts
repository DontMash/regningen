import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { BusinessProfileScenarioInput } from '../../scenarios/business-profile'

export type BusinessProfileInput = BusinessProfileScenarioInput

export type BusinessProfileField = keyof BusinessProfileInput

const fieldLabels: Record<BusinessProfileField, RegExp> = {
  businessName: /^(Unternehmensname|Business name)$/,
  serviceDescription: /^(Leistungsbeschreibung|Service description)$/,
  ownerName: /^(Inhaber\/in|Owner)$/,
  street: /^(Straße und Hausnummer|Street and house number)$/,
  postalCode: /^(Postleitzahl|Postal code)$/,
  town: /^(Ort|Town or city)$/,
  phone: /^(Telefon|Phone)$/,
  mobile: /^(Mobiltelefon|Mobile phone)$/,
  iban: /^IBAN$/,
  vatId: /^(USt-IdNr\.|VAT ID)$/,
  taxNumber: /^(Steuernummer|Tax number)$/,
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

  async expectEditorReady(locale: 'de' | 'en' = 'de') {
    await expect(
      this.page.getByRole('heading', {
        name: locale === 'de' ? 'Unternehmensprofil' : 'Business Profile',
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

  async expectSaveEnabled() {
    await expect(
      this.page.getByRole('button', { name: 'Profil speichern' }),
    ).toBeEnabled()
  }

  async saveProfile() {
    await this.page
      .getByRole('button', { name: /^(Profil speichern|Save profile)$/ })
      .click()
  }

  async openIbanGuidanceWithKeyboard() {
    await this.focusField('mobile')
    await this.page.keyboard.press('Tab')
    await this.page.keyboard.press('Enter')
  }

  async expectAccessibleIbanGuidance(locale: 'de' | 'en') {
    const guidance =
      locale === 'de'
        ? 'Die IBAN muss gültig sein. Leerzeichen sind erlaubt. Maximal 42 Zeichen.'
        : 'The IBAN must be valid. Spaces are allowed. Maximum 42 characters.'
    const popup = this.page.getByRole('dialog', { name: 'IBAN', exact: true })
    await expect(popup).toHaveAccessibleDescription(guidance)
    await expect(popup.getByText(guidance, { exact: true })).toBeVisible()
    await expect(
      this.page.getByRole('textbox', { name: 'IBAN', exact: true }),
    ).toHaveAccessibleDescription(new RegExp(guidance.replaceAll('.', '\\.')))
  }

  async expectIbanFeedbackAssociated(locale: 'de' | 'en') {
    await expect(
      this.page.getByRole('textbox', { name: 'IBAN', exact: true }),
    ).toHaveAccessibleDescription(
      locale === 'de'
        ? 'Die IBAN muss gültig sein. Leerzeichen sind erlaubt. Maximal 42 Zeichen. Bitte eine gültige IBAN eingeben.'
        : 'The IBAN must be valid. Spaces are allowed. Maximum 42 characters. Please enter a valid IBAN.',
    )
  }

  async dismissIbanGuidanceAndContinue(value: string) {
    await this.page.keyboard.press('Escape')
    await expect(
      this.page.getByRole('button', {
        name: /^(Hinweis zu IBAN|Hint for IBAN)$/,
      }),
    ).toBeFocused()
    await this.page.keyboard.press('Tab')
    await this.page.keyboard.type(value)
  }

  async openIbanGuidance() {
    await this.page.getByRole('button', { name: 'Hinweis zu IBAN' }).click()
  }

  async expectIbanGuidance() {
    await expect(
      this.page
        .getByRole('dialog', { name: 'IBAN', exact: true })
        .getByText('Die IBAN muss gültig sein. Leerzeichen sind erlaubt.'),
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

  async expectProfileSaved() {
    await expect(
      this.page.getByText(/^(Profil gespeichert\.|Profile saved\.)$/).first(),
    ).toBeVisible()
  }

  async expectUnsavedChangesWarning() {
    const dialog = this.page.getByRole('alertdialog', {
      name: 'Ungespeicherte Änderungen verwerfen?',
    })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Bleiben', exact: true }),
    ).toBeFocused()
  }

  async expectUnsavedChangesWarningAbsent() {
    await expect(
      this.page.getByRole('alertdialog', {
        name: 'Ungespeicherte Änderungen verwerfen?',
      }),
    ).toHaveCount(0)
  }

  async keepUnsavedChanges() {
    await this.page
      .getByRole('alertdialog', {
        name: 'Ungespeicherte Änderungen verwerfen?',
      })
      .getByRole('button', { name: 'Bleiben', exact: true })
      .click()
  }

  async discardUnsavedChanges() {
    await this.page
      .getByRole('alertdialog', {
        name: 'Ungespeicherte Änderungen verwerfen?',
      })
      .getByRole('button', { name: 'Änderungen verwerfen', exact: true })
      .click()
  }

  async expectBackupExportDisabled() {
    await expect(
      this.page.getByRole('button', { name: 'Sicherung exportieren' }),
    ).toBeDisabled()
  }

  async cancelBackupReplacement() {
    await this.page
      .getByRole('alertdialog', { name: 'Unternehmensprofil ersetzen?' })
      .getByRole('button', { name: 'Abbrechen', exact: true })
      .click()
  }

  async openInvoiceEditor() {
    await this.page
      .getByRole('main')
      .getByRole('link', { name: 'Rechnung', exact: true })
      .click()
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

  async expectNoExternalChangeWarning() {
    await expect(
      this.page.getByText('Profil in einem anderen Tab geändert', {
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(this.page.getByRole('alertdialog')).toHaveCount(0)
  }
}
