import { useEffect, useState } from 'react'
import { useSelector } from '@tanstack/react-store'
import { useForm } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { businessProfileSchema } from './business-profile'
import type { BusinessProfileDraft } from './business-profile'
import {
  useBusinessProfile,
  useProfileStorageSync,
} from './business-profile-query'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import {
  createEmptyInvoiceDraft,
  invoiceDraftStore,
} from './invoice-draft-store'
import type { InvoiceDraft, InvoiceLineDraft, VatRate } from './invoice'
import {
  calculateInvoiceTotals,
  invoiceFormSchema,
  parseEuroAmount,
} from './invoice'
import { createInvoicePdf } from './pdf'

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
    invoice.company.trim() ||
    invoice.name.trim() ||
    invoice.street.trim() ||
    invoice.postalCode.trim() ||
    invoice.town.trim() ||
    invoice.items.some((item) => item.description.trim() || item.amount.trim()),
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

function savePdf(bytes: Uint8Array, invoice: InvoiceDraft) {
  const safeNumber = invoice.number.replace(/[^a-zA-Z0-9_-]/g, '_')
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `Rechnung_${safeNumber}_${invoice.date}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function InvoiceInput({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  required = false,
  maxLength,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  type?: string
  required?: boolean
  maxLength?: number
  autoComplete?: string
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </FieldLabel>
      <Input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function InvoicePage() {
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

  if (profileQuery.isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12" aria-live="polite">
        Unternehmensprofil wird lokal geladen …
      </main>
    )
  }

  if (profileQuery.isError) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <Alert variant="destructive">
          <AlertTitle>Rechnungen sind gesperrt</AlertTitle>
          <AlertDescription>
            Das Unternehmensprofil kann nicht aus dem Browser gelesen werden.
            Prüfe die lokalen Speichereinstellungen.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (!validProfile && !hasInvoiceData(invoice)) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold">
          Unternehmensprofil vervollständigen
        </h1>
        <p>Richte dein Profil ein, bevor du die erste Rechnung ausfüllst.</p>
        <Link
          to="/business-profile"
          className="text-primary underline underline-offset-4"
        >
          Unternehmensprofil öffnen
        </Link>
      </main>
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
  const [errors, setErrors] = useState<InvoiceErrors>({})
  const [generalError, setGeneralError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const form = useForm({
    defaultValues: draft,
    onSubmit: async ({ value }) => {
      const nextErrors = getInvoiceErrors(value)
      setErrors(nextErrors)
      setGeneralError('')
      setSuccessMessage('')

      if (Object.keys(nextErrors).length > 0) {
        setGeneralError('Bitte prüfe die markierten Rechnungsangaben.')
        return
      }
      if (!profile || !businessProfileSchema.safeParse(profile).success) {
        setGeneralError(
          'Das Unternehmensprofil ist unvollständig. Deine Rechnungseingaben bleiben erhalten.',
        )
        return
      }
      if (storageError) {
        setGeneralError(storageError)
        return
      }
      if (profileChanged) {
        setGeneralError(
          'Das Unternehmensprofil wird gerade in einem anderen Tab aktualisiert. Bitte warte kurz und prüfe es erneut.',
        )
        return
      }

      setIsGenerating(true)
      try {
        const bytes = await createInvoicePdf(profile, value)
        savePdf(bytes, value)
        setSuccessMessage('Das PDF wurde erstellt und heruntergeladen.')
      } catch (error) {
        setGeneralError(
          error instanceof Error
            ? error.message
            : 'Das PDF konnte nicht erstellt werden. Bitte prüfe die Eingaben.',
        )
      } finally {
        setIsGenerating(false)
      }
    },
  })

  useEffect(() => {
    if (form.state.values.date) return
    const initial = { ...form.state.values, date: localDate() }
    form.reset(initial)
    invoiceDraftStore.setState(() => initial)
  }, [form])

  function updateField<TName extends InvoiceFieldName>(
    name: TName,
    value: InvoiceDraft[TName],
  ) {
    const next = { ...form.state.values, [name]: value }
    form.setFieldValue(name, value as never)
    invoiceDraftStore.setState(() => next)
    setErrors({})
    setGeneralError('')
    setSuccessMessage('')
  }

  function updateItem(
    index: number,
    name: keyof InvoiceLineDraft,
    value: string,
  ) {
    const items = [...form.state.values.items]
    const item = items[index]
    items[index] = { ...item, [name]: value }
    form.setFieldValue('items', items)
    invoiceDraftStore.setState((current) => ({ ...current, items }))
    setErrors({})
    setGeneralError('')
    setSuccessMessage('')
  }

  function addItem() {
    if (form.state.values.items.length >= 16) return
    const items = [...form.state.values.items, { description: '', amount: '' }]
    form.setFieldValue('items', items)
    invoiceDraftStore.setState((current) => ({ ...current, items }))
  }

  function removeItem(index: number) {
    if (form.state.values.items.length <= 1) return
    const items = form.state.values.items.filter(
      (_, itemIndex) => itemIndex !== index,
    )
    form.setFieldValue('items', items)
    invoiceDraftStore.setState((current) => ({ ...current, items }))
    setErrors({})
  }

  function startNewInvoice() {
    if (
      hasInvoiceData(form.state.values) &&
      !window.confirm(
        'Neue Rechnung beginnen? Die aktuellen Eingaben werden verworfen.',
      )
    ) {
      return
    }

    const freshInvoice = { ...createEmptyInvoiceDraft(), date: localDate() }
    form.reset(freshInvoice)
    invoiceDraftStore.setState(() => freshInvoice)
    setErrors({})
    setGeneralError('')
    setSuccessMessage('')
  }

  const currentValues = form.state.values
  const amounts = currentValues.items
    .filter((item) => item.description.trim() || item.amount.trim())
    .map((item) => parseEuroAmount(item.amount))
  const totals =
    amounts.length && amounts.every((amount) => amount !== null)
      ? calculateInvoiceTotals(amounts, currentValues.rate)
      : null

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-12">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {profile?.businessName ?? 'regningen'} · Rechnung
            </p>
            <h1 className="font-serif text-3xl font-semibold">
              Rechnung erstellen
            </h1>
            <p className="text-muted-foreground">
              Angaben eintragen, Beträge prüfen und das fertige PDF sichern.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={startNewInvoice}>
            Neue Rechnung
          </Button>
        </div>

        {!profile && (
          <Alert variant="destructive">
            <AlertTitle>
              Profil vervollständigen, um das PDF zu erstellen
            </AlertTitle>
            <AlertDescription>
              Die Rechnungseingaben bleiben in diesem Tab erhalten. Ergänze oder
              korrigiere das Profil und erstelle danach das PDF.
              <Link
                to="/business-profile"
                className="ml-1 font-medium underline underline-offset-4"
              >
                Unternehmensprofil öffnen
              </Link>
            </AlertDescription>
          </Alert>
        )}
        {storageError && (
          <Alert variant="destructive">
            <AlertTitle>Profil konnte nicht gespeichert werden</AlertTitle>
            <AlertDescription>
              {storageError} Rechnungen bleiben gesperrt, bis die lokale
              Speicherung wieder funktioniert.
            </AlertDescription>
          </Alert>
        )}
        {profileChanged && (
          <Alert>
            <AlertTitle>Unternehmensprofil wird aktualisiert</AlertTitle>
            <AlertDescription>
              Die PDF-Erstellung ist kurzzeitig gesperrt, bis das geänderte
              Profil aus diesem Browser geladen wurde.
            </AlertDescription>
          </Alert>
        )}
        {generalError && (
          <Alert variant="destructive">
            <AlertTitle>Rechnung konnte nicht erstellt werden</AlertTitle>
            <AlertDescription>{generalError}</AlertDescription>
          </Alert>
        )}
        {successMessage && (
          <Alert>
            <AlertTitle>PDF erstellt</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Rechnungsangaben</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <InvoiceInput
                  id="invoice-number"
                  label="Rechnungsnummer"
                  value={currentValues.number}
                  onChange={(value) => updateField('number', value)}
                  error={errors.number}
                  required
                  maxLength={40}
                />
                <InvoiceInput
                  id="invoice-date"
                  label="Datum"
                  value={currentValues.date}
                  onChange={(value) => updateField('date', value)}
                  error={errors.date}
                  required
                  type="date"
                />
                <div className="md:col-span-2">
                  <InvoiceInput
                    id="invoice-subject"
                    label="Betreff"
                    value={currentValues.subject}
                    onChange={(value) => updateField('subject', value)}
                    error={errors.subject}
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
                <InvoiceInput
                  id="recipient-company"
                  label="Unternehmen des Empfängers"
                  value={currentValues.company}
                  onChange={(value) => updateField('company', value)}
                  error={errors.company}
                  maxLength={70}
                  autoComplete="organization"
                />
                <InvoiceInput
                  id="recipient-name"
                  label="Name / z. Hd."
                  value={currentValues.name}
                  onChange={(value) => updateField('name', value)}
                  error={errors.name}
                  maxLength={70}
                  autoComplete="name"
                />
                <InvoiceInput
                  id="recipient-street"
                  label="Straße und Hausnummer"
                  value={currentValues.street}
                  onChange={(value) => updateField('street', value)}
                  error={errors.street}
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
                  required
                  maxLength={85}
                  autoComplete="address-level2"
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Waren & Dienstleistungen</CardTitle>
              <CardDescription>
                Preise einschließlich MwSt. eingeben. Maximal 16 Positionen.
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-5">
              <FieldGroup className="flex flex-col gap-5">
                {currentValues.items.map((item, index) => (
                  <div
                    key={index}
                    className="grid items-end gap-4 border-b pb-4 last:border-b-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
                  >
                    <InvoiceInput
                      id={`item-description-${index}`}
                      label={`Beschreibung Position ${index + 1}`}
                      value={item.description}
                      onChange={(value) =>
                        updateItem(index, 'description', value)
                      }
                      error={errors[`items.${index}.description`]}
                      maxLength={85}
                    />
                    <InvoiceInput
                      id={`item-amount-${index}`}
                      label={`Brutto in Euro Position ${index + 1}`}
                      value={item.amount}
                      onChange={(value) => updateItem(index, 'amount', value)}
                      error={errors[`items.${index}.amount`]}
                      type="text"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={currentValues.items.length <= 1}
                      aria-label={`Position ${index + 1} entfernen`}
                      onClick={() => removeItem(index)}
                    >
                      Entfernen
                    </Button>
                  </div>
                ))}
              </FieldGroup>
              {errors.items && <FieldError>{errors.items}</FieldError>}
              <Button
                type="button"
                variant="outline"
                disabled={currentValues.items.length >= 16}
                onClick={addItem}
              >
                + Position hinzufügen
              </Button>

              <Field data-invalid={Boolean(errors.rate)}>
                <FieldLabel id="vat-rate-label">MwSt.-Satz</FieldLabel>
                <ToggleGroup
                  value={[String(currentValues.rate)]}
                  aria-labelledby="vat-rate-label"
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
              </Field>
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={
              isGenerating ||
              profileChanged ||
              !profile ||
              Boolean(storageError)
            }
          >
            {isGenerating ? 'PDF wird erstellt …' : 'PDF erstellen'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Das PDF enthält das gewählte Datum fest. Eine neue Rechnung beginnt
            mit leeren Eingaben. Rechnungseingaben werden nicht gespeichert.
          </p>
        </form>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Rechnungsübersicht</CardTitle>
            <CardDescription>
              {currentValues.number.trim() || 'Neue Rechnung'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between gap-4">
              <span>Brutto</span>
              <strong>{totals ? formattedEuro(totals.gross) : '—'}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>Netto</span>
              <strong>{totals ? formattedEuro(totals.net) : '—'}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>{currentValues.rate} % MwSt.</span>
              <strong>{totals ? formattedEuro(totals.tax) : '—'}</strong>
            </div>
            <p className="text-sm text-muted-foreground">
              Geschäftsangaben werden aus dem lokalen Unternehmensprofil
              übernommen.
            </p>
          </CardContent>
        </Card>
      </aside>
    </main>
  )
}

export default InvoicePage
