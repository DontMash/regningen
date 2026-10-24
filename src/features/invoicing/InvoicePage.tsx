import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { useTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { de, enGB } from 'date-fns/locale'
import { useSelector } from '@tanstack/react-store'
import { useForm } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FieldHint } from '@/components/FieldHint'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { toast } from '@/components/ui/toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  FormErrorSlot,
  FormInput,
  RequiredAlternativeFields,
  RequiredMark,
} from './FormFields'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { BusinessProfileDraft } from './business-profile'
import {
  useBusinessProfile,
  useProfileStorageSync,
} from './business-profile-query'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import {
  clearStoredInvoiceDraft,
  createEmptyInvoiceDraft,
  invoiceDraftPersistenceStore,
  invoiceDraftStore,
  invoicePositionDraftStore,
} from './invoice-draft-store'
import type { InvoiceDraft, InvoiceLineDraft } from './validation-contract'
import { invoiceEditorState } from './invoice-editor-composition'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'
import type { Locale } from '@/paraglide/runtime'
import { formatDate, formatEuro, formattingLocale } from '@/lib/i18n'
import { getInvoiceLanguage } from '@/lib/invoice-language'
import { createInvoicePdf } from './pdf'
import { useOptionalPwa } from '@/features/pwa/PwaProvider'
import { runPwaCriticalOperation } from '@/features/pwa/pwa-critical-operations'
import {
  IconCalendar,
  IconEdit,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'

type InvoiceFieldName = keyof InvoiceDraft
type InvoiceErrors = Record<string, string>

function localDate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function hasInvoiceData(invoice: InvoiceDraft) {
  return Boolean(
    invoice.number.trim() ||
    invoice.subject.trim() ||
    invoice.company.trim() ||
    invoice.name.trim() ||
    invoice.street.trim() ||
    invoice.postalCode.trim() ||
    invoice.town.trim() ||
    invoice.items.some(invoiceEditorState.hasPositionData),
  )
}

function suggestedPdfFilename(invoice: InvoiceDraft, locale: Locale) {
  const safeNumber = invoice.number.replace(/[^a-zA-Z0-9_-]/g, '_')
  return m.pdf_filename({ number: safeNumber, date: invoice.date }, { locale })
}

function savePdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function InvoiceInput(props: ComponentProps<typeof FormInput>) {
  return <FormInput form="invoice-form" {...props} />
}

function InvoiceAmountInput({
  item,
  onChange,
  ...props
}: Omit<ComponentProps<typeof InvoiceInput>, 'value' | 'onChange'> & {
  item: InvoiceLineDraft
  onChange: (amount: string, amountLocale: Locale) => void
}) {
  const locale = getLocale()
  // Drafts without entry metadata were entered with the original German grammar.
  const sourceLocale = item.amountLocale ?? 'de'
  const cents = invoiceEditorState.amountInCents(item)
  const reformat = sourceLocale !== locale && cents !== null
  const entryLocale = reformat || !item.amount.trim() ? locale : sourceLocale
  const sourceHint =
    item.amount && entryLocale !== locale
      ? entryLocale === 'de'
        ? m.invoice_amount_source_de()
        : m.invoice_amount_source_en()
      : undefined
  const value = reformat
    ? new Intl.NumberFormat(formattingLocale(locale), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(cents / 100)
    : item.amount

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <InvoiceInput
        {...props}
        value={value}
        aria-description={sourceHint}
        onChange={(amount) =>
          onChange(amount, amount.trim() ? entryLocale : locale)
        }
      />
      {sourceHint ? (
        <p className="paragraph-small text-muted-foreground">{sourceHint}</p>
      ) : null}
    </div>
  )
}

type InvoicePositionEditor = {
  updateItem: (
    index: number,
    name: 'description' | 'amount',
    value: string,
    amountLocale?: Locale,
  ) => void
  touch: (name: string) => void
  removeItem: (index: number) => void
  errors: InvoiceErrors
}

const InvoicePositionEditorContext =
  createContext<InvoicePositionEditor | null>(null)

function useInvoicePositionEditor() {
  const editor = useContext(InvoicePositionEditorContext)
  if (!editor) throw new Error(m.invoice_editor_missing())
  return editor
}

function DescriptionCell({
  index,
  item,
}: {
  index: number
  item: InvoiceLineDraft
}) {
  const { updateItem, touch, errors } = useInvoicePositionEditor()
  return (
    <InvoiceInput
      id={`item-description-${index}`}
      label={m.invoice_position_description({ position: index + 1 })}
      hideLabel
      required={invoiceEditorState.hasPositionData(item)}
      value={item.description}
      onChange={(value) => updateItem(index, 'description', value)}
      onBlur={() => touch(`items.${index}.description`)}
      error={errors[`items.${index}.description`]}
      maxLength={invoiceEditorState.descriptionLimit}
    />
  )
}

function AmountCell({
  index,
  item,
}: {
  index: number
  item: InvoiceLineDraft
}) {
  const { updateItem, touch, errors } = useInvoicePositionEditor()
  return (
    <InvoiceAmountInput
      id={`item-amount-${index}`}
      label={m.invoice_position_amount({ position: index + 1 })}
      hideLabel
      required={invoiceEditorState.hasPositionData(item)}
      item={item}
      onChange={(value, amountLocale) =>
        updateItem(index, 'amount', value, amountLocale)
      }
      onBlur={() => touch(`items.${index}.amount`)}
      error={errors[`items.${index}.amount`]}
    />
  )
}

function RemoveCell({ index }: { index: number }) {
  const { removeItem } = useInvoicePositionEditor()
  return (
    <Button
      type="button"
      variant="destructive"
      size="icon"
      aria-label={m.invoice_remove_position({ position: index + 1 })}
      onClick={() => removeItem(index)}
    >
      <IconTrash aria-hidden="true" data-icon="inline-start" />
    </Button>
  )
}

const invoicePositionColumns: ColumnDef<{}, InvoiceLineDraft>[] = [
  {
    id: 'position',
    header: () => m.invoice_position_number(),
    cell: ({ row }) => row.index + 1,
  },
  {
    accessorKey: 'description',
    header: () => (
      <>
        {m.invoice_description()}
        <RequiredMark />
      </>
    ),
    cell: ({ row }) => (
      <DescriptionCell index={row.index} item={row.original} />
    ),
  },
  {
    accessorKey: 'amount',
    header: () => (
      <div className="flex items-center gap-1">
        {m.invoice_amount()}
        <RequiredMark />
        <FieldHint label={m.invoice_amount()}>
          {m.invoice_amount_hint()}
        </FieldHint>
      </div>
    ),
    cell: ({ row }) => <AmountCell index={row.index} item={row.original} />,
  },
  {
    id: 'actions',
    header: () => m.invoice_action(),
    cell: ({ row }) => <RemoveCell index={row.index} />,
  },
]

function InvoiceDateField({
  value,
  onChange,
  onBlur,
  error,
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const calendarPopup = useRef<HTMLDivElement>(null)
  const [year, month, day] = value.split('-').map(Number)
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(year, month - 1, day)
    : undefined
  const selected =
    candidate &&
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
      ? candidate
      : undefined

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id="invoice-date-label" className="min-h-6">
        {m.invoice_date()}
        <RequiredMark />
      </FieldLabel>
      <span id="invoice-date-required" className="sr-only">
        {m.invoice_required()}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          className="form-input-trigger"
          aria-labelledby="invoice-date-label"
          aria-invalid={Boolean(error)}
          aria-describedby={
            error
              ? 'invoice-date-required invoice-date-error'
              : 'invoice-date-required'
          }
        >
          <IconCalendar aria-hidden="true" data-icon="inline-start" />
          {selected ? formatDate(value) : value || m.invoice_choose_date()}
        </PopoverTrigger>
        <PopoverContent
          ref={calendarPopup}
          initialFocus={() =>
            calendarPopup.current?.querySelector<HTMLButtonElement>(
              'button[data-day][tabindex="0"]',
            ) ?? true
          }
          className="w-auto p-0"
          align="start"
        >
          <Calendar
            autoFocus
            mode="single"
            locale={getLocale() === 'en' ? enGB : de}
            labels={{
              labelNav: () => m.invoice_calendar_navigation(),
              labelPrevious: () => m.invoice_calendar_previous(),
              labelNext: () => m.invoice_calendar_next(),
              labelMonthDropdown: () => m.invoice_calendar_month(),
              labelYearDropdown: () => m.invoice_calendar_year(),
              labelDayButton: (date, modifiers) => {
                const formatted = new Intl.DateTimeFormat(
                  formattingLocale(getLocale()),
                  {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  },
                ).format(date)
                if (modifiers.today && modifiers.selected)
                  return m.invoice_calendar_today_selected({ date: formatted })
                if (modifiers.today)
                  return m.invoice_calendar_today({ date: formatted })
                if (modifiers.selected)
                  return m.invoice_calendar_selected_day({ date: formatted })
                return m.invoice_calendar_day({ date: formatted })
              },
            }}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) return
              onChange(
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
              )
              onBlur()
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <FormErrorSlot id="invoice-date-error" error={error} />
    </Field>
  )
}

function InvoicePage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { initialized: draftInitialized } = useSelector(
    invoiceDraftPersistenceStore,
    (state) => state,
  )
  const profileQuery = useBusinessProfile()
  const invoice = useSelector(invoiceDraftStore, (state) => state)
  const storageError = useSelector(
    businessProfileStorageStatus,
    (state) => state.error,
  )
  const [profileChanged, setProfileChanged] = useState(false)
  useProfileStorageSync(() => setProfileChanged(true))
  const validProfile = profileQuery.readiness.ready
    ? profileQuery.readiness.profile
    : null

  useEffect(() => {
    if (!profileQuery.isFetching && profileChanged) setProfileChanged(false)
  }, [profileChanged, profileQuery.data, profileQuery.isFetching])

  if (!mounted || !draftInitialized || profileQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-center" aria-live="polite">
          {m.invoice_loading()}
        </p>
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.invoice_blocked()}</AlertDialogTitle>
              <AlertDialogDescription>
                {m.invoice_profile_read_failed()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.invoice_close()}</AlertDialogCancel>
              <AlertDialogAction onClick={() => window.location.reload()}>
                {m.invoice_reload()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  if (!validProfile && !hasInvoiceData(invoice)) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-12">
        <h1 className="heading-1">{m.invoice_complete_profile()}</h1>
        <p className="paragraph">{m.invoice_setup_guidance()}</p>
        <Link to="/settings/profile" className={buttonVariants()}>
          {m.invoice_open_profile()}
        </Link>
      </div>
    )
  }

  return (
    <InvoiceEditor
      profile={validProfile}
      profileChanged={profileChanged}
      storageError={storageError}
    />
  )
}

function InvoiceEditor({
  profile,
  profileChanged,
  storageError,
}: {
  profile: BusinessProfileDraft | null
  profileChanged: boolean
  storageError: string | null
}) {
  const draft = useSelector(invoiceDraftStore, (state) => state)
  const draftPersistence = useSelector(
    invoiceDraftPersistenceStore,
    (state) => state,
  )
  const pwa = useOptionalPwa()
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const newItem = useSelector(invoicePositionDraftStore, (state) => state)
  const [newItemSubmitted, setNewItemSubmitted] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [blocker, setBlocker] = useState<
    'profile' | 'storage' | 'changed' | null
  >(!profile ? 'profile' : storageError ? 'storage' : null)
  const form = useForm({
    defaultValues: draft,
    onSubmit: async ({ value }) => {
      if (
        Object.keys(invoiceEditorState.errorsFor(value)).length ||
        !profile ||
        storageError ||
        profileChanged
      )
        return

      const invoiceLocale = getInvoiceLanguage()
      setIsGenerating(true)
      try {
        await runPwaCriticalOperation(async () => {
          const bytes = await createInvoicePdf(profile, value, invoiceLocale)
          const filename = suggestedPdfFilename(value, invoiceLocale)
          savePdf(bytes, filename)
          toast.add({
            title: m.invoice_pdf_created(),
            description: m.invoice_pdf_downloaded(),
            type: 'success',
          })
          void pwa?.reportPdfExport(filename)
        })
      } catch (error) {
        toast.add({
          title: m.invoice_pdf_failed(),
          description:
            error instanceof Error ? error.message : m.invoice_check_inputs(),
          type: 'error',
        })
      } finally {
        setIsGenerating(false)
      }
    },
  })

  useEffect(() => {
    if (storageError) setBlocker('storage')
    else if (profileChanged) setBlocker('changed')
    else if (!profile) setBlocker('profile')
  }, [profile, profileChanged, storageError])

  useEffect(() => {
    if (draftPersistence.restored || form.state.values.date) return
    const initial = { ...form.state.values, date: localDate() }
    form.reset(initial)
    invoiceDraftStore.setState(() => initial)
  }, [draftPersistence.restored, form])

  const touch = (name: string) =>
    setTouched((current) => new Set(current).add(name))

  function updateField<TName extends InvoiceFieldName>(
    name: TName,
    value: InvoiceDraft[TName],
  ) {
    const next = { ...form.state.values, [name]: value }
    // Temporary form-value adapter; working stores remain the editor input seam.
    form.reset(next)
    invoiceDraftStore.setState(() => next)
  }

  function updateItem(
    index: number,
    name: 'description' | 'amount',
    value: string,
    amountLocale?: Locale,
  ) {
    invoiceEditorState.updatePosition(index, {
      [name]: value,
      ...(name === 'amount' ? { amountLocale } : {}),
    })
    form.setFieldValue('items', invoiceDraftStore.state.items)
  }

  function addItem() {
    setNewItemSubmitted(true)
    if (!invoiceEditorState.addPosition().valid) return
    form.setFieldValue('items', invoiceDraftStore.state.items)
    setNewItemSubmitted(false)
  }

  function removeItem(index: number) {
    invoiceEditorState.removePosition(index)
    form.setFieldValue('items', invoiceDraftStore.state.items)
    setTouched(
      (current) =>
        new Set(
          [...current].flatMap((name) => {
            const match = /^items\.(\d+)\.(description|amount)$/.exec(name)
            if (!match) return [name]
            const row = Number(match[1])
            if (row === index) return []
            return [row > index ? `items.${row - 1}.${match[2]}` : name]
          }),
        ),
    )
  }

  function startNewInvoice() {
    if (
      hasInvoiceData(form.state.values) ||
      form.state.values.date !== localDate() ||
      form.state.values.rate !== createEmptyInvoiceDraft().rate ||
      newItem.description.trim() ||
      newItem.amount.trim()
    ) {
      setConfirmReset(true)
      return
    }
    void resetInvoice()
  }

  async function resetInvoice() {
    try {
      await clearStoredInvoiceDraft()
    } catch (error) {
      toast.add({
        title: m.invoice_reset_failed(),
        description:
          error instanceof Error ? error.message : m.invoice_discard_failed(),
        type: 'error',
      })
      return
    }

    const freshInvoice = { ...createEmptyInvoiceDraft(), date: localDate() }
    form.reset(freshInvoice)
    invoiceDraftStore.setState(() => freshInvoice)
    setTouched(new Set())
    invoicePositionDraftStore.setState(() => ({ description: '', amount: '' }))
    setNewItemSubmitted(false)
    setConfirmReset(false)
  }

  const currentValues = draft
  const editor = invoiceEditorState.derive()
  const validationErrors = editor.errors
  const errors = Object.fromEntries(
    Object.entries(validationErrors).filter(([name]) => touched.has(name)),
  )
  const recipientMissing = editor.recipientMissing
  const recipientError =
    recipientMissing && (touched.has('company') || touched.has('name'))
      ? validationErrors.company
      : undefined
  const validInvoice = editor.valid
  const newItemErrors = {
    description: editor.newPositionErrors['items.description'],
    amount: editor.newPositionErrors['items.amount'],
  }
  const table = useTable({
    features: {},
    data: currentValues.items,
    columns: invoicePositionColumns,
  })
  const totals = editor.totals

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-12">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="heading-1">{m.invoice_title()}</h1>
            <p className="paragraph-large text-muted-foreground">
              {m.invoice_intro()}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={startNewInvoice}>
            <IconEdit data-icon="inline-start" />
            {m.invoice_new()}
          </Button>
        </div>

        <AlertDialog
          open={blocker !== null}
          onOpenChange={(open) => {
            if (!open) setBlocker(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {blocker === 'storage'
                  ? m.invoice_profile_save_failed()
                  : blocker === 'changed'
                    ? m.invoice_profile_updating()
                    : m.invoice_profile_required()}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {blocker === 'storage'
                  ? m.invoice_storage_blocked({ error: storageError ?? '' })
                  : blocker === 'changed'
                    ? m.invoice_profile_changed()
                    : m.invoice_profile_incomplete()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.invoice_close()}</AlertDialogCancel>
              {blocker === 'profile' ? (
                <Link to="/settings/profile" className={buttonVariants()}>
                  {m.invoice_open_profile()}
                </Link>
              ) : blocker === 'storage' ? (
                <AlertDialogAction onClick={() => window.location.reload()}>
                  {m.invoice_reload()}
                </AlertDialogAction>
              ) : null}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {m.invoice_new_confirmation()}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {m.invoice_new_discard()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.invoice_cancel()}</AlertDialogCancel>
              <AlertDialogAction onClick={resetInvoice}>
                {m.invoice_new_confirm()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {draftPersistence.error ? (
          <p role="alert" className="paragraph-small text-destructive">
            {m.invoice_persistence_warning({ error: draftPersistence.error })}
          </p>
        ) : null}

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{m.invoice_details()}</CardTitle>
              <CardDescription>{m.invoice_required_guidance()}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <InvoiceInput
                  id="invoice-number"
                  label={m.invoice_number()}
                  value={currentValues.number}
                  onChange={(value) => updateField('number', value)}
                  error={errors.number}
                  onBlur={() => touch('number')}
                  required
                  maxLength={40}
                />
                <InvoiceDateField
                  value={currentValues.date}
                  onChange={(value) => updateField('date', value)}
                  onBlur={() => touch('date')}
                  error={errors.date}
                />
                <div className="md:col-span-2">
                  <InvoiceInput
                    id="invoice-subject"
                    label={m.invoice_subject()}
                    value={currentValues.subject}
                    onChange={(value) => updateField('subject', value)}
                    error={errors.subject}
                    onBlur={() => touch('subject')}
                    maxLength={100}
                  />
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.invoice_recipient()}</CardTitle>
              <CardDescription>
                {m.invoice_recipient_guidance()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <RequiredAlternativeFields
                  id="recipient-identity"
                  label={m.invoice_recipient_identity()}
                  error={recipientError}
                >
                  <InvoiceInput
                    id="recipient-company"
                    label={m.invoice_recipient_company()}
                    value={currentValues.company}
                    onChange={(value) => updateField('company', value)}
                    error={recipientMissing ? undefined : errors.company}
                    onBlur={() => touch('company')}
                    maxLength={70}
                    autoComplete="organization"
                  />
                  <InvoiceInput
                    id="recipient-name"
                    label={m.invoice_recipient_name()}
                    value={currentValues.name}
                    onChange={(value) => updateField('name', value)}
                    error={errors.name}
                    onBlur={() => touch('name')}
                    maxLength={70}
                    autoComplete="name"
                  />
                </RequiredAlternativeFields>
                <InvoiceInput
                  id="recipient-street"
                  label={m.invoice_street()}
                  value={currentValues.street}
                  onChange={(value) => updateField('street', value)}
                  error={errors.street}
                  onBlur={() => touch('street')}
                  required
                  maxLength={85}
                  autoComplete="street-address"
                />
                <InvoiceInput
                  id="recipient-postal-code"
                  label={m.invoice_postal_code()}
                  value={currentValues.postalCode}
                  onChange={(value) => updateField('postalCode', value)}
                  error={errors.postalCode}
                  onBlur={() => touch('postalCode')}
                  required
                  maxLength={85}
                  autoComplete="postal-code"
                />
                <InvoiceInput
                  id="recipient-town"
                  label={m.invoice_town()}
                  value={currentValues.town}
                  onChange={(value) => updateField('town', value)}
                  error={errors.town}
                  onBlur={() => touch('town')}
                  required
                  maxLength={85}
                  autoComplete="address-level2"
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {m.invoice_positions()}
                <RequiredMark />
              </CardTitle>
              <CardDescription>
                {m.invoice_positions_guidance()}
                <span className="block" role="status" aria-live="polite">
                  {m.invoice_position_count({
                    count: currentValues.items.length,
                  })}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <InvoicePositionEditorContext.Provider
                value={{ updateItem, touch, removeItem, errors }}
              >
                <FieldGroup className="gap-0">
                  <Table
                    aria-label={m.invoice_positions_accessible()}
                    className="min-w-[34rem] table-fixed"
                  >
                    <TableHeader>
                      {table.getHeaderGroups().map((group) => (
                        <TableRow key={group.id}>
                          {group.headers.map((header) => (
                            <TableHead
                              key={header.id}
                              className={cn(
                                header.column.id === 'position' && 'w-12',
                                header.column.id === 'amount' && 'w-48',
                                header.column.id === 'actions' && 'w-20',
                              )}
                            >
                              {!header.isPlaceholder && (
                                <table.FlexRender header={header} />
                              )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map((row) => (
                          <TableRow key={row.id}>
                            {row.getAllCells().map((cell) => (
                              <TableCell key={cell.id} className="align-top">
                                <table.FlexRender cell={cell} />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-8 text-center text-muted-foreground"
                          >
                            {m.invoice_positions_empty()}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </FieldGroup>
              </InvoicePositionEditorContext.Provider>
              <form
                id="new-position-form"
                aria-label={m.invoice_add_position()}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  addItem()
                }}
              >
                <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-start">
                  <InvoiceInput
                    id="new-item-description"
                    label={m.invoice_description()}
                    required
                    value={newItem.description}
                    maxLength={invoiceEditorState.descriptionLimit}
                    form="new-position-form"
                    onChange={(description) =>
                      invoicePositionDraftStore.setState((current) => ({
                        ...current,
                        description,
                      }))
                    }
                    error={
                      newItemSubmitted ? newItemErrors.description : undefined
                    }
                  />
                  <InvoiceAmountInput
                    id="new-item-amount"
                    label={m.invoice_amount()}
                    required
                    hint={m.invoice_amount_hint()}
                    item={newItem}
                    form="new-position-form"
                    onChange={(amount, amountLocale) =>
                      invoicePositionDraftStore.setState((current) => ({
                        ...current,
                        amount,
                        amountLocale,
                      }))
                    }
                    error={newItemSubmitted ? newItemErrors.amount : undefined}
                  />
                  <Button
                    type="submit"
                    form="new-position-form"
                    className="md:mt-9"
                    variant="outline"
                    disabled={!editor.canAddPosition}
                  >
                    <IconPlus data-icon="inline-start" />
                    {m.invoice_add_position()}
                  </Button>
                </FieldGroup>
              </form>
              <Field data-invalid={Boolean(errors.rate)}>
                <FieldLabel id="vat-rate-label">
                  {m.invoice_vat_rate()}
                  <RequiredMark />
                </FieldLabel>
                <span id="vat-rate-required" className="sr-only">
                  {m.invoice_required()}
                </span>
                <ToggleGroup
                  value={[String(currentValues.rate)]}
                  aria-labelledby="vat-rate-label"
                  aria-describedby={
                    errors.rate
                      ? 'vat-rate-required vat-rate-error'
                      : 'vat-rate-required'
                  }
                  aria-invalid={Boolean(errors.rate)}
                  onValueChange={(selected) => {
                    const value = selected[0]
                    if (value === '7' || value === '19') {
                      updateField('rate', value === '7' ? 7 : 19)
                    }
                  }}
                >
                  <ToggleGroupItem value="7">
                    {m.invoice_vat_choice({ rate: 7 })}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="19">
                    {m.invoice_vat_choice({ rate: 19 })}
                  </ToggleGroupItem>
                </ToggleGroup>
                <FormErrorSlot id="vat-rate-error" error={errors.rate} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.invoice_summary()}</CardTitle>
            <CardDescription>
              {currentValues.number.trim() || '—'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between gap-4">
              <span>{m.invoice_net()}</span>
              <strong>{totals ? formatEuro(totals.net) : '—'}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>{m.invoice_tax({ rate: currentValues.rate })}</span>
              <strong>{totals ? formatEuro(totals.tax) : '—'}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>{m.invoice_gross()}</span>
              <strong>{totals ? formatEuro(totals.gross) : '—'}</strong>
            </div>
            <p className="paragraph-small text-muted-foreground">
              {m.invoice_profile_source()}
            </p>
          </CardContent>
        </Card>

        <form
          id="invoice-form"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <Button
            type="submit"
            disabled={
              !validInvoice ||
              isGenerating ||
              profileChanged ||
              !profile ||
              Boolean(storageError)
            }
          >
            {isGenerating
              ? m.invoice_generating_pdf()
              : m.invoice_generate_pdf()}
          </Button>
        </form>
      </aside>
    </div>
  )
}

export default InvoicePage
