// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvoicePage from './InvoicePage'
import {
  createEmptyInvoiceDraft,
  invoiceDraftStore,
} from './invoice-draft-store'
import { createBusinessProfileRepository } from './business-profile-repository'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import {
  completeBusinessProfile,
  saveBusinessProfile,
} from '../../../tests/helpers/business-profile'
import {
  disposeTestRouters,
  renderAtRoute,
} from '../../../tests/helpers/render'

async function addItem(
  user: ReturnType<typeof userEvent.setup>,
  description: string,
  amount: string,
) {
  await user.type(
    screen.getByRole('textbox', { name: /^Beschreibung$/ }),
    description,
  )
  await user.type(
    screen.getByRole('textbox', { name: /^Brutto in Euro$/ }),
    amount,
  )
  await user.click(screen.getByRole('button', { name: 'Position hinzufügen' }))
}

async function fillInvoiceAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole('textbox', { name: /^Unternehmen des Empfängers/ }),
    'Muster GmbH',
  )
  await user.type(
    screen.getByRole('textbox', { name: /^Straße und Hausnummer/ }),
    'Musterstraße 1',
  )
  await user.type(screen.getByRole('textbox', { name: /^PLZ/ }), '20095')
  await user.type(screen.getByRole('textbox', { name: /^Ort/ }), 'Hamburg')
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.localStorage.clear()
  invoiceDraftStore.setState(() => createEmptyInvoiceDraft())
  businessProfileStorageStatus.setState(() => ({ error: null }))
})

afterEach(() => {
  cleanup()
  disposeTestRouters()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('invoice editor', () => {
  it('shows profile setup before any invoice data exists', async () => {
    await renderAtRoute('/invoice', InvoicePage)

    expect(
      screen.getByText('Unternehmensprofil wird lokal geladen …'),
    ).toBeVisible()
    expect(
      await screen.findByRole('heading', {
        name: 'Unternehmensprofil vervollständigen',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Unternehmensprofil öffnen' }),
    ).toHaveAttribute('href', '/business-profile')
  })

  it('reports a local profile read failure and preserves an existing draft when the profile is missing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/invoice', InvoicePage)
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Rechnungen sind gesperrt',
      }),
    ).toBeVisible()

    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
    businessProfileStorageStatus.setState(() => ({ error: null }))
    invoiceDraftStore.setState((current) => ({
      ...current,
      number: 'draft-001',
    }))
    await renderAtRoute('/invoice', InvoicePage)
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Profil vervollständigen, um das PDF zu erstellen',
      }),
    ).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Schließen' }))

    expect(
      screen.getByRole('heading', { name: 'Rechnung erstellen' }),
    ).toBeVisible()
    expect(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
    ).toHaveValue('draft-001')
    expect(screen.getByRole('button', { name: 'PDF erstellen' })).toBeDisabled()
  })

  it('validates invoice fields, adds and edits positions, calculates VAT, and reindexes after removal', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/invoice', InvoicePage)
    await screen.findByRole('heading', { name: 'Rechnung erstellen' })

    await user.type(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
      '2026-002',
    )
    await user.click(
      screen.getByRole('textbox', { name: /^Straße und Hausnummer/ }),
    )
    await user.tab()
    await expect(
      screen.findByText('Straße und Hausnummer fehlen.'),
    ).resolves.toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: 'Name / z. Hd.' }),
      'Max Mustermann',
    )
    await user.type(
      screen.getByRole('textbox', { name: /^Straße und Hausnummer/ }),
      'Musterstraße 1',
    )
    await user.type(screen.getByRole('textbox', { name: /^PLZ/ }), '20095')
    await user.type(screen.getByRole('textbox', { name: /^Ort/ }), 'Hamburg')

    await user.click(
      screen.getByRole('button', { name: 'Position hinzufügen' }),
    )
    expect(
      await screen.findByText('Positionsbeschreibung fehlt.'),
    ).toBeVisible()
    expect(
      screen.getByText('Einen positiven Bruttopreis eingeben.'),
    ).toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: /^Beschreibung$/ }),
      'Catering',
    )
    await user.type(
      screen.getByRole('textbox', { name: /^Brutto in Euro$/ }),
      '107,00',
    )
    await user.click(
      screen.getByRole('button', { name: 'Position hinzufügen' }),
    )

    expect(
      screen.getByRole('textbox', { name: 'Beschreibung Position 1' }),
    ).toHaveValue('Catering')
    expect(screen.getByText('107,00 €')).toBeVisible()
    expect(screen.getByText('100,00 €')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '19 %' }))
    expect(screen.getByText('89,92 €')).toBeVisible()
    expect(screen.getByText('17,08 €')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '7 %' }))

    await addItem(user, 'Reinigung', '50,00')
    const secondAmount = screen.getByRole('textbox', {
      name: 'Brutto in Euro Position 2',
    })
    await user.clear(secondAmount)
    await user.type(secondAmount, '0')
    await user.tab()
    expect(
      await screen.findByText('Einen positiven Bruttopreis eingeben.'),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Position 1 entfernen' }),
    )
    expect(
      screen.getByRole('textbox', { name: 'Beschreibung Position 1' }),
    ).toHaveValue('Reinigung')
    expect(
      screen.getByRole('textbox', { name: 'Brutto in Euro Position 1' }),
    ).toHaveValue('0')
    expect(
      screen.getByText('Einen positiven Bruttopreis eingeben.'),
    ).toBeVisible()
  })

  it('selects a date from the calendar and cancels resetting invoice data', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/invoice', InvoicePage)
    await screen.findByRole('heading', { name: 'Rechnung erstellen' })
    await user.type(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
      'keep-me',
    )

    await user.click(screen.getByRole('button', { name: /^Datum/ }))
    expect(await screen.findByRole('grid')).toBeVisible()
    const dateButtons = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('data-day'))
    const anotherDate = dateButtons.find(
      (button) => button.dataset.selectedSingle !== 'true',
    )
    expect(anotherDate).toBeDefined()
    await user.click(anotherDate!)
    expect(
      screen.getByRole('button', { name: /^Datum/ }),
    ).not.toHaveTextContent(new Date().toLocaleDateString('de-DE'))

    await user.click(screen.getByRole('button', { name: /^Neue Rechnung$/ }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Neue Rechnung beginnen?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    expect(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
    ).toHaveValue('keep-me')
  })

  it('downloads a generated PDF with a sanitized filename', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    const createObjectURL = vi.fn(() => 'blob:invoice')
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    )
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    await renderAtRoute('/invoice', InvoicePage)
    await screen.findByRole('heading', { name: 'Rechnung erstellen' })

    await user.type(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
      '2026/001',
    )
    await fillInvoiceAddress(user)
    await addItem(user, 'Catering', '107,00')
    expect(screen.getByRole('button', { name: 'PDF erstellen' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'PDF erstellen' }))
    expect(await screen.findByText('PDF wurde erstellt')).toBeVisible()
    expect(anchorClick).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('reports a browser download failure without claiming PDF creation succeeded', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    const createObjectURL = vi.fn(() => {
      throw new Error('Browser-Download nicht verfügbar.')
    })
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    )
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    await renderAtRoute('/invoice', InvoicePage)
    await screen.findByRole('heading', { name: 'Rechnung erstellen' })
    await user.type(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
      '2026-001',
    )
    await fillInvoiceAddress(user)
    await addItem(user, 'Catering', '107,00')

    await user.click(screen.getByRole('button', { name: 'PDF erstellen' }))
    expect(
      await screen.findByText('PDF konnte nicht erstellt werden'),
    ).toBeVisible()
    expect(screen.getByText('Browser-Download nicht verfügbar.')).toBeVisible()
    expect(anchorClick).not.toHaveBeenCalled()
  })

  it('resets after confirmation, leaves an empty invoice untouched, and honors storage blocking', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/invoice', InvoicePage)
    await screen.findByRole('heading', { name: 'Rechnung erstellen' })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'PDF erstellen' }),
      ).toBeDisabled(),
    )

    await user.click(screen.getByRole('button', { name: /^Neue Rechnung$/ }))
    expect(
      screen.queryByRole('alertdialog', { name: 'Neue Rechnung beginnen?' }),
    ).not.toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
      'reset-me',
    )
    await user.click(screen.getByRole('button', { name: /^Neue Rechnung$/ }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Neue Rechnung beginnen?',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Neue Rechnung beginnen' }),
    )
    expect(
      screen.getByRole('textbox', { name: /^Rechnungsnummer/ }),
    ).toHaveValue('')

    businessProfileStorageStatus.setState(() => ({ error: 'Speicherfehler.' }))
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Profil konnte nicht gespeichert werden',
      }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.getByRole('button', { name: 'PDF erstellen' })).toBeDisabled()

    const savedProfile = await createBusinessProfileRepository(
      window.localStorage,
    ).loadProfile()
    expect(savedProfile).toEqual(completeBusinessProfile)
  })
})
