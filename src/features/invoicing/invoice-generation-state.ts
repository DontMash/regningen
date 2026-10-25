import { useEffect, useRef, useState } from 'react'
import { getApplicationResetGeneration } from '@/lib/application-reset-generation'

import type {
  BusinessProfileDraft,
  EntryLanguage,
  InvoiceValidationInput,
} from './validation-contract'
import type {
  InvoiceGeneration,
  InvoicePdfDownload,
} from './generation-contract'
import { InvoicePdfFailure } from './generation-contract'
import { validationMessage } from './validation-feedback'
import { toast } from '@/components/ui/toast'
import * as m from '@/paraglide/messages'
import { useOptionalPwa } from '@/features/pwa/PwaProvider'
import { runPwaCriticalOperation } from '@/features/pwa/pwa-critical-operations'

const unchangedExportGeneration = () => 0

export function pdfFailureMessage(error: unknown): string {
  if (!(error instanceof InvoicePdfFailure)) return m.pdf_error_unexpected()
  switch (error.reason) {
    case 'unavailable':
      return m.pdf_error_unavailable()
    case 'characters':
      return m.pdf_error_characters()
    case 'business-name':
      return m.pdf_error_business_name()
    case 'service':
      return m.pdf_error_service()
    case 'addresses':
      return m.pdf_error_addresses()
    case 'subject':
      return m.pdf_error_subject()
    case 'description':
      return m.pdf_error_description()
    case 'positions':
      return m.pdf_error_positions()
    case 'invoice':
      return m.pdf_error_invoice()
  }
}

/** UI-facing operation; supplied domain and download capabilities remain selected at composition. */
export function useInvoiceGeneration(
  generation: InvoiceGeneration,
  download: InvoicePdfDownload,
  getExportGeneration: () => number = unchangedExportGeneration,
) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const pwa = useOptionalPwa()
  const owner = useRef({ active: true, request: 0 })
  useEffect(() => {
    const current = owner.current
    current.active = true
    return () => {
      current.active = false
      current.request++
    }
  }, [])

  async function generate(
    profile: BusinessProfileDraft,
    invoice: InvoiceValidationInput,
    language: EntryLanguage,
  ) {
    const request = ++owner.current.request
    const reset = getApplicationResetGeneration()
    const exportGeneration = getExportGeneration()
    // Ordinary edits do not abandon a snapshot. Departure and destructive resets do.
    const current = () =>
      owner.current.active &&
      owner.current.request === request &&
      reset === getApplicationResetGeneration() &&
      exportGeneration === getExportGeneration()
    setIsGenerating(true)
    setFailure(null)
    try {
      return await runPwaCriticalOperation(async () => {
        const result = await generation.generate(profile, invoice, language)
        if (!current()) return 'canceled' as const
        if (result.status === 'invalid') {
          setFailure(result)
          const messages = [
            ...result.profileFailures.map((issue) =>
              validationMessage('profile', issue),
            ),
            ...result.invoiceFailures.map((issue) =>
              validationMessage('invoice', issue),
            ),
          ]
          toast.add({
            title: m.invoice_pdf_failed(),
            description: [...new Set(messages)].join(' '),
            type: 'error',
          })
          return false
        }
        const filename = m.pdf_filename(
          {
            number: result.number.replace(/[^a-zA-Z0-9_-]/g, '_'),
            date: result.date,
          },
          { locale: language },
        )
        download(result.bytes, filename)
        toast.add({
          title: m.invoice_pdf_created(),
          description: m.invoice_pdf_downloaded(),
          type: 'success',
        })
        void pwa?.reportPdfExport(filename)
        return true
      })
    } catch (error) {
      if (!current()) return 'canceled' as const
      // Preserve the original failure (including cause) for diagnostics; unknown
      // defects remain failed operations, never a successful fallback document.
      setFailure(error)
      toast.add({
        title: m.invoice_pdf_failed(),
        description: pdfFailureMessage(error),
        type: 'error',
      })
      return false
    } finally {
      if (owner.current.active && owner.current.request === request)
        setIsGenerating(false)
    }
  }

  return { generate, isGenerating, failure }
}
