import { Store } from '@tanstack/store'
import { getLocale } from '@/paraglide/runtime'
import type { Locale } from '@/paraglide/runtime'

export type InvoiceLanguagePreference = 'auto' | Locale
export const INVOICE_LANGUAGE_KEY = 'regningen.invoice-language'
export const invoiceLanguageStore = new Store<{
  preference: InvoiceLanguagePreference
}>({ preference: 'auto' })

export function resolveInvoiceLanguage(
  preference: InvoiceLanguagePreference,
  interfaceLocale: Locale,
): Locale {
  return preference === 'auto' ? interfaceLocale : preference
}

export function getInvoiceLanguage(): Locale {
  return resolveInvoiceLanguage(
    invoiceLanguageStore.state.preference,
    getLocale(),
  )
}

function parsePreference(value: string | null): InvoiceLanguagePreference {
  return value === 'de' || value === 'en' ? value : 'auto'
}

export function setInvoiceLanguage(
  preference: InvoiceLanguagePreference,
  storage: Storage = window.localStorage,
) {
  storage.setItem(INVOICE_LANGUAGE_KEY, preference)
  invoiceLanguageStore.setState(() => ({ preference }))
}

export function initializeInvoiceLanguagePreference() {
  const refresh = () => {
    try {
      invoiceLanguageStore.setState(() => ({
        preference: parsePreference(
          window.localStorage.getItem(INVOICE_LANGUAGE_KEY),
        ),
      }))
    } catch {
      // An unreadable preference cannot imply a fixed document language.
      invoiceLanguageStore.setState(() => ({ preference: 'auto' }))
    }
  }
  refresh()
  const onStorage = (event: StorageEvent) => {
    if (event.key === INVOICE_LANGUAGE_KEY || event.key === null) refresh()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

export function resetInvoiceLanguage() {
  invoiceLanguageStore.setState(() => ({ preference: 'auto' }))
}
