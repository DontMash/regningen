import { cookieName } from '@/paraglide/runtime'
import { THEME_STORAGE_KEY } from '@/lib/theme-policy'
import { BUSINESS_PROFILE_STORAGE_KEY } from '../invoicing/business-profile-repository'
import { PDF_NOTIFICATION_PREFERENCE_KEY } from '../pwa/notification-preference'
import { ACKNOWLEDGMENT_STORAGE_KEY } from '../release-notes/browser-acknowledgment-persistence'
import {
  INVOICE_LANGUAGE_KEY,
  resetInvoiceLanguage,
} from '@/lib/invoice-language'
import { clearInvoiceDraftForApplicationReset } from '../invoicing/invoice-draft'
import {
  runPwaCriticalOperation,
  waitForPwaCriticalOperations,
} from '../pwa/pwa-critical-operations'
import {
  beginApplicationReset,
  publishApplicationReset,
} from '@/lib/application-reset-generation'

export {
  getApplicationResetGeneration,
  subscribeToApplicationReset,
} from '@/lib/application-reset-generation'

const USER_DATA_KEYS = [
  INVOICE_LANGUAGE_KEY,
  BUSINESS_PROFILE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  PDF_NOTIFICATION_PREFERENCE_KEY,
  ACKNOWLEDGMENT_STORAGE_KEY,
]

/** Browser-local, app-scoped deletion; a rejected attempt may have partly deleted data. */
export async function resetApplication(): Promise<void> {
  await waitForPwaCriticalOperations()
  await runPwaCriticalOperation(async () => {
    const generation = window.crypto.randomUUID()
    const draftInvalidation = beginApplicationReset(generation)
    await draftInvalidation
    await clearInvoiceDraftForApplicationReset(generation)
    for (const key of USER_DATA_KEYS) window.localStorage.removeItem(key)
    document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax`
    resetInvoiceLanguage()
    await publishApplicationReset(generation)
  })
}
