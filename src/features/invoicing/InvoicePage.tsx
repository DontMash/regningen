import { createContext, useContext, useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { useTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { de } from 'date-fns/locale'
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
import { businessProfileSchema } from './business-profile'
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
import type { InvoiceDraft, InvoiceLineDraft, VatRate } from './invoice'
import {
  calculateInvoiceTotals,
  invoiceFormSchema,
  parseEuroAmount,
} from './invoice'
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

function hasInvoicePositionData(position: InvoiceLineDraft) {
  return Boolean(position.description.trim() || position.amount.trim())
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
    invoice.items.some(hasInvoicePositionData),
  )
}

function getInvoiceErrors(invoice: InvoiceDraft): InvoiceErrors {
  const result = invoiceFormSchema.safeParse(invoice)
  if (result.success) return {}

  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  )
}

function formattedEuro(cents: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  })
    .format(cents / 100)
    .replaceAll('\u00a0', ' ')
}

function suggestedPdfFilename(invoice: InvoiceDraft) {
  const safeNumber = invoice.number.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `Rechnung_${safeNumber}_${invoice.date}.pdf`
}

function savePdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/pdf' }),
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

type InvoicePositionEditor = {
  updateItem: (
    index: number,
    name: keyof InvoiceLineDraft,
    value: string,
  ) => void
  touch: (name: string) => void
  removeItem: (index: number) => void
  errors: InvoiceErrors
}

const InvoicePositionEditorContext =
  createContext<InvoicePositionEditor | null>(null)

function useInvoicePositionEditor() {
  const editor = useContext(InvoicePositionEditorContext)
  if (!editor) throw new Error('Rechnungspositionen benötigen einen Editor.')
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
      label={`Beschreibung Position ${index + 1}`}
      hideLabel
      required={hasInvoicePositionData(item)}
      value={item.description}
      onChange={(value) => updateItem(index, 'description', value)}
      onBlur={() => touch(`items.${index}.description`)}
      error={errors[`items.${index}.description`]}
      maxLength={85}
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
    <InvoiceInput
      id={`item-amount-${index}`}
      label={`Brutto in Euro Position ${index + 1}`}
      hideLabel
      required={hasInvoicePositionData(item)}
      value={item.amount}
      onChange={(value) => updateItem(index, 'amount', value)}
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
      aria-label={`Position ${index + 1} entfernen`}
      onClick={() => removeItem(index)}
    >
      <IconTrash aria-hidden="true" data-icon="inline-start" />
    </Button>
  )
}

const invoicePositionColumns: ColumnDef<{}, InvoiceLineDraft>[] = [
  { id: 'position', header: 'Nr.', cell: ({ row }) => row.index + 1 },
  {
    accessorKey: 'description',
    header: () => (
      <>
        Beschreibung
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
        Brutto in Euro
        <RequiredMark />
        <FieldHint label="Brutto in Euro">
          Positiver Bruttopreis in Euro, z. B. 107,00.
        </FieldHint>
      </div>
    ),
    cell: ({ row }) => <AmountCell index={row.index} item={row.original} />,
  },
  {
    id: 'actions',
    header: 'Aktion',
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
  const [year, month, day] = value.split('-').map(Number)
  const selected =
    year && month && day ? new Date(year, month - 1, day) : undefined

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id="invoice-date-label" className="min-h-6">
        Datum
        <RequiredMark />
      </FieldLabel>
      <span id="invoice-date-required" className="sr-only">
        Pflichtangabe.
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
          {selected
            ? new Intl.DateTimeFormat('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              }).format(selected)
            : 'Datum auswählen'}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={de}
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
  const profile = profileQuery.data
  const profileValidation = profile
    ? businessProfileSchema.safeParse(profile)
    : null
  const validProfile =
    profileValidation?.success === true ? profileValidation.data : null

  useEffect(() => {
    if (!profileQuery.isFetching && profileChanged) setProfileChanged(false)
  }, [profileChanged, profileQuery.data, profileQuery.isFetching])

  if (!mounted || !draftInitialized || profileQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-center" aria-live="polite">
          Unternehmensprofil wird lokal geladen …
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
              <AlertDialogTitle>Rechnungen sind gesperrt</AlertDialogTitle>
              <AlertDialogDescription>
                Das Unternehmensprofil kann nicht aus dem Browser gelesen
                werden. Prüfe die lokalen Speichereinstellungen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Schließen</AlertDialogCancel>
              <AlertDialogAction onClick={() => window.location.reload()}>
                Erneut laden
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
        <h1 className="heading-1">Unternehmensprofil vervollständigen</h1>
        <p className="paragraph">
          Richte dein Profil ein, bevor du die erste Rechnung ausfüllst.
        </p>
        <Link to="/business-profile" className={buttonVariants()}>
          Unternehmensprofil öffnen
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
        Object.keys(getInvoiceErrors(value)).length ||
        !profile ||
        storageError ||
        profileChanged
      )
        return

      setIsGenerating(true)
      try {
        await runPwaCriticalOperation(async () => {
          const bytes = await createInvoicePdf(profile, value)
          const filename = suggestedPdfFilename(value)
          savePdf(bytes, filename)
          toast.add({
            title: 'PDF wurde erstellt',
            description: 'Das PDF wurde heruntergeladen.',
            type: 'success',
          })
          void pwa?.reportPdfExport(filename)
        })
      } catch (error) {
        toast.add({
          title: 'PDF konnte nicht erstellt werden',
          description:
            error instanceof Error
              ? error.message
              : 'Bitte prüfe die Eingaben.',
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
    form.setFieldValue(name, value as never)
    invoiceDraftStore.setState(() => next)
  }

  function updateItem(
    index: number,
    name: keyof InvoiceLineDraft,
    value: string,
  ) {
    const items = [...form.state.values.items]
    items[index] = { ...items[index], [name]: value }
    form.setFieldValue('items', items)
    invoiceDraftStore.setState((current) => ({ ...current, items }))
  }

  function addItem() {
    setNewItemSubmitted(true)
    if (
      form.state.values.items.length >= 16 ||
      Boolean(newItemErrors.description || newItemErrors.amount)
    )
      return
    const items = [...form.state.values.items, { ...newItem }]
    form.setFieldValue('items', items)
    invoiceDraftStore.setState((current) => ({ ...current, items }))
    invoicePositionDraftStore.setState(() => ({ description: '', amount: '' }))
    setNewItemSubmitted(false)
  }

  function removeItem(index: number) {
    const items = form.state.values.items.filter(
      (_, itemIndex) => itemIndex !== index,
    )
    form.setFieldValue('items', items)
    invoiceDraftStore.setState((current) => ({ ...current, items }))
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
        title: 'Neue Rechnung konnte nicht begonnen werden',
        description:
          error instanceof Error
            ? error.message
            : 'Der gespeicherte Invoice Draft konnte nicht sicher entfernt werden.',
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
  const validationErrors = getInvoiceErrors(currentValues)
  const errors = Object.fromEntries(
    Object.entries(validationErrors).filter(([name]) => touched.has(name)),
  )
  const recipientMissing =
    !currentValues.company.trim() && !currentValues.name.trim()
  const recipientError =
    recipientMissing && (touched.has('company') || touched.has('name'))
      ? validationErrors.company
      : undefined
  const validInvoice = Object.keys(validationErrors).length === 0
  const newAmount = parseEuroAmount(newItem.amount)
  const newItemErrors = {
    description: !newItem.description.trim()
      ? 'Positionsbeschreibung fehlt.'
      : '',
    amount:
      newAmount === null || newAmount <= 0
        ? 'Einen positiven Bruttopreis eingeben.'
        : '',
  }
  const table = useTable({
    features: {},
    data: currentValues.items,
    columns: invoicePositionColumns,
  })
  const amounts = currentValues.items
    .filter(hasInvoicePositionData)
    .map((item) => parseEuroAmount(item.amount))
  const totals =
    amounts.length && amounts.every((amount) => amount !== null)
      ? calculateInvoiceTotals(amounts, currentValues.rate)
      : null

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-12">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="heading-1">Rechnung erstellen</h1>
            <p className="paragraph-large text-muted-foreground">
              Angaben eintragen, Beträge prüfen und das fertige PDF sichern.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={startNewInvoice}>
            <IconEdit data-icon="inline-start" />
            Neue Rechnung
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
                  ? 'Profil konnte nicht gespeichert werden'
                  : blocker === 'changed'
                    ? 'Unternehmensprofil wird aktualisiert'
                    : 'Profil vervollständigen, um das PDF zu erstellen'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {blocker === 'storage'
                  ? `${storageError} Rechnungen bleiben gesperrt, bis die lokale Speicherung wieder funktioniert.`
                  : blocker === 'changed'
                    ? 'Die PDF-Erstellung ist gesperrt, bis das geänderte Profil geladen wurde.'
                    : 'Die Rechnungseingaben bleiben in diesem Tab erhalten. Ergänze oder korrigiere das Unternehmensprofil.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Schließen</AlertDialogCancel>
              {blocker === 'profile' ? (
                <Link to="/business-profile" className={buttonVariants()}>
                  Unternehmensprofil öffnen
                </Link>
              ) : blocker === 'storage' ? (
                <AlertDialogAction onClick={() => window.location.reload()}>
                  Erneut laden
                </AlertDialogAction>
              ) : null}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Neue Rechnung beginnen?</AlertDialogTitle>
              <AlertDialogDescription>
                Die aktuellen Eingaben werden verworfen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={resetInvoice}>
                Neue Rechnung beginnen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {draftPersistence.error ? (
          <p role="alert" className="paragraph-small text-destructive">
            {draftPersistence.error} Die Eingaben bleiben in diesem Tab
            bearbeitbar, sind aber möglicherweise nicht wiederherstellbar.
          </p>
        ) : null}

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Rechnungsangaben</CardTitle>
              <CardDescription>
                Pflichtangaben sind mit * markiert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <InvoiceInput
                  id="invoice-number"
                  label="Rechnungsnummer"
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
                    label="Betreff"
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
              <CardTitle>Empfänger</CardTitle>
              <CardDescription>
                Unternehmen oder Name sowie vollständige Anschrift angeben.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <RequiredAlternativeFields
                  id="recipient-identity"
                  label="Unternehmen oder Name"
                  error={recipientError}
                >
                  <InvoiceInput
                    id="recipient-company"
                    label="Unternehmen des Empfängers"
                    value={currentValues.company}
                    onChange={(value) => updateField('company', value)}
                    error={recipientMissing ? undefined : errors.company}
                    onBlur={() => touch('company')}
                    maxLength={70}
                    autoComplete="organization"
                  />
                  <InvoiceInput
                    id="recipient-name"
                    label="Name / z. Hd."
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
                  label="Straße und Hausnummer"
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
                  label="PLZ"
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
                  label="Ort"
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
                Waren & Dienstleistungen
                <RequiredMark />
              </CardTitle>
              <CardDescription>
                Preise einschließlich MwSt. eingeben. Maximal 16 Positionen.
                Mindestens eine vollständige Position erforderlich. * gilt pro
                Position; leere Zeilen werden nicht berücksichtigt.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <InvoicePositionEditorContext.Provider
                value={{ updateItem, touch, removeItem, errors }}
              >
                <FieldGroup className="gap-0">
                  <Table
                    aria-label="Rechnungspositionen"
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
                            Noch keine Positionen hinzugefügt.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </FieldGroup>
              </InvoicePositionEditorContext.Provider>
              <form
                id="new-position-form"
                aria-label="Position hinzufügen"
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
                    label="Beschreibung"
                    required
                    value={newItem.description}
                    maxLength={85}
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
                  <InvoiceInput
                    id="new-item-amount"
                    label="Brutto in Euro"
                    required
                    hint="Positiver Bruttopreis in Euro, z. B. 107,00."
                    value={newItem.amount}
                    form="new-position-form"
                    onChange={(amount) =>
                      invoicePositionDraftStore.setState((current) => ({
                        ...current,
                        amount,
                      }))
                    }
                    error={newItemSubmitted ? newItemErrors.amount : undefined}
                  />
                  <Button
                    type="submit"
                    form="new-position-form"
                    className="md:mt-9"
                    variant="outline"
                    disabled={currentValues.items.length >= 16}
                  >
                    <IconPlus data-icon="inline-start" />
                    Position hinzufügen
                  </Button>
                </FieldGroup>
              </form>
              <Field data-invalid={Boolean(errors.rate)}>
                <FieldLabel id="vat-rate-label">
                  MwSt.-Satz
                  <RequiredMark />
                </FieldLabel>
                <span id="vat-rate-required" className="sr-only">
                  Pflichtangabe.
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
                      updateField('rate', Number(value) as VatRate)
                    }
                  }}
                >
                  <ToggleGroupItem value="7">7 %</ToggleGroupItem>
                  <ToggleGroupItem value="19">19 %</ToggleGroupItem>
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
            <CardTitle>Rechnungsübersicht</CardTitle>
            <CardDescription>
              {currentValues.number.trim() || '—'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between gap-4">
              <span>Netto</span>
              <strong>{totals ? formattedEuro(totals.net) : '—'}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>{currentValues.rate} % MwSt.</span>
              <strong>{totals ? formattedEuro(totals.tax) : '—'}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>Brutto</span>
              <strong>{totals ? formattedEuro(totals.gross) : '—'}</strong>
            </div>
            <p className="paragraph-small text-muted-foreground">
              Geschäftsangaben werden aus dem lokalen Unternehmensprofil
              übernommen.
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
            {isGenerating ? 'PDF wird erstellt …' : 'PDF erstellen'}
          </Button>
        </form>
      </aside>
    </div>
  )
}

export default InvoicePage
