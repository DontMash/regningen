import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

export type LayoutBox = {
  x: number
  y: number
  width: number
  height: number
}

export type InvoiceMeasurementControl =
  | 'number'
  | 'subject'
  | 'new position description'
  | 'new position amount'
  | 'add position'

export class LayoutMeasurements {
  constructor(private readonly page: Page) {}

  async mainContentHeight() {
    const box = await this.page.getByRole('main').boundingBox()
    if (!box) throw new Error('The main content is not visible.')
    return box.height
  }

  async bodyBackgroundColor() {
    return this.page
      .locator('body')
      .evaluate((body) => getComputedStyle(body).backgroundColor)
  }

  async headerBorderColors() {
    return this.page.locator('body > header').evaluate((header) => ({
      actual: getComputedStyle(header).borderBottomColor,
      expected: getComputedStyle(document.documentElement)
        .getPropertyValue('--border')
        .trim(),
    }))
  }

  async standaloneTypography(viewportWidth: number) {
    return this.page.evaluate((width) => {
      const sample = document.createElement('div')
      sample.className = 'typeset typeset-default'
      sample.innerHTML =
        '<h1>Heading</h1><h3>Brand scale</h3><p>Paragraph</p><div class="footnotes">Supporting text</div>'
      document.body.append(sample)

      const typography = (element: Element) => {
        const style = getComputedStyle(element)
        return [
          style.fontFamily,
          style.fontSize,
          style.fontWeight,
          style.lineHeight,
        ]
      }
      const compare = (role: string, element: string) => {
        const standalone = document.createElement('div')
        standalone.className = role
        document.body.append(standalone)
        const actual = typography(standalone)
        const expected = typography(sample.querySelector(element)!)
        standalone.remove()
        return { actual, expected }
      }

      const result = {
        heading: compare('heading-1', 'h1'),
        wordmark: compare('wordmark', 'h3'),
        large: compare('paragraph-large', 'p'),
        small: compare('paragraph-small', '.footnotes'),
        ...(width >= 768 ? { regular: compare('paragraph', 'p') } : {}),
      }
      sample.remove()
      return result
    }, viewportWidth)
  }

  async businessProfileOwnerAndSaveButton() {
    return Promise.all([
      this.profileControlBox('Inhaber/in'),
      this.profileControlBox('save'),
    ])
  }

  async businessProfileTaxNumberAndSaveButton() {
    return Promise.all([
      this.profileControlBox('Steuernummer'),
      this.profileControlBox('save'),
    ])
  }

  async businessProfileErrorGrowth(message: string) {
    return this.errorGrowth(message)
  }

  async invoiceControl(control: InvoiceMeasurementControl): Promise<LayoutBox> {
    const controls: Record<InvoiceMeasurementControl, Locator> = {
      number: this.page.getByLabel('Rechnungsnummer'),
      subject: this.page.getByLabel('Betreff'),
      'new position description': this.page.getByRole('textbox', {
        name: 'Beschreibung',
        exact: true,
      }),
      'new position amount': this.page.getByRole('textbox', {
        name: 'Brutto in Euro',
        exact: true,
      }),
      'add position': this.page.getByRole('button', {
        name: 'Position hinzufügen',
        exact: true,
      }),
    }
    return this.documentBox(controls[control])
  }

  async invoiceRecipientControl(field: 'company' | 'street') {
    const locator =
      field === 'company'
        ? this.page.getByLabel('Unternehmen des Empfängers')
        : this.page.getByRole('textbox', {
            name: 'Straße und Hausnummer',
            exact: true,
          })
    return this.documentBox(locator)
  }

  async invoiceNewPositionControls() {
    return Promise.all([
      this.invoiceControl('new position description'),
      this.invoiceControl('new position amount'),
      this.invoiceControl('add position'),
    ])
  }

  async invoiceExistingPositionControls(index: number) {
    return Promise.all([
      this.documentBox(this.invoicePositionControl(index, 'amount')),
      this.documentBox(this.invoicePositionControl(index + 1, 'description')),
      this.invoiceControl('add position'),
    ])
  }

  async invoiceErrorGrowth(message: string) {
    return this.errorGrowth(message)
  }

  async invoiceDatePickerAppearance() {
    const date = this.page.getByRole('button', { name: /^Datum/ })
    const number = this.page.getByLabel('Rechnungsnummer')
    const properties = [
      'background-color',
      'border-color',
      'border-radius',
      'border-width',
      'height',
      'padding-left',
      'padding-right',
      'padding-top',
      'padding-bottom',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'text-align',
      'box-shadow',
    ]
    const read = (locator: Locator) =>
      locator.evaluate((element, styleProperties) => {
        const style = getComputedStyle(element)
        return Object.fromEntries(
          styleProperties.map((property) => [
            property,
            style.getPropertyValue(property),
          ]),
        )
      }, properties)
    return { date: await read(date), number: await read(number) }
  }

  async invoiceDatePickerAndNumberShareRow() {
    const date = this.page.getByRole('button', { name: /^Datum/ })
    return (
      (await this.documentBox(date)).y ===
      (await this.invoiceControl('number')).y
    )
  }

  private async profileControlBox(label: string) {
    const locator =
      label === 'save'
        ? this.page.getByRole('button', { name: 'Profil speichern' })
        : this.page.getByRole('textbox', { name: label, exact: true })
    return this.documentBox(locator)
  }

  private invoicePositionControl(
    index: number,
    field: 'description' | 'amount',
  ) {
    const label =
      field === 'description'
        ? `Beschreibung Position ${index}`
        : `Brutto in Euro Position ${index}`
    return this.page.getByRole('textbox', { name: label, exact: true })
  }

  private async errorGrowth(message: string) {
    const error = this.page.getByText(message, { exact: true })
    await expect(error).toBeVisible()
    const { height } = await this.documentBox(error)
    expect(height).toBeGreaterThanOrEqual(20)
    return height - 20
  }

  private async documentBox(locator: Locator): Promise<LayoutBox> {
    return locator.evaluate((element) => {
      const box = element.getBoundingClientRect()
      let x = box.x + window.scrollX
      let y = box.y + window.scrollY
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (parent === document.scrollingElement) continue
        x += parent.scrollLeft
        y += parent.scrollTop
      }
      return { x, y, width: box.width, height: box.height }
    })
  }
}
