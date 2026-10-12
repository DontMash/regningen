// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvoicePage from './InvoicePage'
import { InvoiceRobot } from '../../../tests/robots/vitest/invoice'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import { createInvoiceScenario } from '../../../tests/scenarios/invoice'
import {
  createEmptyInvoiceDraft,
  invoiceDraftStore,
} from './invoice-draft-store'
import { createBusinessProfileRepository } from './business-profile-repository'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import { saveBusinessProfile } from '../../../tests/support/vitest/business-profile'
import {
  disposeTestRouters,
  renderAtRoute,
} from '../../../tests/support/vitest/render'

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
    const invoice = new InvoiceRobot(userEvent.setup())
    await renderAtRoute('/invoice', InvoicePage)

    invoice.expectProfileLoading()
    await invoice.expectProfileSetupPrompt()
  })

  it('reports a local profile read failure and preserves an existing draft when the profile is missing', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectBlockingNotice('Rechnungen sind gesperrt')

    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
    businessProfileStorageStatus.setState(() => ({ error: null }))
    invoiceDraftStore.setState((current) => ({
      ...current,
      number: 'draft-001',
    }))
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectBlockingNotice(
      'Profil vervollständigen, um das PDF zu erstellen',
    )
    await invoice.closeBlockingNotice()

    await invoice.expectReady()
    invoice.expectInvoiceNumber('draft-001')
    await invoice.expectPdfDisabled()
  })

  it('validates invoice fields, adds and edits positions, calculates VAT, and reindexes after removal', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const scenario = createInvoiceScenario({
      number: '2026-002',
      positions: [{ description: 'Catering', amount: '107,00' }],
      expected: {
        totals: { net: '100,00 €', tax: '7,00 €', gross: '107,00 €' },
      },
    })
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()

    await invoice.enterInvoiceNumber(scenario.input.number)
    await invoice.touchRecipient('street')
    await invoice.expectMessage('Straße und Hausnummer fehlen.')
    await invoice.enterRecipient(scenario.input.recipient)

    await invoice.submitNewPosition()
    await invoice.expectMessage('Positionsbeschreibung fehlt.')
    await invoice.expectMessage('Einen positiven Bruttopreis eingeben.')
    await invoice.addPosition(scenario.input.positions[0])

    invoice.expectPositionValues(1, { description: 'Catering' })
    invoice.expectTotals(scenario.expected.totals)
    await invoice.chooseVatRate(19)
    invoice.expectTotals({ net: '89,92 €', tax: '17,08 €' })
    await invoice.chooseVatRate(7)

    await invoice.addPosition({ description: 'Reinigung', amount: '50,00' })
    await invoice.editPosition(2, { amount: '0' })
    await invoice.blurPositionAmount(2)
    await invoice.expectMessage('Einen positiven Bruttopreis eingeben.')
    await invoice.removePosition(1)
    invoice.expectPositionValues(1, { description: 'Reinigung', amount: '0' })
    await invoice.expectMessage('Einen positiven Bruttopreis eingeben.')
  })

  it('validates new positions only on their own submission and resets feedback after adding', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const position = createInvoiceScenario().input.positions[0]
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()

    await invoice.touchNewPosition('description')
    await invoice.enterNewPosition({ amount: 'invalid' })
    await invoice.touchNewPosition('amount')
    invoice.expectMessageAbsent('Positionsbeschreibung fehlt.')
    invoice.expectMessageAbsent('Einen positiven Bruttopreis eingeben.')

    await invoice.submitNewPosition()
    await invoice.expectMessage('Positionsbeschreibung fehlt.')
    await invoice.expectMessage('Einen positiven Bruttopreis eingeben.')
    await invoice.enterNewPosition({ description: position.description })
    invoice.expectMessageAbsent('Positionsbeschreibung fehlt.')
    await invoice.enterNewPosition({ amount: position.amount })
    invoice.expectMessageAbsent('Einen positiven Bruttopreis eingeben.')
    await invoice.submitNewPositionWithEnter('amount')

    invoice.expectPositionValues(1, { description: 'Catering' })
    invoice.expectNewPositionValues({ description: '', amount: '' })
    await invoice.touchNewPosition('description')
    invoice.expectMessageAbsent('Positionsbeschreibung fehlt.')
    invoice.expectMessageAbsent('Einen positiven Bruttopreis eingeben.')
    invoice.expectMessageAbsent('PDF wurde erstellt')
  })

  it('marks recipient identity as an either/or requirement and shows feedback after touching either input', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const { recipient } = createInvoiceScenario().input
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()
    invoice.expectRecipientIdentityOptional()
    invoice.expectRecipientIdentityFeedbackAbsent()

    await invoice.touchRecipient('name')
    invoice.expectRecipientIdentityError(
      'Unternehmen oder Name des Empfängers angeben.',
    )
    await invoice.enterRecipient({ name: recipient.name })
    invoice.expectRecipientIdentityFeedbackAbsent()
    invoice.expectRecipientValid('company')
  })

  it('marks mandatory invoice and position controls without marking optional fields required', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const position = createInvoiceScenario().input.positions[0]
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()
    invoice.expectRequiredControlSemantics()

    await invoice.addPosition(position)
    invoice.expectPositionRequired(1)
  })

  it('selects the requested calendar date and preserves invoice data when reset is cancelled', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const { input } = createInvoiceScenario({ number: 'keep-me' })
    saveBusinessProfile(createBusinessProfileScenario())
    invoiceDraftStore.setState((current) => ({
      ...current,
      date: '2026-06-10',
    }))
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()
    await invoice.enterInvoiceNumber(input.number)

    await invoice.openDatePicker()
    await invoice.expectDatePickerOpen()
    await invoice.chooseVisibleCalendarDate(input.date)
    invoice.expectDateLabel('15.06.2026')

    await invoice.startNewInvoice()
    await invoice.expectNewInvoiceConfirmation()
    await invoice.cancelNewInvoice()
    invoice.expectInvoiceNumber('keep-me')
    invoice.expectDateLabel('15.06.2026')
  })

  it('initiates a PDF download with a sanitized filename and the invoice date', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const { input } = createInvoiceScenario({
      number: '2026/001',
      recipient: { company: 'Muster GmbH', name: '' },
    })
    saveBusinessProfile(createBusinessProfileScenario())
    invoiceDraftStore.setState((current) => ({
      ...current,
      date: input.date,
    }))
    const createObjectURL = vi.fn(() => 'blob:invoice')
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    )
    const downloads: Array<{ filename: string; href: string }> = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ filename: this.download, href: this.href })
    })
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()

    await invoice.enterInvoiceNumber(input.number)
    await invoice.enterRecipient(input.recipient)
    await invoice.addPosition(input.positions[0])
    invoice.expectPdfEnabled()

    await invoice.createPdf()
    await invoice.expectMessage('PDF wurde erstellt')
    expect(downloads).toEqual([
      {
        filename: 'Rechnung_2026_001_2026-06-15.pdf',
        href: 'blob:invoice',
      },
    ])
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(invoiceDraftStore.state.number).toBe(input.number)
    invoice.expectMessageAbsent('PDF konnte nicht erstellt werden')
  })

  it('reports a browser download failure without claiming PDF creation succeeded', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const { input } = createInvoiceScenario({
      recipient: { company: 'Muster GmbH', name: '' },
    })
    saveBusinessProfile(createBusinessProfileScenario())
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
    await invoice.expectReady()
    await invoice.enterInvoiceNumber(input.number)
    await invoice.enterRecipient(input.recipient)
    await invoice.addPosition(input.positions[0])

    await invoice.createPdf()
    await invoice.expectMessage('PDF konnte nicht erstellt werden')
    await invoice.expectMessage('Browser-Download nicht verfügbar.')
    invoice.expectMessageAbsent('PDF wurde erstellt')
    expect(anchorClick).not.toHaveBeenCalled()
  })

  it('resets after confirmation, leaves an empty invoice untouched, and honors storage blocking', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    const { input } = createInvoiceScenario({ number: 'reset-me' })
    saveBusinessProfile(profile)
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()
    await invoice.expectPdfDisabled()

    await invoice.startNewInvoice()
    invoice.expectNewInvoiceConfirmationAbsent()
    await invoice.enterInvoiceNumber(input.number)
    await invoice.startNewInvoice()
    await invoice.expectNewInvoiceConfirmation()
    await invoice.confirmNewInvoice()
    invoice.expectInvoiceNumber('')

    businessProfileStorageStatus.setState(() => ({ error: 'Speicherfehler.' }))
    await invoice.expectBlockingNotice('Profil konnte nicht gespeichert werden')
    await invoice.closeBlockingNotice()
    await invoice.expectPdfDisabled()

    const savedProfile = await createBusinessProfileRepository(
      window.localStorage,
    ).loadProfile()
    expect(savedProfile).toEqual(profile)
  })
})
