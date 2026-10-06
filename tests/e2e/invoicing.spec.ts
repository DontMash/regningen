import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const standardFontDataUrl = `${resolve('node_modules/pdfjs-dist/standard_fonts')}/`

async function addInvoicePosition(
  page: Page,
  description: string,
  amount: string,
) {
  await page
    .getByRole('textbox', { name: 'Beschreibung', exact: true })
    .fill(description)
  await page
    .getByRole('textbox', { name: 'Brutto in Euro', exact: true })
    .fill(amount)
  await page
    .getByRole('button', { name: 'Position hinzufügen', exact: true })
    .click()
}

async function installCompleteBusinessProfile(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('regningen.business-profile')) return
    localStorage.setItem(
      'regningen.business-profile',
      JSON.stringify({
        format: 'regningen-business-profile',
        version: 1,
        profile: {
          businessName: 'Nordlicht Catering',
          serviceDescription: 'Party-Service',
          ownerName: 'Erika Beispiel',
          street: 'Hauptstraße 12',
          postalCode: '20095',
          town: 'Hamburg',
          phone: '040 123456',
          mobile: '',
          iban: 'DE89370400440532013000',
          vatId: 'DE123456789',
          taxNumber: '',
        },
      }),
    )
  })
}

async function documentBox(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    let x = box.x + window.scrollX
    let y = box.y + window.scrollY
    // Compare layout, not scrolling caused by focusing off-screen table inputs.
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

for (const width of [320, 768, 1024, 1440]) {
  test(`keeps form controls and position rows stable while errors change at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await installCompleteBusinessProfile(page)
    await page.goto('/invoice')
    await expect(
      page.getByRole('heading', { name: 'Rechnung erstellen' }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const subject = page.getByRole('textbox', { name: 'Betreff', exact: true })
    const subjectBox = await documentBox(subject)
    await page.getByLabel('Rechnungsnummer').focus()
    await page.getByLabel('Rechnungsnummer').blur()
    await expect(page.getByText('Rechnungsnummer fehlt.')).toBeVisible()
    expect(await documentBox(subject)).toEqual(subjectBox)
    await page.getByLabel('Rechnungsnummer').fill('layout-001')
    expect(await documentBox(subject)).toEqual(subjectBox)

    const street = page.getByRole('textbox', {
      name: 'Straße und Hausnummer',
      exact: true,
    })
    const streetBox = await documentBox(street)
    await page.getByLabel('Name / z. Hd.').focus()
    await page.getByLabel('Name / z. Hd.').blur()
    await expect(
      page.getByText('Unternehmen oder Name des Empfängers angeben.'),
    ).toBeVisible()
    expect(await documentBox(street)).toEqual(streetBox)
    await page.getByLabel('Name / z. Hd.').fill('Max Mustermann')
    expect(await documentBox(street)).toEqual(streetBox)

    const description = page.getByRole('textbox', {
      name: 'Beschreibung',
      exact: true,
    })
    const amount = page.getByRole('textbox', {
      name: 'Brutto in Euro',
      exact: true,
    })
    const addButton = page.getByRole('button', {
      name: 'Position hinzufügen',
      exact: true,
    })
    const before = await Promise.all(
      [description, amount, addButton].map(documentBox),
    )
    await addButton.click()
    await expect(
      page.getByText('Einen positiven Bruttopreis eingeben.'),
    ).toBeVisible()
    expect(
      await Promise.all([description, amount, addButton].map(documentBox)),
    ).toEqual(before)
    if (width >= 768) {
      expect(before[0].y).toBe(before[1].y)
      expect(before[1].y).toBe(before[2].y)
    }
    await addInvoicePosition(page, 'Catering', '107,00')
    await addInvoicePosition(page, 'Reinigung', '50,00')
    const firstAmount = page.getByRole('textbox', {
      name: 'Brutto in Euro Position 1',
    })
    const secondDescription = page.getByRole('textbox', {
      name: 'Beschreibung Position 2',
    })
    const rowBefore = await Promise.all(
      [firstAmount, secondDescription, addButton].map(documentBox),
    )
    await firstAmount.fill('invalid')
    await firstAmount.blur()
    await expect(
      page.getByText('Einen positiven Bruttopreis eingeben.'),
    ).toBeVisible()
    expect(
      await Promise.all(
        [firstAmount, secondDescription, addButton].map(documentBox),
      ),
    ).toEqual(rowBefore)
    await firstAmount.fill('107,00')
    expect(
      await Promise.all(
        [firstAmount, secondDescription, addButton].map(documentBox),
      ),
    ).toEqual(rowBefore)

    await page.goto('/business-profile')
    await expect(
      page.getByRole('heading', { name: 'Unternehmensprofil', exact: true }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const owner = page.getByRole('textbox', { name: 'Inhaber/in' })
    const saveButton = page.getByRole('button', { name: 'Profil speichern' })
    const profileBefore = await Promise.all(
      [owner, saveButton].map(documentBox),
    )
    await owner.fill('')
    await owner.blur()
    await expect(
      page.getByText('Name der Inhaberin oder des Inhabers fehlt.'),
    ).toBeVisible()
    expect(await Promise.all([owner, saveButton].map(documentBox))).toEqual(
      profileBefore,
    )
    await owner.fill('Erika Beispiel')
    expect(await Promise.all([owner, saveButton].map(documentBox))).toEqual(
      profileBefore,
    )
    const taxNumber = page.getByRole('textbox', { name: 'Steuernummer' })
    const taxBefore = await Promise.all(
      [taxNumber, saveButton].map(documentBox),
    )
    await page.getByRole('textbox', { name: 'USt-IdNr.' }).fill('DE123')
    await expect(
      page.getByText(
        'Eine deutsche Umsatzsteuer-ID beginnt mit DE und hat neun Ziffern.',
      ),
    ).toBeVisible()
    expect(await Promise.all([taxNumber, saveButton].map(documentBox))).toEqual(
      taxBefore,
    )
    await page.getByRole('textbox', { name: 'USt-IdNr.' }).fill('')
    await expect(
      page.getByText('Umsatzsteuer-ID oder Steuernummer angeben.'),
    ).toBeVisible()
    expect(await Promise.all([taxNumber, saveButton].map(documentBox))).toEqual(
      taxBefore,
    )
    await taxNumber.fill('12/345/67890')
    expect(await Promise.all([taxNumber, saveButton].map(documentBox))).toEqual(
      taxBefore,
    )
  })
}

for (const width of [375, 1024]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`styles the date picker like an input in ${theme} mode at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme })
      await installCompleteBusinessProfile(page)
      await page.goto('/invoice')
      const number = page.getByRole('textbox', {
        name: 'Rechnungsnummer',
        exact: true,
      })
      const date = page.getByRole('button', { name: /^Datum/ })
      await expect(number).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const appearance = (locator: Locator) =>
        locator.evaluate((element) => {
          const style = getComputedStyle(element)
          return Object.fromEntries(
            [
              'backgroundColor',
              'borderColor',
              'borderRadius',
              'borderWidth',
              'height',
              'paddingLeft',
              'paddingRight',
              'paddingTop',
              'paddingBottom',
              'fontFamily',
              'fontSize',
              'fontWeight',
              'lineHeight',
              'textAlign',
              'boxShadow',
            ].map((property) => [
              property,
              style[property as keyof CSSStyleDeclaration],
            ]),
          )
        })
      expect(await appearance(date)).toEqual(await appearance(number))
      if (width >= 768)
        expect((await documentBox(date)).y).toBe((await documentBox(number)).y)
      await date.click()
      const calendar = page.getByRole('grid')
      await expect(calendar).toBeVisible()
      await expect(
        calendar.getByRole('button', { name: /\d/ }).first(),
      ).toBeVisible()
    })
  }
}

test('submits new positions with Enter without downloading or validating the invoice form', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('keyboard-001')
  await page.getByLabel('Name / z. Hd.').fill('Max Mustermann')
  await page.getByLabel('Straße und Hausnummer').fill('Musterstraße 1')
  await page.getByRole('textbox', { name: 'PLZ', exact: true }).fill('20095')
  await page.getByRole('textbox', { name: 'Ort', exact: true }).fill('Hamburg')
  await addInvoicePosition(page, 'Catering', '107,00')
  const pdfButton = page.getByRole('button', { name: 'PDF erstellen' })
  await expect(pdfButton).toBeEnabled()
  const downloads: string[] = []
  page.on('download', (download) =>
    downloads.push(download.suggestedFilename()),
  )
  const description = page.getByRole('textbox', {
    name: 'Beschreibung',
    exact: true,
  })
  const amount = page.getByRole('textbox', {
    name: 'Brutto in Euro',
    exact: true,
  })

  await amount.fill('invalid')
  await amount.blur()
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toHaveCount(0)
  await amount.press('Enter')
  await expect(page.getByText('Positionsbeschreibung fehlt.')).toBeVisible()
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toBeVisible()
  await expect(pdfButton).toBeEnabled()
  await description.fill('Reinigung')
  await amount.fill('50,00')
  await amount.press('Enter')
  await expect(page.getByLabel('Beschreibung Position 2')).toHaveValue(
    'Reinigung',
  )
  await expect(description).toHaveValue('')
  await expect(amount).toHaveValue('')
  await description.fill('Service')
  await amount.fill('25,00')
  await description.press('Enter')
  await expect(page.getByLabel('Beschreibung Position 3')).toHaveValue(
    'Service',
  )
  await expect(page.getByText('Positionsbeschreibung fehlt.')).toHaveCount(0)
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toHaveCount(0)
  expect(downloads).toEqual([])

  await amount.fill('invalid')
  const downloadPromise = page.waitForEvent('download')
  await pdfButton.click()
  await downloadPromise
  expect(downloads).toHaveLength(1)
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toHaveCount(0)
})

test('shows an error instead of claiming the profile was saved when storage fails', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'regningen.business-profile') {
        throw new Error('storage unavailable')
      }
      return originalSetItem.call(this, key, value)
    }
  })
  await page.goto('/')
  await page
    .getByRole('textbox', { name: 'Unternehmensname' })
    .fill('Lokaler Betrieb')

  await expect(
    page.getByRole('alertdialog', {
      name: 'Profil konnte nicht gespeichert werden',
    }),
  ).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Schließen' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Profil speichern' }),
  ).toBeDisabled()
})

test('stops at an error screen when browser storage cannot load the profile', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      if (key === 'regningen.business-profile')
        throw new Error('storage unavailable')
      return originalGetItem.call(this, key)
    }
  })
  await page.goto('/')

  await expect(
    page.getByRole('alertdialog', { name: 'Rechnungen sind gesperrt' }),
  ).toBeVisible()
  await expect(
    page.getByText(/nicht aus diesem Browser geladen werden/),
  ).toBeVisible()
})

test('keeps invoicing blocked after an existing profile fails to save', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'regningen.business-profile',
      JSON.stringify({
        format: 'regningen-business-profile',
        version: 1,
        profile: {
          businessName: 'Nordlicht Catering',
          serviceDescription: 'Party-Service',
          ownerName: 'Erika Beispiel',
          street: 'Hauptstraße 12',
          postalCode: '20095',
          town: 'Hamburg',
          phone: '040 123456',
          mobile: '',
          iban: 'DE89370400440532013000',
          vatId: 'DE123456789',
          taxNumber: '',
        },
      }),
    )
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'regningen.business-profile') {
        throw new Error('storage unavailable')
      }
      return originalSetItem.call(this, key, value)
    }
  })
  await page.goto('/business-profile')
  await page
    .getByRole('textbox', { name: 'Unternehmensname' })
    .fill('Nicht gespeicherter Name')
  await expect(
    page.getByRole('alertdialog', {
      name: 'Profil konnte nicht gespeichert werden',
    }),
  ).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Schließen' })
    .click()
  await page.getByRole('link', { name: 'Rechnung', exact: true }).click()

  await expect(
    page.getByRole('alertdialog', {
      name: 'Profil konnte nicht gespeichert werden',
    }),
  ).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Schließen' })
    .click()
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeDisabled()
})

test('sets up a local business profile before opening invoices', async ({
  page,
}) => {
  const observedRequests: Array<{
    url: string
    method: string
    body: string | null
  }> = []
  page.on('request', (request) => {
    observedRequests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    })
  })

  await page.goto('/')
  await expect(page).toHaveURL(/\/business-profile$/)
  await expect(
    page.getByRole('heading', { name: 'Unternehmensprofil', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Profil speichern' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Hinweis zu IBAN' }).click()
  await expect(
    page.getByText('Die IBAN muss gültig sein. Leerzeichen sind erlaubt.'),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await page
    .getByRole('textbox', { name: 'Unternehmensname' })
    .fill('Nordlicht Catering')
  await page.getByRole('textbox', { name: 'Inhaber/in' }).fill('Erika Beispiel')
  await page
    .getByRole('textbox', { name: 'Straße und Hausnummer' })
    .fill('Hauptstraße 12')
  await page.getByRole('textbox', { name: 'Postleitzahl' }).fill('20095')
  await page.getByRole('textbox', { name: 'Ort' }).fill('Hamburg')
  await page.getByRole('textbox', { name: 'IBAN' }).fill('ungültig')
  await page.getByRole('textbox', { name: 'IBAN' }).blur()
  await expect(
    page.getByText('Bitte eine gültige IBAN eingeben.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Profil speichern' }),
  ).toBeDisabled()
  await page
    .getByRole('textbox', { name: 'IBAN' })
    .fill('DE89 3704 0044 0532 0130 00')
  await page.getByRole('textbox', { name: 'USt-IdNr.' }).fill('DE123456789')
  await expect(page.getByText('Bitte eine gültige IBAN eingeben.')).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Profil speichern' }).click()

  await expect(page).toHaveURL(/\/invoice$/)
  await expect(
    page.getByRole('heading', { name: 'Rechnung erstellen' }),
  ).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/invoice$/)
  await expect(page.getByText('Nordlicht Catering')).toBeVisible()
  await page.getByLabel('Rechnungsnummer').fill('privacy-001')
  await page.getByLabel('Name / z. Hd.').fill('Private Recipient')
  await page.getByLabel('Straße und Hausnummer').fill('Private Street 99')
  await page.getByRole('textbox', { name: /^PLZ/ }).fill('99999')
  await page.getByRole('textbox', { name: /^Ort/ }).fill('Private Town')
  await addInvoicePosition(page, 'Private invoice detail', '10,00')

  expect(
    observedRequests.every(
      ({ method, body }) => method === 'GET' && body === null,
    ),
  ).toBe(true)
  const requestData = observedRequests
    .map(({ url, body }) => `${decodeURIComponent(url)} ${body ?? ''}`)
    .join('\n')
  for (const privateValue of [
    'Nordlicht Catering',
    'Erika Beispiel',
    'Hauptstraße 12',
    '20095',
    'Hamburg',
    'DE89370400440532013000',
    'DE123456789',
    'Private Recipient',
    'Private Street 99',
    'Private invoice detail',
  ]) {
    expect(requestData).not.toContain(privateValue)
  }
})

test('creates and downloads a one-page invoice PDF in the browser', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeDisabled()

  await page.getByLabel('Rechnungsnummer').fill('2026-001')
  const dateButton = page.getByRole('button', { name: 'Datum' })
  const originalDate = await dateButton.textContent()
  expect(originalDate).toMatch(/\d{2}\.\d{2}\.\d{4}/)
  await dateButton.click()
  const calendarDays = page.locator('[data-slot="calendar"] button[data-day]')
  await expect(calendarDays.first()).toBeVisible()
  await calendarDays.nth(1).click()
  await expect(dateButton).not.toHaveText(originalDate!)
  const invoiceDate = await dateButton.innerText()
  await page.getByLabel('Name / z. Hd.').fill('Max Mustermann')
  await page.getByLabel('Betreff').fill('Service am Hafengeburtstag')
  await page.getByLabel('Straße und Hausnummer').fill('Musterstraße 1')
  await page.getByRole('textbox', { name: /^PLZ/ }).fill('20095')
  await page.getByRole('textbox', { name: /^Ort/ }).fill('Hamburg')
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeDisabled()
  await addInvoicePosition(page, 'Catering', '107,00')
  await page.getByRole('textbox', { name: 'Beschreibung Position 1' }).click()
  await page
    .getByRole('textbox', { name: 'Beschreibung Position 1' })
    .press('End')
  await page
    .getByRole('textbox', { name: 'Beschreibung Position 1' })
    .pressSequentially(' & Service')
  await expect(
    page.getByRole('textbox', { name: 'Beschreibung Position 1' }),
  ).toHaveValue('Catering & Service')
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeEnabled()

  await expect(page.getByText('107,00 €')).toBeVisible()
  await expect(page.getByText('100,00 €')).toBeVisible()
  await page.getByRole('button', { name: '19 %' }).click()
  await expect(page.getByText('89,92 €')).toBeVisible()
  await expect(page.getByText('17,08 €')).toBeVisible()
  await page.getByRole('button', { name: '7 %' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF erstellen' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(
    /^Rechnung_2026-001_\d{4}-\d{2}-\d{2}\.pdf$/,
  )
  const path = await download.path()
  expect(path).not.toBeNull()
  const pdfLoadingTask = getDocument({
    data: new Uint8Array(await readFile(path)),
    standardFontDataUrl,
  })
  const pdf = await pdfLoadingTask.promise
  try {
    expect(pdf.numPages).toBe(1)
    const pageText = await pdf.getPage(1).then(async (documentPage) => {
      const content = await documentPage.getTextContent()
      return content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
    })
    for (const expectedText of [
      'Nordlicht Catering',
      'Erika Beispiel',
      'Max Mustermann',
      'Musterstraße 1',
      invoiceDate,
      'Service am Hafengeburtstag',
      'Catering & Service',
      '107,00 €',
      '100,00 €',
      '7,00 €',
      'DE89370400440532013000',
      'DE123456789',
    ]) {
      expect(pageText).toContain(expectedText)
    }
  } finally {
    await pdfLoadingTask.destroy()
  }
  await expect(
    page.getByRole('heading', { name: 'PDF wurde erstellt' }),
  ).toBeVisible()
})

test('caps invoices at 16 line items and confirms starting a new invoice', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  const addItem = page.getByRole('button', {
    name: 'Position hinzufügen',
    exact: true,
  })

  for (let index = 1; index <= 16; index++) {
    await addInvoicePosition(page, `Position ${index}`, '10,00')
  }
  await expect(page.getByLabel('Beschreibung Position 16')).toBeVisible()
  await expect(addItem).toBeDisabled()

  await page
    .getByRole('textbox', { name: 'Brutto in Euro Position 3' })
    .fill('abc')
  await page.getByRole('textbox', { name: 'Brutto in Euro Position 3' }).blur()
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Position 1 entfernen' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Brutto in Euro Position 2' }),
  ).toHaveValue('abc')
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toBeVisible()

  await page.getByLabel('Rechnungsnummer').fill('2026-001')
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Neue Rechnung beginnen?' }),
  ).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Abbrechen' })
    .click()
  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('2026-001')
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Neue Rechnung beginnen' })
    .click()

  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('')
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveCount(0)
  await expect(
    page.getByRole('table', { name: 'Rechnungspositionen' }),
  ).toContainText('Noch keine Positionen')
  await expect(page.getByRole('button', { name: 'Datum' })).toContainText(
    /\d{2}\.\d{2}\.\d{4}/,
  )

  await page
    .getByRole('textbox', { name: 'Beschreibung', exact: true })
    .fill('Unfertig')
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Neue Rechnung beginnen?' }),
  ).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Neue Rechnung beginnen' })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Beschreibung', exact: true }),
  ).toHaveValue('')
})

test('updates invoice details from another tab without discarding its entries', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('tab-2026-001')
  await page.getByLabel('Name / z. Hd.').fill('Max Mustermann')
  await page.getByLabel('Straße und Hausnummer').fill('Musterstraße 1')
  await page.getByRole('textbox', { name: /^PLZ/ }).fill('20095')
  await page.getByRole('textbox', { name: /^Ort/ }).fill('Hamburg')
  await addInvoicePosition(page, 'Catering', '107,00')

  const profileTab = await page.context().newPage()
  await profileTab.goto('/business-profile')
  await profileTab
    .getByRole('textbox', { name: 'Unternehmensname' })
    .fill('Nordlicht Partyservice')

  await expect(page.getByText('Nordlicht Partyservice')).toBeVisible()
  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('tab-2026-001')
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveValue(
    'Catering',
  )
  await page
    .getByRole('alertdialog', {
      name: 'Unternehmensprofil wird aktualisiert',
    })
    .getByRole('button', { name: 'Schließen' })
    .click()
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF erstellen' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const pdfLoadingTask = getDocument({
    data: new Uint8Array(await readFile(path)),
    standardFontDataUrl,
  })
  const pdf = await pdfLoadingTask.promise
  try {
    const documentPage = await pdf.getPage(1)
    const content = await documentPage.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    expect(pageText).toContain('Nordlicht Partyservice')
    expect(pageText).toContain('tab-2026-001')
    expect(pageText).toContain('Catering')
  } finally {
    await pdfLoadingTask.destroy()
  }
})

test('rejects invalid backups without locking the profile and restores a valid backup', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/business-profile')
  await expect(page.getByText(/unverschlüsselte JSON-Dateien/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sicherung exportieren' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('regningen-unternehmensprofil.json')
  const backupPath = await download.path()
  expect(backupPath).not.toBeNull()
  const backup = await readFile(backupPath)

  await page
    .getByRole('textbox', { name: 'Unternehmensname' })
    .fill('Geänderter Name')
  await page.getByLabel('Sicherung importieren').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('kein JSON'),
  })
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Profil ersetzen' })
    .click()
  await expect(
    page.getByText('Die Profilsicherung enthält kein gültiges JSON.'),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toHaveValue('Geänderter Name')

  await page.getByLabel('Sicherung importieren').setInputFiles({
    name: 'business-profile.json',
    mimeType: 'application/json',
    buffer: backup,
  })
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Profil ersetzen' })
    .click()

  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toHaveValue('Nordlicht Catering')
})

test('exports an imported partial profile without unlocking invoicing', async ({
  page,
}) => {
  await page.goto('/business-profile')
  await expect(
    page.getByRole('heading', { name: 'Unternehmensprofil' }),
  ).toBeVisible()

  const partialProfile = {
    businessName: 'Teilprofil Betrieb',
    serviceDescription: '',
    ownerName: '',
    street: '',
    postalCode: '',
    town: '',
    phone: '',
    mobile: '',
    iban: '',
    vatId: '',
    taxNumber: '',
  }
  const backup = JSON.stringify({
    format: 'regningen-business-profile',
    version: 1,
    profile: partialProfile,
  })
  await page.getByLabel('Sicherung importieren').setInputFiles({
    name: 'partial-profile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  })
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toHaveValue('Teilprofil Betrieb')
  await expect(
    page.getByRole('button', { name: 'Profil speichern' }),
  ).toBeDisabled()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sicherung exportieren' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const exported = JSON.parse(await readFile(path, 'utf8'))
  expect(exported.profile).toEqual(partialProfile)

  await page.getByRole('link', { name: 'Rechnung', exact: true }).click()
  await expect(page).toHaveURL(/\/invoice$/)
  await expect(
    page.getByRole('heading', { name: 'Unternehmensprofil vervollständigen' }),
  ).toBeVisible()
})

test('discards invoice form values when the page reloads', async ({ page }) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('not-persisted')
  await addInvoicePosition(page, 'Unfertige Position', '10,00')

  await page.reload()

  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('')
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveCount(0)
  await expect(
    page.getByRole('table', { name: 'Rechnungspositionen' }),
  ).toContainText('Noch keine Positionen')
})

test('shows validation feedback for a missing recipient and an invalid line amount', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('invalid-001')
  await page.getByLabel('Unternehmen des Empfängers').focus()
  await page.getByLabel('Unternehmen des Empfängers').blur()
  await expect(
    page.getByText('Unternehmen oder Name des Empfängers angeben.'),
  ).toBeVisible()

  await page.getByLabel('Name / z. Hd.').fill('Max Mustermann')
  await page.getByLabel('Straße und Hausnummer').fill('Musterstraße 1')
  await page.getByRole('textbox', { name: /^PLZ/ }).fill('20095')
  await page.getByRole('textbox', { name: /^Ort/ }).fill('Hamburg')
  await page
    .getByRole('textbox', { name: 'Beschreibung', exact: true })
    .fill('Catering')
  await page
    .getByRole('textbox', { name: 'Brutto in Euro', exact: true })
    .fill('abc')
  await page
    .getByRole('textbox', { name: 'Brutto in Euro', exact: true })
    .blur()
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Position hinzufügen', exact: true })
    .click()
  await expect(
    page.getByText('Einen positiven Bruttopreis eingeben.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeDisabled()
})

test('keeps invoice entries while the profile is deleted and set up again', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('preserved-001')
  await addInvoicePosition(page, 'Catering', '107,00')

  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Profil löschen' })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Abbrechen' })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toHaveValue('Nordlicht Catering')
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Profil löschen' })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Profil löschen' })
    .click()
  await expect(page.getByText(/Profil gelöscht/)).toBeVisible()

  await page.getByRole('link', { name: 'Rechnung', exact: true }).click()
  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('preserved-001')
  await expect(
    page.getByRole('alertdialog', {
      name: 'Profil vervollständigen, um das PDF zu erstellen',
    }),
  ).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Schließen' })
    .click()
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveValue(
    'Catering',
  )
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeDisabled()

  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Unternehmensname' })
    .fill('Neu eingerichteter Betrieb')
  await page.getByRole('textbox', { name: 'Inhaber/in' }).fill('Erika Beispiel')
  await page
    .getByRole('textbox', { name: 'Straße und Hausnummer' })
    .fill('Hauptstraße 12')
  await page.getByRole('textbox', { name: 'Postleitzahl' }).fill('20095')
  await page.getByRole('textbox', { name: 'Ort' }).fill('Hamburg')
  await page
    .getByRole('textbox', { name: 'IBAN' })
    .fill('DE89 3704 0044 0532 0130 00')
  await page.getByRole('textbox', { name: 'USt-IdNr.' }).fill('DE123456789')
  await page.getByRole('button', { name: 'Profil speichern' }).click()

  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('preserved-001')
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveValue(
    'Catering',
  )
})

test('warns a profile editor when another tab changes the profile', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/business-profile')

  const otherProfileTab = await page.context().newPage()
  await otherProfileTab.goto('/business-profile')
  await otherProfileTab
    .getByRole('textbox', { name: 'Unternehmensname' })
    .fill('Aktualisierte Firma')

  await expect(
    page.getByText('Profil in einem anderen Tab geändert', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('alertdialog', {
      name: 'Profil in einem anderen Tab geändert',
    }),
  ).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Schließen' })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toBeDisabled()

  await page.reload()
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toHaveValue('Aktualisierte Firma')
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toBeEnabled()
})
