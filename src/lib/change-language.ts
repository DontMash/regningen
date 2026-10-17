import { getLocale, setLocale } from '@/paraglide/runtime'
import type { Locale } from '@/paraglide/runtime'
import { waitForInvoiceDraftPersistence } from '@/features/invoicing/invoice-draft-store'
import { waitForPwaCriticalOperations } from '@/features/pwa/pwa-critical-operations'
import { confirmDiscardProfileChanges } from '@/features/settings/unsaved-profile'
import * as m from '@/paraglide/messages'

export async function changeInterfaceLanguage(locale: Locale) {
  if (locale === getLocale()) return
  await waitForPwaCriticalOperations()
  if (!(await waitForInvoiceDraftPersistence()))
    throw new Error(m.common_switch_failed())
  if (!(await confirmDiscardProfileChanges())) return
  setLocale(locale)
}
