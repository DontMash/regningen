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

  async navigationDrawer() {
    const menu = this.page.getByRole('dialog', {
      name: 'Navigation',
      exact: true,
    })
    const box = async (locator: Locator) => {
      const bounds = await locator.boundingBox()
      if (!bounds) throw new Error('Navigation controls must be visible.')
      return bounds
    }
    // Wait for the opening transform rather than measuring a mid-animation panel.
    await expect(menu).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    return {
      surface: await box(menu),
      close: await box(menu.getByRole('button', { name: 'Menü schließen' })),
      invoice: await box(
        menu.getByRole('link', { name: 'Rechnung', exact: true }),
      ),
      settings: await box(
        menu.getByRole('link', { name: 'Einstellungen', exact: true }),
      ),
      theme: await box(
        menu.getByRole('button', { name: 'Darstellung umschalten' }),
      ),
      overflows: await menu
        .locator('[data-slot="drawer-content"]')
        .evaluate(
          (element) =>
            element.scrollWidth > element.clientWidth ||
            document.documentElement.scrollWidth > window.innerWidth,
        ),
    }
  }

  async navigationBusinessName(name: string, compact: boolean) {
    const surface = compact
      ? this.page.getByRole('dialog', { name: 'Navigation', exact: true })
      : this.page.getByRole('navigation', { name: 'Hauptnavigation' })
    return surface.getByText(name, { exact: true }).evaluate((element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        lineHeight: Number.parseFloat(style.lineHeight),
        wraps: style.whiteSpace !== 'nowrap',
        truncated:
          element.scrollWidth > element.clientWidth &&
          style.textOverflow === 'ellipsis',
      }
    })
  }

  async pageScrollPosition() {
    return this.page.evaluate(() => window.scrollY)
  }

  async mainContentHeight() {
    const box = await this.page.getByRole('main').boundingBox()
    if (!box) throw new Error('The main content is not visible.')
    return box.height
  }

  async settingsArrangement() {
    const [aside, content] = await Promise.all([
      this.page.getByRole('complementary').boundingBox(),
      this.page
        .getByRole('heading', { name: 'Allgemein', exact: true })
        .boundingBox(),
    ])
    if (!aside || !content)
      throw new Error('Settings navigation and content must be visible.')
    return {
      aside,
      content,
      overflows: await this.page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    }
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

  async releaseNotesScrollLayout() {
    const dialog = this.page.getByRole('dialog', {
      name: 'Versionshinweise',
      exact: true,
    })
    const scrollArea = dialog.locator('.overflow-y-auto').first()
    const [version, selector, footer, firstHeading, viewport] =
      await Promise.all([
        dialog.getByText(/^Version 1\.0\.0/).boundingBox(),
        dialog
          .getByRole('combobox', { name: 'Version auswählen' })
          .boundingBox(),
        dialog
          .getByRole('button', { name: 'Verstanden' })
          .locator('..')
          .boundingBox(),
        dialog.locator('article h3').first().boundingBox(),
        scrollArea.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            top: box.top,
            bottom: box.bottom,
            scrollTop: element.scrollTop,
            paddingTop: Number.parseFloat(style.paddingTop),
            paddingBottom: Number.parseFloat(style.paddingBottom),
          }
        }),
      ])
    if (!version || !selector || !footer || !firstHeading) {
      throw new Error('Release-note controls and content must be rendered.')
    }
    return { version, selector, footer, firstHeading, viewport }
  }

  async releaseNotesHeaderSeamBrightPixels() {
    const box = await this.page
      .getByRole('dialog', { name: 'Versionshinweise', exact: true })
      .locator('[data-slot="adaptive-dialog-scroll-area"]')
      .boundingBox()
    if (!box) throw new Error('The release-note scroll area must be visible.')
    const screenshot = await this.page.screenshot({
      clip: { x: box.x + 24, y: box.y, width: box.width - 48, height: 2 },
    })
    return this.page.evaluate(async (base64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, image.width, image.height).data
      let brightPixels = 0
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (
          Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 128
        )
          brightPixels++
      }
      return brightPixels
    }, screenshot.toString('base64'))
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
