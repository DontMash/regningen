// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/paraglide/runtime'
import {
  getInvoiceLanguage,
  initializeInvoiceLanguagePreference,
  INVOICE_LANGUAGE_KEY,
  invoiceLanguageStore,
  resetInvoiceLanguage,
  resolveInvoiceLanguage,
  setInvoiceLanguage,
} from './invoice-language'

beforeEach(() => {
  setLocale('de', { reload: false })
  localStorage.clear()
  resetInvoiceLanguage()
})
afterEach(() => vi.restoreAllMocks())

describe('Invoice Language', () => {
  it('follows the interface until a fixed language is selected', () => {
    expect(resolveInvoiceLanguage('auto', 'en')).toBe('en')
    expect(resolveInvoiceLanguage('auto', 'de')).toBe('de')
    expect(resolveInvoiceLanguage('de', 'en')).toBe('de')
    expect(resolveInvoiceLanguage('en', 'de')).toBe('en')
  })

  it('remembers a fixed language and can return to automatic following', () => {
    setInvoiceLanguage('en')
    expect(getInvoiceLanguage()).toBe('en')
    expect(localStorage.getItem(INVOICE_LANGUAGE_KEY)).toBe('en')
    resetInvoiceLanguage()
    const dispose = initializeInvoiceLanguagePreference()
    expect(getInvoiceLanguage()).toBe('en')
    setInvoiceLanguage('auto')
    expect(getInvoiceLanguage()).toBe('de')
    expect(localStorage.getItem(INVOICE_LANGUAGE_KEY)).toBe('auto')
    dispose()
  })

  it('keeps the previous language if preference storage rejects a change', () => {
    setInvoiceLanguage('de')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    expect(() => setInvoiceLanguage('en')).toThrow('Storage blocked')
    expect(invoiceLanguageStore.state.preference).toBe('de')
    expect(localStorage.getItem(INVOICE_LANGUAGE_KEY)).toBe('de')
  })

  it('uses automatic following for absent or unsupported saved preferences', () => {
    localStorage.setItem(INVOICE_LANGUAGE_KEY, 'fr')
    const dispose = initializeInvoiceLanguagePreference()
    expect(invoiceLanguageStore.state.preference).toBe('auto')
    dispose()
  })

  it('uses automatic following when preference storage cannot be read', () => {
    setInvoiceLanguage('en')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    const dispose = initializeInvoiceLanguagePreference()
    expect(invoiceLanguageStore.state.preference).toBe('auto')
    dispose()
  })

  it('reflects another tab changing or clearing the shared preference', () => {
    const dispose = initializeInvoiceLanguagePreference()
    localStorage.setItem(INVOICE_LANGUAGE_KEY, 'en')
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    expect(invoiceLanguageStore.state.preference).toBe('auto')
    window.dispatchEvent(
      new StorageEvent('storage', { key: INVOICE_LANGUAGE_KEY }),
    )
    expect(invoiceLanguageStore.state.preference).toBe('en')
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(invoiceLanguageStore.state.preference).toBe('auto')
    dispose()
  })
})
