import { useEffect, useState } from 'react'
import { useSelector } from '@tanstack/react-store'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { IconLanguage } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { getLocale, isLocale } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'
import { changeInterfaceLanguage } from '@/lib/change-language'
import {
  initializeInvoiceLanguagePreference,
  invoiceLanguageStore,
  setInvoiceLanguage,
} from '@/lib/invoice-language'

const languageItems = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
]

export function LanguageSelect({
  compact = false,
  id,
}: {
  compact?: boolean
  id?: string
}) {
  const [switching, setSwitching] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const label = compact
    ? m.common_language_change()
    : m.common_interface_language()
  async function change(value: string | null) {
    if (!isLocale(value) || value === getLocale()) return
    setSwitching(true)
    try {
      await changeInterfaceLanguage(value)
    } catch (error) {
      toast.add({
        title:
          error instanceof Error ? error.message : m.common_switch_failed(),
        type: 'error',
      })
    } finally {
      setSwitching(false)
    }
  }
  return (
    <Select
      items={languageItems}
      value={getLocale()}
      onValueChange={(value) => void change(value)}
      disabled={!hydrated || switching}
    >
      {compact ? (
        <SelectPrimitive.Trigger
          render={<Button variant="ghost" size="icon" />}
          aria-label={label}
          title={label}
        >
          <IconLanguage aria-hidden="true" data-icon="inline-start" />
        </SelectPrimitive.Trigger>
      ) : (
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
      )}
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          {languageItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function InvoiceLanguageSelect({ id }: { id?: string }) {
  const preference = useSelector(
    invoiceLanguageStore,
    (state) => state.preference,
  )
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const dispose = initializeInvoiceLanguagePreference()
    setHydrated(true)
    return dispose
  }, [])
  const items = [
    { value: 'auto', label: m.common_follow_interface() },
    ...languageItems,
  ]
  return (
    <Select
      items={items}
      value={hydrated ? preference : 'auto'}
      disabled={!hydrated}
      onValueChange={(value) => {
        if (value !== 'auto' && !isLocale(value)) return
        try {
          setInvoiceLanguage(value)
        } catch {
          toast.add({ title: m.common_language_save_failed(), type: 'error' })
        }
      }}
    >
      <SelectTrigger id={id} aria-label={m.common_invoice_language()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
