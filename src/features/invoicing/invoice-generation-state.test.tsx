// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from '@/components/ui/toast'
import { beginApplicationReset } from '@/lib/application-reset-generation'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import { createInvoiceScenario } from '../../../tests/scenarios/invoice'
import { createInvoiceGeneration } from './generation-domain'
import { businessValidation } from './validation-composition'
import { InvoicePdfFailure } from './generation-contract'
import {
  pdfFailureMessage,
  useInvoiceGeneration,
} from './invoice-generation-state'

const originalLocale = getLocale
// Hook tests observe the UI-facing operation; real PDF content has separate
// domain-operation and production-browser evidence.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  overwriteGetLocale(originalLocale)
})
function draft() {
  const { input } = createInvoiceScenario()
  return {
    ...input,
    ...input.recipient,
    rate: input.vatRate,
    items: input.positions,
  }
}

describe('UI-facing Invoice generation', () => {
  it('reports invalid input without downloading or discarding the failure details', async () => {
    const generation = createInvoiceGeneration(businessValidation, {
      render: async () => new Uint8Array([1]),
    })
    const download = vi.fn()
    const { result } = renderHook(() =>
      useInvoiceGeneration(generation, download),
    )
    await act(async () => {
      expect(
        await result.current.generate(
          createBusinessProfileScenario(),
          { ...draft(), items: [] },
          'de',
        ),
      ).toBe(false)
    })
    expect(download).not.toHaveBeenCalled()
    expect(result.current.failure).toMatchObject({
      status: 'invalid',
      invoiceFailures: [{ reason: 'position-required' }],
    })
    expect(result.current.isGenerating).toBe(false)
  })

  it('preserves format failure context and reports no successful download', async () => {
    const failure = new InvoicePdfFailure('characters', {
      cause: new Error('encoder'),
    })
    const generation = createInvoiceGeneration(businessValidation, {
      render: async () => {
        throw failure
      },
    })
    const download = vi.fn()
    const { result } = renderHook(() =>
      useInvoiceGeneration(generation, download),
    )
    await act(async () => {
      expect(
        await result.current.generate(
          createBusinessProfileScenario(),
          draft(),
          'en',
        ),
      ).toBe(false)
    })
    expect(download).not.toHaveBeenCalled()
    expect(result.current.failure).toBe(failure)
    expect(result.current.isGenerating).toBe(false)
  })

  it.each([
    ['edit', false],
    ['reset', false],
    ['reset', true],
    ['unmount', false],
    ['unmount', true],
    ['application-reset', false],
    ['application-reset', true],
  ] as const)(
    'bounds delayed snapshot completion after %s (rejected: %s)',
    async (action, rejected) => {
      const notify = vi.spyOn(toast, 'add')
      let resolve!: (bytes: Uint8Array) => void
      let reject!: (error: unknown) => void
      let revision = 0
      const generation = createInvoiceGeneration(businessValidation, {
        render: () =>
          new Promise<Uint8Array>((yes, no) => {
            resolve = yes
            reject = no
          }),
      })
      const download = vi.fn()
      const { result, unmount } = renderHook(() =>
        useInvoiceGeneration(generation, download, () => revision),
      )
      let pending!: ReturnType<typeof result.current.generate>
      let working = draft()
      act(() => {
        pending = result.current.generate(
          createBusinessProfileScenario(),
          working,
          'de',
        )
      })
      if (action === 'edit')
        working = { ...working, number: 'new working number' }
      if (action === 'reset') revision++
      if (action === 'unmount') unmount()
      if (action === 'application-reset')
        await act(() => beginApplicationReset('new-reset'))
      await act(async () => {
        if (rejected) reject(new TypeError('obsolete renderer'))
        else resolve(new Uint8Array([1]))
        expect(await pending).toBe(action === 'edit' ? true : 'canceled')
      })
      expect(download).toHaveBeenCalledTimes(action === 'edit' ? 1 : 0)
      expect(notify).toHaveBeenCalledTimes(action === 'edit' ? 1 : 0)
      if (action === 'edit') {
        expect(working.number).toBe('new working number')
        expect(download.mock.calls[0]?.[1]).not.toContain('new_working_number')
      }
      if (action !== 'unmount') expect(result.current.failure).toBeNull()
    },
  )

  it.each([
    ['business-name', 'Der Unternehmensname ist zu lang für das PDF.'],
    ['service', 'Die Leistungsbeschreibung ist zu lang für das PDF.'],
    ['addresses', 'Die Anschriften sind zu umfangreich für eine Seite.'],
    ['subject', 'Der Betreff ist zu lang für eine Seite.'],
    ['description', 'Eine Positionsbeschreibung ist zu lang für eine Seite.'],
    [
      'positions',
      'Zu viele lange Positionen für eine Seite. Bitte Beschreibungen kürzen.',
    ],
    ['invoice', 'Die Rechnungsdaten sind zu umfangreich für eine Seite.'],
  ] as const)(
    'provides meaningful feedback for the %s format failure',
    (reason, expected) => {
      overwriteGetLocale(() => 'de')
      expect(pdfFailureMessage(new InvoicePdfFailure(reason))).toBe(expected)
    },
  )

  it.each([
    {
      locale: 'de',
      unavailable:
        'PDF-Erstellung oder Download ist in diesem Browser nicht verfügbar.',
      format: 'Bitte Sonderzeichen in den Angaben prüfen.',
    },
    {
      locale: 'en',
      unavailable: 'PDF generation or download is unavailable in this browser.',
      format: 'Please check special characters in the details.',
    },
  ] as const)(
    'localizes capability feedback in $locale independently of Invoice Language',
    ({ locale, unavailable, format }) => {
      overwriteGetLocale(() => locale)
      expect(pdfFailureMessage(new InvoicePdfFailure('unavailable'))).toBe(
        unavailable,
      )
      expect(pdfFailureMessage(new InvoicePdfFailure('characters'))).toContain(
        format,
      )
      expect(pdfFailureMessage(new TypeError('defect'))).not.toBe('defect')
    },
  )
})
