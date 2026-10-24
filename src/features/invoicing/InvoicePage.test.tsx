// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import InvoicePage from './InvoicePage'
import { beginApplicationReset } from '@/lib/application-reset-generation'
import {
  resetInvoiceLanguage,
  setInvoiceLanguage,
} from '@/lib/invoice-language'
import { setLocale } from '@/paraglide/runtime'
import { InvoiceRobot } from '../../../tests/robots/vitest/invoice'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import { createInvoiceScenario } from '../../../tests/scenarios/invoice'
import {
  createEmptyInvoiceDraft,
  disposeInvoiceDraftPersistence,
  invoiceDraftStore,
  invoicePositionDraftStore,
  waitForInvoiceDraftPersistence,
  INVOICE_DRAFT_STORAGE_KEY,
} from './invoice-draft-store'
import { initializeInvoiceDraftPersistence } from './invoice-draft'
import { createBusinessProfileRepository } from './business-profile-repository'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import { saveBusinessProfile } from '../../../tests/support/vitest/business-profile'
import {
  disposeTestRouters,
  renderAtRoute,
} from '../../../tests/support/vitest/render'

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.localStorage.clear()
  window.sessionStorage.clear()
  resetInvoiceLanguage()
  setLocale('de', { reload: false })
  invoiceDraftStore.setState(() => createEmptyInvoiceDraft())
  invoicePositionDraftStore.setState(() => ({ description: '', amount: '' }))
  businessProfileStorageStatus.setState(() => ({ error: null }))
  await initializeInvoiceDraftPersistence()
})

afterEach(async () => {
  cleanup()
  disposeTestRouters()
  await disposeInvoiceDraftPersistence()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('invoice editor', () => {
  it('keeps programmatic working changes visible, validated and persisted through the next ordinary edit', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()
    await invoice.addPosition({ description: 'Earlier charge', amount: '7' })
    await act(async () => {
      invoiceDraftStore.setState((current) => ({
        ...current,
        number: 'external-change',
        date: '2026-06-15',
        company: 'Recipient Ltd',
        street: 'Test Street 1',
        postalCode: '12345',
        town: 'Berlin',
        items: [
          { description: 'Working charge', amount: '119', amountLocale: 'en' },
        ],
        rate: 19,
      }))
      invoicePositionDraftStore.setState(() => ({
        description: 'Unfinished',
        amount: '1.',
        amountLocale: 'en',
      }))
    })
    invoice.expectInvoiceNumber('external-change')
    invoice.expectTotals({ net: '100,00 €', tax: '19,00 €', gross: '119,00 €' })
    invoice.expectPdfEnabled()
    await invoice.enterInvoiceNumber('ordinary-edit')
    invoice.expectPositionValues(1, {
      description: 'Working charge',
      amount: '119,00',
    })
    invoice.expectDateLabel('15.06.2026')
    invoice.expectPdfEnabled()
    await waitForInvoiceDraftPersistence()
    expect(
      JSON.parse(sessionStorage.getItem(INVOICE_DRAFT_STORAGE_KEY) ?? 'null'),
    ).toMatchObject({
      invoice: {
        number: 'ordinary-edit',
        date: '2026-06-15',
        rate: 19,
        items: [
          { description: 'Working charge', amount: '119', amountLocale: 'en' },
        ],
      },
      newPosition: {
        description: 'Unfinished',
        amount: '1.',
        amountLocale: 'en',
      },
    })
    const downloads: Blob[] = []
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => {
          downloads.push(blob)
          return 'blob:invoice'
        },
        revokeObjectURL: vi.fn(),
      }),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await invoice.createPdf()
    await invoice.expectMessage('PDF wurde erstellt')
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        reader.result instanceof ArrayBuffer
          ? resolve(reader.result)
          : reject(new Error('Expected PDF bytes'))
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(downloads[0])
    })
    expect((await PDFDocument.load(bytes)).getTitle()).toBe(
      'Rechnung ordinary-edit',
    )
    await act(async () => {
      invoiceDraftStore.setState((current) => ({ ...current, street: '' }))
    })
    await invoice.touchRecipient('street')
    await invoice.expectMessage('Straße und Hausnummer fehlen.')
    await invoice.expectPdfDisabled()
  })

  it('cannot resurrect pre-reset working values through a subsequent edit', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()
    await invoice.enterInvoiceNumber('old-number')
    await invoice.addPosition({ description: 'Old charge', amount: '107' })
    await invoice.enterNewPosition({
      description: 'Old unfinished',
      amount: '0,',
    })
    await act(async () => {
      await beginApplicationReset('rendered-reset')
    })
    invoice.expectInvoiceNumber('')
    invoice.expectNewPositionValues({ description: '', amount: '' })
    await invoice.expectPdfDisabled()
    await invoice.enterInvoiceNumber('after-reset')
    await waitForInvoiceDraftPersistence()
    expect(
      JSON.parse(sessionStorage.getItem(INVOICE_DRAFT_STORAGE_KEY) ?? 'null'),
    ).toMatchObject({
      invoice: { number: 'after-reset', items: [], date: '' },
      newPosition: { description: '', amount: '' },
    })
  })

  it('renders English editor text, tax wording and day-first dates from the interface locale', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    saveBusinessProfile(createBusinessProfileScenario())
    invoiceDraftStore.setState((current) => ({
      ...current,
      date: '2026-06-15',
    }))
    setLocale('en', { reload: false })
    await renderAtRoute('/invoice', InvoicePage)

    await invoice.expectMessage('Create an invoice')
    await invoice.expectMessage('Invoice details')
    await invoice.expectMessage('Recipient')
    await invoice.expectMessage('VAT rate')
    await invoice.expectMessage('7% VAT')
    await invoice.expectMessage('15/06/2026')
    invoice.expectMessageAbsent('Rechnung erstellen')
  })

  it.each([
    { locale: 'de', counts: ['0 Positionen', '1 Position', '2 Positionen'] },
    { locale: 'en', counts: ['0 positions', '1 position', '2 positions'] },
  ] as const)(
    'announces the submitted position count as positions are added and removed in $locale',
    async ({ locale, counts }) => {
      const invoice = new InvoiceRobot(userEvent.setup())
      const position = createInvoiceScenario({
        positions: [{ description: 'Catering', amount: '10' }],
      }).input.positions[0]
      saveBusinessProfile(createBusinessProfileScenario())
      setLocale(locale, { reload: false })
      await renderAtRoute('/invoice', InvoicePage)

      await invoice.expectPositionCount(counts[0])
      await invoice.enterNewPosition(position)
      await invoice.expectPositionCount(counts[0])
      await invoice.submitNewPosition()
      await invoice.expectPositionCount(counts[1])
      await invoice.addPosition(position)
      await invoice.expectPositionCount(counts[2])
      await invoice.removePosition(1)
      await invoice.expectPositionCount(counts[1])
      await invoice.removePosition(1)
      await invoice.expectPositionCount(counts[0])
    },
  )

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

  it('displays valid source-locale amounts in German without reinterpreting unfinished entry', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    saveBusinessProfile(createBusinessProfileScenario())
    invoiceDraftStore.setState((current) => ({
      ...current,
      items: [
        {
          description: 'English thousands',
          amount: '1,234',
          amountLocale: 'en',
        },
      ],
    }))
    invoicePositionDraftStore.setState(() => ({
      description: 'Unfinished English amount',
      amount: '1.',
      amountLocale: 'en',
    }))
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()

    invoice.expectPositionValues(1, { amount: '1.234,00' })
    invoice.expectTotals({ gross: '1.234,00 €' })
    invoice.expectNewPositionValues({ amount: '1.' })
    await invoice.expectMessage(
      'Diese Eingabe verwendet englische Trennzeichen (z. B. 1,234.56). Zum Wechseln in das aktuelle Zahlenformat das Feld leeren und den Betrag neu eingeben.',
    )
    expect(invoiceDraftStore.state.items[0]).toMatchObject({
      amount: '1,234',
      amountLocale: 'en',
    })

    await invoice.editPosition(1, { amount: '12,50' })
    invoice.expectTotals({ gross: '12,50 €' })
    expect(invoiceDraftStore.state.items[0]).toMatchObject({
      amount: '12,50',
      amountLocale: 'de',
    })
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

  it('retains and displays an invalid calendar day without normalizing it into a different date', async () => {
    const invoice = new InvoiceRobot(userEvent.setup())
    saveBusinessProfile(createBusinessProfileScenario())
    invoiceDraftStore.setState((current) => ({
      ...current,
      date: '2026-02-29',
    }))
    await renderAtRoute('/invoice', InvoicePage)
    await invoice.expectReady()

    invoice.expectDateLabel('2026-02-29')
    expect(invoiceDraftStore.state.date).toBe('2026-02-29')
    await invoice.expectPdfDisabled()
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

  it.each([
    { locale: 'de', filename: 'Rechnung_2026_001_2026-06-15.pdf' },
    { locale: 'en', filename: 'Invoice_2026_001_2026-06-15.pdf' },
  ] as const)(
    'initiates a $locale PDF download with a sanitized filename while feedback remains German',
    async ({ locale, filename }) => {
      const invoice = new InvoiceRobot(userEvent.setup())
      const { input } = createInvoiceScenario({
        number: '2026/001',
        recipient: { company: 'Muster GmbH', name: '' },
      })
      setInvoiceLanguage(locale)
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
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        function (this: HTMLAnchorElement) {
          downloads.push({ filename: this.download, href: this.href })
        },
      )
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
          filename,
          href: 'blob:invoice',
        },
      ])
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(invoiceDraftStore.state.number).toBe(input.number)
      invoice.expectMessageAbsent('PDF konnte nicht erstellt werden')
    },
  )

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
