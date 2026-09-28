import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

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
  const date = await page.getByRole('button', { name: 'Datum' }).textContent()
  expect(date).toMatch(/\d{2}\.\d{2}\.\d{4}/)
  await page.getByLabel('Unternehmen des Empfängers').fill('Muster GmbH')
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

test('keeps invoice entries while the profile is deleted and set up again', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('preserved-001')
  await addInvoicePosition(page, 'Catering', '107,00')

  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Profil löschen' }).click()
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
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Schließen' })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Unternehmensname' }),
  ).toBeDisabled()
})
