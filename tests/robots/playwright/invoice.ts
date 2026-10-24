import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type {
  InvoicePositionInput as ScenarioInvoicePositionInput,
  InvoiceRecipientInput as ScenarioInvoiceRecipientInput,
  InvoiceScenarioInput,
} from '../../scenarios/invoice'

export type RecipientInput = ScenarioInvoiceRecipientInput
export type InvoicePositionInput = ScenarioInvoicePositionInput
export type InvoiceInput = InvoiceScenarioInput

type InvoiceControl =
  | 'number'
  | 'subject'
  | 'new position description'
  | 'new position amount'
  | 'add position'
  | 'save invoice'

export class InvoiceRobot {
  constructor(private readonly page: Page) {}

  async expectReady(locale: 'de' | 'en' = 'de') {
    await expect(
      this.page.getByRole('heading', {
        name: locale === 'de' ? 'Rechnung erstellen' : 'Create an invoice',
        exact: true,
      }),
    ).toBeVisible()
  }

  async expectProfileSetupPrompt(locale: 'de' | 'en' = 'de') {
    await expect(
      this.page.getByRole('heading', {
        name:
          locale === 'de'
            ? 'Unternehmensprofil vervollständigen'
            : 'Complete the business profile',
      }),
    ).toBeVisible()
  }

  async expectBlockedByStorageFailure() {
    await expect(
      this.page.getByRole('alertdialog', {
        name: 'Profil konnte nicht gespeichert werden',
      }),
    ).toBeVisible()
  }

  async expectStorageFailureAbsent() {
    await expect(
      this.page.getByRole('alertdialog', {
        name: 'Profil konnte nicht gespeichert werden',
      }),
    ).toHaveCount(0)
  }

  async expectProfileUpdateWarning() {
    await expect(
      this.page.getByRole('alertdialog', {
        name: 'Unternehmensprofil wird aktualisiert',
      }),
    ).toBeVisible()
  }

  async closeBlockingNotice() {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Schließen' })
      .click()
  }

  async enterInvoiceNumber(number: string) {
    await this.control('number').fill(number)
  }

  async blurInvoiceNumber() {
    await this.control('number').blur()
  }

  async enterSubject(subject: string) {
    await this.control('subject').fill(subject)
  }

  async enterRecipient(recipient: Partial<RecipientInput>) {
    const entries: Array<[keyof RecipientInput, string]> = [
      ['company', recipient.company ?? ''],
      ['name', recipient.name ?? ''],
      ['street', recipient.street ?? ''],
      ['postalCode', recipient.postalCode ?? ''],
      ['town', recipient.town ?? ''],
    ]
    for (const [field, value] of entries) {
      if (field in recipient) await this.recipientControl(field).fill(value)
    }
  }

  async enterInvoice(invoice: InvoiceInput) {
    await this.enterInvoiceNumber(invoice.number)
    await this.chooseInvoiceDate(invoice.date)
    await this.enterSubject(invoice.subject)
    await this.enterRecipient(invoice.recipient)
    for (const position of invoice.positions) await this.addPosition(position)
    await this.chooseVatRate(invoice.vatRate)
  }

  async focusRecipient(field: 'company' | 'name' = 'company') {
    await this.recipientControl(field).focus()
  }

  async blurRecipient(field: 'company' | 'name') {
    await this.recipientControl(field).blur()
  }

  async addPosition(position: InvoicePositionInput) {
    await this.control('new position description').fill(position.description)
    await this.control('new position amount').fill(position.amount)
    await this.control('add position').click()
  }

  async enterNewPosition(position: Partial<InvoicePositionInput>) {
    if (position.description !== undefined)
      await this.control('new position description').fill(position.description)
    if (position.amount !== undefined)
      await this.control('new position amount').fill(position.amount)
  }

  async blurNewPositionAmount() {
    await this.control('new position amount').blur()
  }

  async submitNewPosition() {
    await this.control('add position').click()
  }

  async pressEnterInNewPosition(field: 'description' | 'amount') {
    await this.control(
      field === 'description'
        ? 'new position description'
        : 'new position amount',
    ).press('Enter')
  }

  async editPosition(
    index: number,
    field: 'description' | 'amount',
    value: string,
  ) {
    await this.positionControl(index, field).fill(value)
  }

  async appendToPosition(
    index: number,
    field: 'description' | 'amount',
    value: string,
  ) {
    const control = this.positionControl(index, field)
    await control.click()
    await control.press('End')
    await control.pressSequentially(value)
  }

  async blurPositionAmount(index: number) {
    await this.positionControl(index, 'amount').blur()
  }

  async removePosition(index: number) {
    await this.page
      .getByRole('button', {
        name: new RegExp(
          `^(Position ${index} entfernen|Remove position ${index})$`,
        ),
      })
      .click()
  }

  async chooseVatRate(rate: 7 | 19) {
    await this.page.getByRole('button', { name: `${rate} %` }).click()
  }

  async openDatePicker() {
    await this.datePickerTrigger().click()
  }

  async openDatePickerWithKeyboard() {
    await this.datePickerTrigger().focus()
    await this.page.keyboard.press('Enter')
  }

  async pressCalendarKey(
    key:
      | 'ArrowLeft'
      | 'ArrowRight'
      | 'ArrowUp'
      | 'ArrowDown'
      | 'Enter'
      | 'Escape'
      | 'Tab'
      | 'Shift+Tab',
  ) {
    await this.page.keyboard.press(key)
  }

  async expectFocusedCalendarDate(label: string) {
    await expect(
      this.page
        .getByRole('grid')
        .getByRole('button', { name: label, exact: true }),
    ).toBeFocused()
  }

  async navigateCalendarMonthWithKeyboard(direction: 'previous' | 'next') {
    const name =
      direction === 'next'
        ? /^(Nächster Monat|Next month)$/
        : /^(Vorheriger Monat|Previous month)$/
    await this.page.getByRole('button', { name }).focus()
    await this.page.keyboard.press('Enter')
  }

  async expectDatePickerDismissedWithTriggerFocused() {
    await expect(this.page.getByRole('grid')).toHaveCount(0)
    await expect(this.datePickerTrigger()).toBeFocused()
  }

  private datePickerTrigger() {
    return this.page.getByRole('button', { name: /^(Datum|Date)/ })
  }

  async expectDatePickerOpen() {
    await expect(this.page.getByRole('grid')).toBeVisible()
    await expect(
      this.page.getByRole('grid').getByRole('button', { name: /\d/ }).first(),
    ).toBeVisible()
  }

  async chooseSecondAvailableCalendarDay() {
    const days = this.page.locator('[data-slot="calendar"] button[data-day]')
    await expect(days.first()).toBeVisible()
    await days.nth(1).click()
  }

  async chooseInvoiceDate(isoDate: string, locale: 'de' | 'en' = 'de') {
    const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
    if (!target)
      throw new Error(`Invoice date must be ISO formatted: ${isoDate}`)
    const [, yearText, monthText, dayText] = target
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const visibleDate = await this.readSelectedDate()
    const current = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(visibleDate.trim())
    if (!current)
      throw new Error(`Unexpected selected invoice date: ${visibleDate}`)
    const currentMonth = Number(current[3]) * 12 + Number(current[2]) - 1
    const targetMonth = year * 12 + month - 1
    await this.openDatePicker()
    for (let step = currentMonth; step < targetMonth; step++) {
      await this.page
        .getByRole('button', { name: /^(Nächster Monat|Next month)$/ })
        .click()
    }
    for (let step = currentMonth; step > targetMonth; step--) {
      await this.page
        .getByRole('button', { name: /^(Vorheriger Monat|Previous month)$/ })
        .click()
    }
    const localeDate = new Date(year, month - 1, day).toLocaleDateString(
      locale === 'de' ? 'de-DE' : 'en-GB',
    )
    await this.page
      .locator(`[data-slot="calendar"] button[data-day="${localeDate}"]`)
      .click()
  }

  async readSelectedDate() {
    return this.datePickerTrigger().innerText()
  }

  async expectDateLabelMatches(pattern: RegExp) {
    await expect(this.datePickerTrigger()).toContainText(pattern)
  }

  async expectInvoiceNumber(number: string) {
    await expect(this.control('number')).toHaveValue(number)
  }

  async expectSubject(subject: string) {
    await expect(this.control('subject')).toHaveValue(subject)
  }

  async expectRecipientField(field: keyof RecipientInput, value: string) {
    await expect(this.recipientControl(field)).toHaveValue(value)
  }

  async expectSelectedDate(isoDate: string, locale: 'de' | 'en' = 'de') {
    const [year, month, day] = isoDate.split('-').map(Number)
    const expectedDate = new Date(year, month - 1, day).toLocaleDateString(
      locale === 'de' ? 'de-DE' : 'en-GB',
      { day: '2-digit', month: '2-digit', year: 'numeric' },
    )
    await expect(this.datePickerTrigger()).toContainText(
      new RegExp(expectedDate.split(/[./]/).join('[./]')),
    )
  }

  async expectVatRate(rate: 7 | 19) {
    await expect(
      this.page.getByRole('button', { name: `${rate} %`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
  }

  async expectPositionCount(count: number) {
    await expect(
      this.page
        .getByRole('table', {
          name: /^(Rechnungspositionen|Invoice positions)$/,
        })
        .locator('tbody tr'),
    ).toHaveCount(count)
  }

  async expectAddPositionDisabled() {
    await expect(this.control('add position')).toBeDisabled()
  }

  async expectNewPositionValues(position: Partial<InvoicePositionInput>) {
    if (position.description !== undefined) {
      await expect(this.control('new position description')).toHaveValue(
        position.description,
      )
    }
    if (position.amount !== undefined) {
      await expect(this.control('new position amount')).toHaveValue(
        position.amount,
      )
    }
  }

  async expectEmptyPositions() {
    await expect(
      this.page.getByRole('table', {
        name: /^(Rechnungspositionen|Invoice positions)$/,
      }),
    ).toContainText('Noch keine Positionen')
  }

  async expectPositionValue(
    index: number,
    field: 'description' | 'amount',
    value: string,
  ) {
    await expect(this.positionControl(index, field)).toHaveValue(value)
  }

  async expectValidationMessage(message: string) {
    await expect(this.page.getByText(message, { exact: true })).toBeVisible()
  }

  async expectValidationMessageAbsent(message: string) {
    await expect(this.page.getByText(message, { exact: true })).toHaveCount(0)
  }

  async expectDraftPersistenceWarning() {
    await expect(
      this.page.getByRole('alert').filter({
        hasText: 'Die Eingaben bleiben in diesem Tab bearbeitbar',
      }),
    ).toBeVisible()
  }

  async expectDraftPersistenceWarningAbsent() {
    await expect(
      this.page.getByRole('alert').filter({
        hasText: 'Die Eingaben bleiben in diesem Tab bearbeitbar',
      }),
    ).toHaveCount(0)
  }

  async expectDraftRecoveryWarning() {
    await expect(
      this.page
        .getByText(
          'Der gespeicherte Rechnungsentwurf ist ungültig oder nicht kompatibel. Es wurde ein leerer Entwurf geöffnet.',
          { exact: false },
        )
        .first(),
    ).toBeVisible()
  }

  async expectNewInvoiceFailed() {
    await expect(
      this.page.getByRole('heading', {
        name: 'Neue Rechnung konnte nicht begonnen werden',
      }),
    ).toBeVisible()
  }

  async expectPdfEnabled() {
    await expect(this.control('save invoice')).toBeEnabled()
  }

  async expectPdfDisabled() {
    await expect(this.control('save invoice')).toBeDisabled()
  }

  async createPdf() {
    await this.control('save invoice').click()
  }

  async expectPdfCreated() {
    await expect(
      this.page.getByRole('heading', {
        name: /^(PDF wurde erstellt|PDF created)$/,
      }),
    ).toBeVisible()
  }

  async expectSummaryTotals(totals: {
    net: string
    tax: string
    gross: string
  }) {
    const summary = this.page.getByRole('complementary')
    await expect(
      summary.getByText(/^(Netto|Net)$/).locator('..'),
    ).toContainText(totals.net)
    await expect(summary.getByText(/MwSt\.|VAT/).locator('..')).toContainText(
      totals.tax,
    )
    await expect(
      summary.getByText(/^(Brutto|Gross)$/).locator('..'),
    ).toContainText(totals.gross)
  }

  async expectBusinessName(name: string) {
    await expect(this.page.getByText(name, { exact: true })).toBeVisible()
  }

  async startNewInvoice() {
    await this.page
      .getByRole('button', { name: 'Neue Rechnung', exact: true })
      .click()
  }

  async expectNewInvoiceConfirmation() {
    await expect(
      this.page.getByRole('alertdialog', { name: 'Neue Rechnung beginnen?' }),
    ).toBeVisible()
  }

  async cancelNewInvoice() {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Abbrechen' })
      .click()
  }

  async confirmNewInvoice() {
    await this.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Neue Rechnung beginnen' })
      .click()
  }

  async expectNewInvoiceDraft() {
    await this.expectInvoiceNumber('')
    await expect(this.page.getByLabel('Beschreibung Position 1')).toHaveCount(0)
    await this.expectEmptyPositions()
    await this.expectDateLabelMatches(/\d{2}\.\d{2}\.\d{4}/)
  }

  async expectInvoiceNumberValidation() {
    await expect(this.page.getByText('Rechnungsnummer fehlt.')).toBeVisible()
  }

  async expectInvoiceEntriesPreserved(number: string, description: string) {
    await this.expectInvoiceNumber(number)
    await this.expectPositionValue(1, 'description', description)
  }

  async expectProfileMissingWarning() {
    await expect(
      this.page.getByRole('alertdialog', {
        name: 'Profil vervollständigen, um das PDF zu erstellen',
      }),
    ).toBeVisible()
  }

  private control(control: InvoiceControl): Locator {
    const controls: Record<InvoiceControl, Locator> = {
      number: this.page.getByRole('textbox', {
        name: /^(Rechnungsnummer|Invoice number)/,
      }),
      subject: this.page.getByRole('textbox', { name: /^(Betreff|Subject)/ }),
      'new position description': this.page.getByRole('textbox', {
        name: /^(Beschreibung|Description)$/,
        exact: true,
      }),
      'new position amount': this.page.getByRole('textbox', {
        name: /^(Brutto in Euro|Gross amount in euros)$/,
        exact: true,
      }),
      'add position': this.page.getByRole('button', {
        name: /^(Position hinzufügen|Add position)$/,
        exact: true,
      }),
      'save invoice': this.page.getByRole('button', {
        name: /^(PDF erstellen|Create PDF)$/,
      }),
    }
    return controls[control]
  }

  private recipientControl(field: keyof RecipientInput) {
    const labels: Record<keyof RecipientInput, RegExp> = {
      company: /^(Unternehmen des Empfängers|Recipient's business)$/,
      name: /^(Name \/ z\. Hd\.|Name \/ for the attention of)$/,
      street: /^(Straße und Hausnummer|Street and house number)$/,
      postalCode: /^(PLZ|Postal code)$/,
      town: /^(Ort|Town or city)$/,
    }
    return this.page.getByRole('textbox', { name: labels[field], exact: true })
  }

  private positionControl(index: number, field: 'description' | 'amount') {
    const label =
      field === 'description'
        ? new RegExp(
            `^(Beschreibung Position ${index}|Description for position ${index})$`,
          )
        : new RegExp(
            `^(Brutto in Euro Position ${index}|Gross amount in euros for position ${index})$`,
          )
    return this.page.getByRole('textbox', { name: label, exact: true })
  }
}
