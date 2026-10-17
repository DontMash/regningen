import { getLocale } from '@/paraglide/runtime'
import type { Locale } from '@/paraglide/runtime'

export function formattingLocale(locale: Locale) {
  return locale === 'en' ? 'en-GB' : 'de-DE'
}

export function formatEuro(cents: number, locale: Locale = getLocale()) {
  return new Intl.NumberFormat(formattingLocale(locale), {
    style: 'currency',
    currency: 'EUR',
  })
    .format(cents / 100)
    .replaceAll('\u00a0', ' ')
}

/** Calendar days must not shift when the viewer's timezone changes. */
export function formatDate(value: string, locale: Locale = getLocale()) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(formattingLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}
