import { cookieName } from '@/paraglide/runtime'
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
  'regningen.business-profile',
  'theme',
  'regningen.pwa.pdf-notifications',
  'regningen.release-notes.acknowledged-versions',
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
