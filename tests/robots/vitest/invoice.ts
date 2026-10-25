import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { expect } from 'vitest'
import type {
  InvoicePositionInput,
  InvoiceRecipientInput,
  InvoiceScenarioExpected,
} from '../../scenarios/invoice'

export class InvoiceRobot {
  constructor(private readonly user: UserEvent) {}

  async expectReady() {
    expect(
      await screen.findByRole('heading', { name: 'Rechnung erstellen' }),
    ).toBeVisible()
  }

  async expectBlockingNotice(title: string) {
    expect(
      await screen.findByRole('alertdialog', { name: title }),
    ).toBeVisible()
  }

  async closeBlockingNotice() {
    await this.user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Schließen',
      }),
    )
  }

  expectInvoiceNumber(number: string) {
    expect(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
    ).toHaveValue(number)
  }

  async expectPdfDisabled() {
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'PDF erstellen' }),
      ).toBeDisabled(),
    )
  }

  async enterSubject(subject: string) {
    await this.replaceValue(
      screen.getByRole('textbox', { name: /^Betreff/ }),
      subject,
    )
  }

  expectSubject(subject: string) {
    expect(screen.getByRole('textbox', { name: /^Betreff/ })).toHaveValue(
      subject,
    )
  }

  async enterInvoiceNumber(number: string) {
    await this.replaceValue(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
      number,
    )
  }

  async enterRecipient(recipient: Partial<InvoiceRecipientInput>) {
    for (const field of Object.keys(recipient) as Array<
      keyof InvoiceRecipientInput
    >) {
      const value = recipient[field]
      if (value !== undefined)
        await this.replaceValue(this.recipientField(field), value)
    }
  }

  async touchRecipient(field: keyof InvoiceRecipientInput) {
    await this.user.click(this.recipientField(field))
    await this.user.tab()
  }

  async enterNewPosition(position: Partial<InvoicePositionInput>) {
    for (const field of Object.keys(position) as Array<
      keyof InvoicePositionInput
    >) {
      const value = position[field]
      if (value !== undefined)
        await this.replaceValue(this.newPositionField(field), value)
    }
  }

  async touchNewPosition(field: keyof InvoicePositionInput) {
    await this.user.click(this.newPositionField(field))
    await this.user.tab()
  }

  async submitNewPositionWithEnter(field: keyof InvoicePositionInput) {
    await this.user.click(this.newPositionField(field))
    await this.user.keyboard('{Enter}')
  }

  expectNewPositionValues(position: Partial<InvoicePositionInput>) {
    for (const field of Object.keys(position) as Array<
      keyof InvoicePositionInput
    >) {
      expect(this.newPositionField(field)).toHaveValue(position[field])
    }
  }

  async submitNewPosition() {
    await this.user.click(
      screen.getByRole('button', {
        name: /^(?:Position hinzufügen|Add position)$/,
      }),
    )
  }

  async addPosition(position: InvoicePositionInput) {
    await this.enterNewPosition(position)
    await this.submitNewPosition()
  }

  async editPosition(index: number, position: Partial<InvoicePositionInput>) {
    for (const field of Object.keys(position) as Array<
      keyof InvoicePositionInput
    >) {
      const value = position[field]
      if (value !== undefined)
        await this.replaceValue(this.positionField(index, field), value)
    }
  }

  async blurPositionAmount(index: number) {
    await this.user.click(this.positionField(index, 'amount'))
    await this.user.tab()
  }

  async removePosition(index: number) {
    await this.user.click(
      screen.getByRole('button', {
        name: new RegExp(
          `^(?:Position ${index} entfernen|Remove position ${index})$`,
        ),
      }),
    )
  }

  async chooseVatRate(rate: 7 | 19) {
    await this.user.click(screen.getByRole('button', { name: `${rate} %` }))
  }

  async expectMessage(message: string) {
    expect(await screen.findByText(message, { exact: true })).toBeVisible()
  }

  expectMessageAbsent(message: string) {
    expect(screen.queryByText(message, { exact: true })).not.toBeInTheDocument()
  }

  async expectPositionCount(text: string) {
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(new RegExp(`^${text}$`))
    expect(status).toBeVisible()
    expect(status).toHaveAttribute('aria-live', 'polite')
  }

  expectPositionValues(index: number, position: Partial<InvoicePositionInput>) {
    for (const field of Object.keys(position) as Array<
      keyof InvoicePositionInput
    >) {
      expect(this.positionField(index, field)).toHaveValue(position[field])
    }
  }

  expectTotals(totals: Partial<InvoiceScenarioExpected['totals']>) {
    const summary = within(screen.getByRole('complementary'))
    const labels = { net: 'Netto', tax: /% MwSt\./, gross: 'Brutto' }
    for (const field of Object.keys(totals) as Array<keyof typeof labels>) {
      const value = totals[field]
      if (value !== undefined) {
        const row = summary.getByText(labels[field]).parentElement
        if (!row) throw new Error(`Missing Invoice total row: ${field}`)
        expect(within(row).getByText(value, { exact: true })).toBeVisible()
      }
    }
  }

  async openDatePicker() {
    await this.user.click(screen.getByRole('button', { name: /^Datum/ }))
  }

  async expectDatePickerOpen() {
    expect(await screen.findByRole('grid')).toBeVisible()
  }

  async chooseVisibleCalendarDate(isoDate: string) {
    const date = new Date(`${isoDate}T12:00:00`)
    const monthAndYear = date.toLocaleDateString('de-DE', {
      month: 'long',
      year: 'numeric',
    })
    await this.user.click(
      within(screen.getByRole('grid')).getByRole('button', {
        name: new RegExp(`${date.getDate()}\\. ${monthAndYear}`),
      }),
    )
  }

  expectDateLabel(label: string) {
    expect(screen.getByRole('button', { name: /^Datum/ })).toHaveTextContent(
      label,
    )
  }

  async startNewInvoice() {
    await this.user.click(
      screen.getByRole('button', { name: /^Neue Rechnung$/ }),
    )
  }

  async expectNewInvoiceConfirmation() {
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Neue Rechnung beginnen?',
      }),
    ).toBeVisible()
  }

  expectNewInvoiceConfirmationAbsent() {
    expect(
      screen.queryByRole('alertdialog', { name: 'Neue Rechnung beginnen?' }),
    ).not.toBeInTheDocument()
  }

  async cancelNewInvoice() {
    await this.user.click(
      within(this.newInvoiceDialog()).getByRole('button', {
        name: 'Abbrechen',
      }),
    )
  }

  async confirmNewInvoice() {
    await this.user.click(
      within(this.newInvoiceDialog()).getByRole('button', {
        name: 'Neue Rechnung beginnen',
      }),
    )
  }

  expectPdfEnabled() {
    expect(screen.getByRole('button', { name: 'PDF erstellen' })).toBeEnabled()
  }

  async createPdf() {
    await this.user.click(screen.getByRole('button', { name: 'PDF erstellen' }))
  }

  private newInvoiceDialog() {
    return screen.getByRole('alertdialog', { name: 'Neue Rechnung beginnen?' })
  }

  expectRecipientIdentityOptional() {
    const identity = within(this.recipientIdentityGroup())
    expect(
      identity.getByRole('textbox', { name: 'Unternehmen des Empfängers' }),
    ).not.toBeRequired()
    expect(
      identity.getByRole('textbox', { name: 'Name / z. Hd.' }),
    ).not.toBeRequired()
  }

  expectRecipientIdentityFeedbackAbsent() {
    expect(
      within(this.recipientIdentityGroup()).queryByRole('alert'),
    ).not.toBeInTheDocument()
  }

  expectRecipientIdentityError(message: string) {
    const identity = within(this.recipientIdentityGroup())
    expect(identity.getByText(message)).toBeVisible()
    for (const label of ['Unternehmen des Empfängers', 'Name / z. Hd.']) {
      const field = identity.getByRole('textbox', { name: label })
      expect(field).toHaveAccessibleDescription(message)
      expect(field).toHaveAttribute('aria-invalid', 'true')
    }
  }

  expectRecipientValid(field: keyof InvoiceRecipientInput) {
    expect(this.recipientField(field)).toHaveAttribute('aria-invalid', 'false')
  }

  expectRequiredControlSemantics() {
    for (const label of [
      'Rechnungsnummer',
      'Straße und Hausnummer',
      'PLZ',
      'Ort',
      'Beschreibung',
      'Brutto in Euro',
    ]) {
      expect(screen.getByRole('textbox', { name: label })).toBeRequired()
      expect(screen.getByText(label, { selector: 'label' })).toHaveTextContent(
        /\*/,
      )
    }
    for (const label of [
      'Betreff',
      'Unternehmen des Empfängers',
      'Name / z. Hd.',
    ]) {
      expect(screen.getByRole('textbox', { name: label })).not.toBeRequired()
      expect(
        screen.getByText(label, { selector: 'label' }),
      ).not.toHaveTextContent(/\*/)
    }
    expect(
      screen.getByRole('button', { name: 'Datum' }),
    ).toHaveAccessibleDescription('Pflichtangabe.')
    expect(
      screen.getByRole('group', { name: 'MwSt.-Satz' }),
    ).toHaveAccessibleDescription('Pflichtangabe.')
    expect(
      screen.getByText('MwSt.-Satz', { selector: 'label' }),
    ).toHaveTextContent(/\*/)
    for (const label of ['Beschreibung', 'Brutto in Euro']) {
      expect(
        screen.getByRole('columnheader', { name: label }),
      ).toHaveTextContent(/\*/)
    }
  }

  expectPositionRequired(index: number) {
    expect(this.positionField(index, 'description')).toBeRequired()
    expect(this.positionField(index, 'amount')).toBeRequired()
  }

  private recipientIdentityGroup() {
    return screen.getByRole('group', {
      name: /Unternehmen oder Name.*mindestens eine Angabe/,
    })
  }

  private recipientField(field: keyof InvoiceRecipientInput) {
    const labels = {
      company: 'Unternehmen des Empfängers',
      name: 'Name / z. Hd.',
      street: 'Straße und Hausnummer',
      postalCode: 'PLZ',
      town: 'Ort',
    }
    return screen.getByRole('textbox', { name: labels[field] })
  }

  private newPositionField(field: keyof InvoicePositionInput) {
    return screen.getByRole('textbox', {
      name:
        field === 'description'
          ? /^(?:Beschreibung|Description)$/
          : /^(?:Brutto in Euro|Gross amount in euros)$/,
    })
  }

  private positionField(index: number, field: keyof InvoicePositionInput) {
    return screen.getByRole('textbox', {
      name: `${field === 'description' ? 'Beschreibung' : 'Brutto in Euro'} Position ${index}`,
    })
  }

  private async replaceValue(field: HTMLElement, value: string) {
    await this.user.clear(field)
    if (value) await this.user.type(field, value)
  }

  expectProfileLoading() {
    expect(
      screen.getByText('Unternehmensprofil wird lokal geladen …'),
    ).toBeVisible()
  }

  async expectProfileSetupPrompt() {
    expect(
      await screen.findByRole('heading', {
        name: 'Unternehmensprofil vervollständigen',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Unternehmensprofil öffnen' }),
    ).toHaveAttribute('href', '/settings/profile')
  }
}
