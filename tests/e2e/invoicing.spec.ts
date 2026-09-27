import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

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
  await page.getByLabel('Unternehmensname').fill('Lokaler Betrieb')

  await expect(
    page.getByText('Profil konnte nicht gespeichert werden'),
  ).toBeVisible()
  await expect(page.getByText(/Rechnungen sind gesperrt/)).toBeVisible()
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
  await page.getByLabel('Unternehmensname').fill('Nicht gespeicherter Name')
  await expect(
    page.getByText('Profil konnte nicht gespeichert werden'),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Rechnung', exact: true }).click()

  await expect(
    page.getByText('Profil konnte nicht gespeichert werden'),
  ).toBeVisible()
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
    page.getByRole('heading', { name: 'Unternehmensprofil einrichten' }),
  ).toBeVisible()

  await page.getByLabel('Unternehmensname').fill('Nordlicht Catering')
  await page.getByLabel('Inhaber/in').fill('Erika Beispiel')
  await page.getByLabel('Straße und Hausnummer').fill('Hauptstraße 12')
  await page.getByLabel('Postleitzahl').fill('20095')
  await page.getByRole('textbox', { name: /^Ort/ }).fill('Hamburg')
  await page.getByLabel('IBAN').fill('DE89 3704 0044 0532 0130 00')
  await page.getByLabel('USt-IdNr.').fill('DE123456789')
  await page
    .getByRole('button', { name: 'Profil speichern und Rechnung erstellen' })
    .click()

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

  await page.getByLabel('Rechnungsnummer').fill('2026-001')
  await page.getByLabel('Datum').fill('2026-04-01')
  await page.getByLabel('Unternehmen des Empfängers').fill('Muster GmbH')
  await page.getByLabel('Straße und Hausnummer').fill('Musterstraße 1')
  await page.getByRole('textbox', { name: /^PLZ/ }).fill('20095')
  await page.getByRole('textbox', { name: /^Ort/ }).fill('Hamburg')
  await page.getByLabel('Beschreibung Position 1').fill('Catering')
  await page.getByLabel('Brutto in Euro Position 1').fill('107,00')

  await expect(page.getByText('107,00 €')).toBeVisible()
  await expect(page.getByText('100,00 €')).toBeVisible()
  await page.getByRole('button', { name: '19 %' }).click()
  await expect(page.getByText('89,92 €')).toBeVisible()
  await expect(page.getByText('17,08 €')).toBeVisible()
  await page.getByRole('button', { name: '7 %' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF erstellen' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('Rechnung_2026-001_2026-04-01.pdf')
})

test('caps invoices at 16 line items and confirms starting a new invoice', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  const addItem = page.getByRole('button', { name: '+ Position hinzufügen' })

  for (let index = 1; index < 16; index++) {
    await addItem.click()
  }
  await expect(page.getByLabel('Beschreibung Position 16')).toBeVisible()
  await expect(addItem).toBeDisabled()

  await page.getByLabel('Rechnungsnummer').fill('2026-001')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Neue Rechnung' }).click()

  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('')
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveValue('')
  await expect(page.getByLabel('Beschreibung Position 2')).toHaveCount(0)
  await expect(page.getByLabel('Datum')).not.toHaveValue('')
})

test('updates invoice details from another tab without discarding its entries', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('tab-2026-001')
  await page.getByLabel('Beschreibung Position 1').fill('Catering')

  const profileTab = await page.context().newPage()
  await profileTab.goto('/business-profile')
  await profileTab.getByLabel('Unternehmensname').fill('Nordlicht Partyservice')

  await expect(
    page.getByText('Nordlicht Partyservice · Rechnung'),
  ).toBeVisible()
  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('tab-2026-001')
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveValue(
    'Catering',
  )
})

test('exports and restores an unencrypted local profile backup', async ({
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

  await page.getByLabel('Unternehmensname').fill('Geänderter Name')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Sicherung importieren').setInputFiles({
    name: 'business-profile.json',
    mimeType: 'application/json',
    buffer: backup,
  })

  await expect(page.getByLabel('Unternehmensname')).toHaveValue(
    'Nordlicht Catering',
  )
})

test('keeps invoice entries while the profile is deleted and set up again', async ({
  page,
}) => {
  await installCompleteBusinessProfile(page)
  await page.goto('/invoice')
  await page.getByLabel('Rechnungsnummer').fill('preserved-001')
  await page.getByLabel('Beschreibung Position 1').fill('Catering')

  await page
    .getByRole('link', { name: 'Unternehmensprofil', exact: true })
    .click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Profil löschen' }).click()
  await expect(page.getByText(/Profil gelöscht/)).toBeVisible()

  await page.getByRole('link', { name: 'Rechnung', exact: true }).click()
  await expect(page.getByLabel('Rechnungsnummer')).toHaveValue('preserved-001')
  await expect(page.getByLabel('Beschreibung Position 1')).toHaveValue(
    'Catering',
  )
  await expect(
    page.getByRole('button', { name: 'PDF erstellen' }),
  ).toBeDisabled()

  await page
    .getByRole('link', { name: 'Unternehmensprofil', exact: true })
    .click()
  await page.getByLabel('Unternehmensname').fill('Neu eingerichteter Betrieb')
  await page.getByLabel('Inhaber/in').fill('Erika Beispiel')
  await page.getByLabel('Straße und Hausnummer').fill('Hauptstraße 12')
  await page.getByLabel('Postleitzahl').fill('20095')
  await page.getByRole('textbox', { name: /^Ort/ }).fill('Hamburg')
  await page.getByLabel('IBAN').fill('DE89 3704 0044 0532 0130 00')
  await page.getByLabel('USt-IdNr.').fill('DE123456789')
  await page
    .getByRole('button', { name: 'Profil speichern und Rechnung erstellen' })
    .click()

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
    .getByLabel('Unternehmensname')
    .fill('Aktualisierte Firma')

  await expect(
    page.getByText('Profil in einem anderen Tab geändert', { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Unternehmensname')).toBeDisabled()
})
