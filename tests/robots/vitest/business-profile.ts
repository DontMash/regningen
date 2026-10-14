import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { expect } from 'vitest'
import type { BusinessProfileScenarioInput } from '../../scenarios/business-profile'

export class BusinessProfileRobot {
  private readonly fieldLabels: Record<
    keyof BusinessProfileScenarioInput,
    string
  > = {
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

  constructor(private readonly user: UserEvent) {}

  private field(name: keyof BusinessProfileScenarioInput) {
    return screen.getByRole('textbox', { name: this.fieldLabels[name] })
  }

  private taxIdentifiers() {
    return within(
      screen.getByRole('group', {
        name: /USt-IdNr. oder Steuernummer.*mindestens eine Angabe/,
      }),
    )
  }

  async touchField(name: keyof BusinessProfileScenarioInput) {
    await this.user.click(this.field(name))
    await this.user.tab()
  }

  async enterProfile(profile: Partial<BusinessProfileScenarioInput>) {
    for (const name of Object.keys(profile) as Array<
      keyof BusinessProfileScenarioInput
    >) {
      const value = profile[name]
      if (value === undefined) continue
      const field = this.field(name)
      await this.user.click(field)
      await this.user.clear(field)
      // Paste keeps bulk example entry efficient under coverage instrumentation.
      if (value) await this.user.paste(value)
    }
  }

  async save() {
    await this.user.click(
      screen.getByRole('button', { name: 'Profil speichern' }),
    )
  }

  async openInvoiceEditor() {
    await this.user.click(screen.getByRole('link', { name: 'Rechnung' }))
  }

  async exportBackup() {
    await this.user.click(
      screen.getByRole('button', { name: 'Sicherung exportieren' }),
    )
  }

  async importBackup(file: File) {
    await this.user.upload(screen.getByLabelText('Sicherung importieren'), file)
  }

  async cancelImport() {
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unternehmensprofil ersetzen?',
    })
    await this.user.click(
      within(dialog).getByRole('button', { name: 'Abbrechen' }),
    )
  }

  async confirmImport() {
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unternehmensprofil ersetzen?',
    })
    await this.user.click(
      within(dialog).getByRole('button', { name: 'Profil ersetzen' }),
    )
  }

  async requestDeletion() {
    await this.user.click(
      screen.getByRole('button', { name: 'Profil löschen' }),
    )
  }

  async cancelDeletion() {
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unternehmensprofil löschen?',
    })
    await this.user.click(
      within(dialog).getByRole('button', { name: 'Abbrechen' }),
    )
  }

  async confirmDeletion() {
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unternehmensprofil löschen?',
    })
    await this.user.click(
      within(dialog).getByRole('button', { name: 'Profil löschen' }),
    )
  }

  async retryStorageRead() {
    await this.user.click(
      screen.getByRole('button', { name: 'Speicher erneut prüfen' }),
    )
  }

  async closeNotice() {
    await this.user.click(screen.getByRole('button', { name: 'Schließen' }))
  }

  async expectImportConfirmation() {
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Unternehmensprofil ersetzen?',
      }),
    ).toBeVisible()
  }

  async expectReady() {
    expect(
      await screen.findByRole('heading', { name: 'Unternehmensprofil' }),
    ).toBeVisible()
  }

  expectFieldValue(name: keyof BusinessProfileScenarioInput, value: string) {
    expect(this.field(name)).toHaveValue(value)
  }

  expectFieldDisabled(name: keyof BusinessProfileScenarioInput) {
    expect(this.field(name)).toBeDisabled()
  }

  expectProfileValues(profile: Partial<BusinessProfileScenarioInput>) {
    for (const name of Object.keys(profile) as Array<
      keyof BusinessProfileScenarioInput
    >) {
      const value = profile[name]
      if (value !== undefined) this.expectFieldValue(name, value)
    }
  }

  expectAllFieldsEmpty() {
    for (const name of Object.keys(this.fieldLabels) as Array<
      keyof BusinessProfileScenarioInput
    >) {
      expect(this.field(name)).toHaveValue('')
    }
  }

  expectRequiredAndOptionalFieldMarkers() {
    const required: Array<keyof BusinessProfileScenarioInput> = [
      'businessName',
      'ownerName',
      'street',
      'postalCode',
      'town',
      'iban',
    ]
    for (const name of required) {
      expect(this.field(name)).toBeRequired()
      expect(
        screen.getByText(this.fieldLabels[name], { selector: 'label' }),
      ).toHaveTextContent(/\*/)
    }
    const optional: Array<keyof BusinessProfileScenarioInput> = [
      'serviceDescription',
      'phone',
      'mobile',
    ]
    for (const name of optional) {
      expect(this.field(name)).not.toBeRequired()
      expect(
        screen.getByText(this.fieldLabels[name], { selector: 'label' }),
      ).not.toHaveTextContent(/\*/)
    }
  }

  expectTaxIdentifiersAreAlternative() {
    const identifiers = this.taxIdentifiers()
    expect(
      identifiers.getByRole('textbox', { name: this.fieldLabels.vatId }),
    ).not.toBeRequired()
    expect(
      identifiers.getByRole('textbox', { name: this.fieldLabels.taxNumber }),
    ).not.toBeRequired()
  }

  expectNoTaxIdentifierErrors() {
    expect(this.taxIdentifiers().queryByRole('alert')).not.toBeInTheDocument()
  }

  expectMissingTaxIdentifierFeedback() {
    const identifiers = this.taxIdentifiers()
    const message = 'Umsatzsteuer-ID oder Steuernummer angeben.'
    expect(identifiers.getByText(message)).toBeVisible()
    expect(
      identifiers.getByRole('textbox', { name: this.fieldLabels.vatId }),
    ).toHaveAccessibleDescription(message)
    expect(
      identifiers.getByRole('textbox', { name: this.fieldLabels.taxNumber }),
    ).toHaveAccessibleDescription(message)
  }

  async expectInvalidVatIdFeedback() {
    expect(
      await this.taxIdentifiers().findByText(
        'Eine deutsche Umsatzsteuer-ID beginnt mit DE und hat neun Ziffern.',
      ),
    ).toBeVisible()
  }

  expectTaxNumberValid() {
    expect(this.field('taxNumber')).toHaveAttribute('aria-invalid', 'false')
  }

  async expectSaveEnabled() {
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Profil speichern' }),
      ).toBeEnabled(),
    )
  }

  expectSaveDisabled() {
    expect(
      screen.getByRole('button', { name: 'Profil speichern' }),
    ).toBeDisabled()
  }

  expectNoInvoiceAction() {
    expect(
      screen.queryByRole('link', { name: 'Rechnung' }),
    ).not.toBeInTheDocument()
  }

  expectExportEnabled() {
    expect(
      screen.getByRole('button', { name: 'Sicherung exportieren' }),
    ).toBeEnabled()
  }

  expectExportDisabled() {
    expect(
      screen.getByRole('button', { name: 'Sicherung exportieren' }),
    ).toBeDisabled()
  }

  async expectInvoiceRouteSelected() {
    expect(
      await screen.findByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).toBeVisible()
  }

  async expectStorageUnavailable() {
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Unternehmensprofil nicht verfügbar',
      }),
    ).toBeVisible()
  }

  async expectStorageSaveFailure() {
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Profil konnte nicht gespeichert werden',
      }),
    ).toBeVisible()
  }

  expectNoNotice(message: string) {
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  }

  async expectNotice(message: string) {
    expect(await screen.findByText(message)).toBeVisible()
  }
}
