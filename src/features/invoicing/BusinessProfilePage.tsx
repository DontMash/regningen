import { useCallback, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useSelector } from '@tanstack/react-store'
import { useNavigate } from '@tanstack/react-router'
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { businessProfileSchema, emptyBusinessProfile } from './business-profile'
import type { BusinessProfileDraft } from './business-profile'
import { createBrowserBusinessProfileRepository } from './business-profile-repository'
import {
  useBusinessProfile,
  useDeleteBusinessProfile,
  useImportBusinessProfile,
  useProfileStorageSync,
  useSaveBusinessProfile,
} from './business-profile-query'
import { businessProfileStorageStatus } from './business-profile-storage-status'

type ProfileFieldName = keyof BusinessProfileDraft

function ProfileInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  required = false,
  type = 'text',
  description,
  autoComplete,
  maxLength,
}: {
  id: ProfileFieldName
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  error?: string
  required?: boolean
  type?: string
  description?: string
  autoComplete?: string
  maxLength?: number
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
        onBlur={onBlur}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function getProfileErrors(profile: BusinessProfileDraft) {
  const result = businessProfileSchema.safeParse(profile)
  if (result.success) return {}

  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  ) as Partial<Record<ProfileFieldName, string>>
}

function downloadBackup(contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'regningen-unternehmensprofil.json'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function BusinessProfilePage() {
  const profileQuery = useBusinessProfile()

  if (profileQuery.isPending) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        Unternehmensprofil wird lokal geladen …
      </main>
    )
  }

  if (profileQuery.isError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Alert variant="destructive">
          <AlertTitle>Unternehmensprofil nicht verfügbar</AlertTitle>
          <AlertDescription>
            Der Browser kann das Profil nicht lesen. Prüfe die lokalen
            Speichereinstellungen und lade die Seite erneut.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  return <ProfileEditor profile={profileQuery.data ?? emptyBusinessProfile} />
}

function ProfileEditor({ profile }: { profile: BusinessProfileDraft }) {
  const navigate = useNavigate()
  const saveMutation = useSaveBusinessProfile()
  const importMutation = useImportBusinessProfile()
  const deleteMutation = useDeleteBusinessProfile()
  const storageError = useSelector(
    businessProfileStorageStatus,
    (state) => state.error,
  )
  const [errors, setErrors] = useState<
    Partial<Record<ProfileFieldName, string>>
  >({})
  const [message, setMessage] = useState('')
  const [storageConflict, setStorageConflict] = useState(false)
  const validProfile = businessProfileSchema.safeParse(profile).success

  const handleExternalChange = useCallback(() => {
    setStorageConflict(true)
  }, [])
  useProfileStorageSync(handleExternalChange)

  const form = useForm({
    defaultValues: profile,
    onSubmit: async ({ value }) => {
      const nextErrors = getProfileErrors(value)
      setErrors(nextErrors)
      setMessage('')
      if (Object.keys(nextErrors).length > 0) return

      try {
        await saveMutation.mutateAsync(value)
        await navigate({ to: '/invoice' })
      } catch {
        setMessage(
          'Das Profil konnte nicht auf diesem Gerät gespeichert werden.',
        )
      }
    },
  })

  const save = (nextProfile: BusinessProfileDraft) => {
    setMessage('')
    saveMutation.mutate(nextProfile)
  }
  const clearErrors = () => setErrors({})
  const changeProfileField = (name: ProfileFieldName, value: string) => {
    const nextProfile = { ...form.state.values, [name]: value }
    form.setFieldValue(name, value)
    clearErrors()
    if (!storageConflict) save(nextProfile)
  }

  async function exportProfile() {
    try {
      const contents =
        await createBrowserBusinessProfileRepository().exportProfile()
      downloadBackup(contents)
      setMessage(
        'Sicherung erstellt. Die Datei enthält sensible, unverschlüsselte Daten.',
      )
    } catch {
      setMessage('Die Profilsicherung konnte nicht erstellt werden.')
    }
  }

  async function importProfile(file: File | undefined) {
    if (!file) return
    setMessage('')

    if (
      Object.values(profile).some((value) => value.trim()) &&
      !window.confirm('Das vorhandene Unternehmensprofil ersetzen?')
    ) {
      return
    }

    try {
      const imported = await importMutation.mutateAsync(await file.text())
      form.reset(imported)
      setErrors({})
      setMessage('Profilsicherung auf diesem Gerät wiederhergestellt.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Die Profilsicherung konnte nicht importiert werden.',
      )
    }
  }

  async function deleteProfile() {
    if (
      !window.confirm(
        'Unternehmensprofil löschen? Heruntergeladene PDFs bleiben erhalten.',
      )
    ) {
      return
    }

    try {
      await deleteMutation.mutateAsync()
      form.reset(emptyBusinessProfile)
      setErrors({})
      setMessage(
        'Profil gelöscht. Die Rechnungseingaben bleiben in diesem Tab erhalten.',
      )
    } catch {
      setMessage('Das Profil konnte nicht aus diesem Browser gelöscht werden.')
    }
  }

  const mutationError =
    saveMutation.isError || importMutation.isError || deleteMutation.isError

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:py-14">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          regningen · Unternehmensprofil
        </p>
        <h1 className="font-serif text-3xl font-semibold">
          {validProfile
            ? 'Unternehmensprofil'
            : 'Unternehmensprofil einrichten'}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Die Angaben werden nur in diesem Browser gespeichert und für deine
          Rechnungen verwendet. Es gibt kein Benutzerkonto und keine
          Rechnungsablage.
        </p>
      </div>

      {storageConflict && (
        <Alert variant="destructive">
          <AlertTitle>Profil in einem anderen Tab geändert</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            Lade das Profil neu, bevor du hier weiterarbeitest. Noch nicht
            gespeicherte Änderungen in diesem Formular gehen beim Neuladen
            verloren.
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Profil neu laden
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Angaben für den Rechnungsaussteller</CardTitle>
          <CardDescription>
            Pflichtangaben sind mit * markiert. Eine deutsche USt-IdNr. hat das
            Format DE plus neun Ziffern; alternativ kann eine Steuernummer
            angegeben werden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <fieldset disabled={storageConflict} className="min-w-0">
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <form.Field name="businessName">
                  {(field) => (
                    <ProfileInput
                      id="businessName"
                      label="Unternehmensname"
                      value={field.state.value}
                      required
                      maxLength={70}
                      autoComplete="organization"
                      error={errors.businessName}
                      onBlur={field.handleBlur}
                      onChange={(value) =>
                        changeProfileField('businessName', value)
                      }
                    />
                  )}
                </form.Field>
                <form.Field name="serviceDescription">
                  {(field) => (
                    <ProfileInput
                      id="serviceDescription"
                      label="Leistungsbeschreibung"
                      value={field.state.value}
                      maxLength={70}
                      autoComplete="off"
                      error={errors.serviceDescription}
                      onBlur={field.handleBlur}
                      onChange={(value) =>
                        changeProfileField('serviceDescription', value)
                      }
                    />
                  )}
                </form.Field>
                <form.Field name="ownerName">
                  {(field) => (
                    <ProfileInput
                      id="ownerName"
                      label="Inhaber/in"
                      value={field.state.value}
                      required
                      maxLength={70}
                      autoComplete="name"
                      error={errors.ownerName}
                      onBlur={field.handleBlur}
                      onChange={(value) =>
                        changeProfileField('ownerName', value)
                      }
                    />
                  )}
                </form.Field>
                <form.Field name="street">
                  {(field) => (
                    <ProfileInput
                      id="street"
                      label="Straße und Hausnummer"
                      value={field.state.value}
                      required
                      maxLength={85}
                      autoComplete="street-address"
                      error={errors.street}
                      onBlur={field.handleBlur}
                      onChange={(value) => changeProfileField('street', value)}
                    />
                  )}
                </form.Field>
                <form.Field name="postalCode">
                  {(field) => (
                    <ProfileInput
                      id="postalCode"
                      label="Postleitzahl"
                      value={field.state.value}
                      required
                      maxLength={20}
                      autoComplete="postal-code"
                      error={errors.postalCode}
                      onBlur={field.handleBlur}
                      onChange={(value) =>
                        changeProfileField('postalCode', value)
                      }
                    />
                  )}
                </form.Field>
                <form.Field name="town">
                  {(field) => (
                    <ProfileInput
                      id="town"
                      label="Ort"
                      value={field.state.value}
                      required
                      maxLength={50}
                      autoComplete="address-level2"
                      error={errors.town}
                      onBlur={field.handleBlur}
                      onChange={(value) => changeProfileField('town', value)}
                    />
                  )}
                </form.Field>
                <form.Field name="phone">
                  {(field) => (
                    <ProfileInput
                      id="phone"
                      label="Telefon"
                      value={field.state.value}
                      type="tel"
                      maxLength={40}
                      autoComplete="tel"
                      error={errors.phone}
                      onBlur={field.handleBlur}
                      onChange={(value) => changeProfileField('phone', value)}
                    />
                  )}
                </form.Field>
                <form.Field name="mobile">
                  {(field) => (
                    <ProfileInput
                      id="mobile"
                      label="Mobiltelefon"
                      value={field.state.value}
                      type="tel"
                      maxLength={40}
                      autoComplete="tel-national"
                      error={errors.mobile}
                      onBlur={field.handleBlur}
                      onChange={(value) => changeProfileField('mobile', value)}
                    />
                  )}
                </form.Field>
                <form.Field name="iban">
                  {(field) => (
                    <ProfileInput
                      id="iban"
                      label="IBAN"
                      value={field.state.value}
                      maxLength={42}
                      required
                      autoComplete="off"
                      error={errors.iban}
                      onBlur={field.handleBlur}
                      onChange={(value) => changeProfileField('iban', value)}
                    />
                  )}
                </form.Field>
                <form.Field name="vatId">
                  {(field) => (
                    <ProfileInput
                      id="vatId"
                      label="USt-IdNr."
                      value={field.state.value}
                      maxLength={14}
                      autoComplete="off"
                      description="Optional, wenn eine Steuernummer angegeben wird."
                      error={errors.vatId}
                      onBlur={field.handleBlur}
                      onChange={(value) => changeProfileField('vatId', value)}
                    />
                  )}
                </form.Field>
                <form.Field name="taxNumber">
                  {(field) => (
                    <ProfileInput
                      id="taxNumber"
                      label="Steuernummer"
                      value={field.state.value}
                      autoComplete="off"
                      description="Optional, wenn eine USt-IdNr. angegeben wird."
                      maxLength={30}
                      error={errors.taxNumber}
                      onBlur={field.handleBlur}
                      onChange={(value) =>
                        changeProfileField('taxNumber', value)
                      }
                    />
                  )}
                </form.Field>
              </FieldGroup>
            </fieldset>

            {storageError && (
              <Alert className="mt-4" variant="destructive">
                <AlertTitle>Profil konnte nicht gespeichert werden</AlertTitle>
                <AlertDescription>
                  {storageError} Prüfe die Speichereinstellungen des Browsers.
                </AlertDescription>
              </Alert>
            )}
            {message && (
              <p
                className="mt-4 text-sm"
                role={mutationError ? 'alert' : 'status'}
              >
                {message}
              </p>
            )}
            {saveMutation.isPending && (
              <p className="mt-4 text-sm text-muted-foreground" role="status">
                Änderungen werden auf diesem Gerät gespeichert …
              </p>
            )}
            {Object.values(profile).some((value) => value.trim()) &&
              !saveMutation.isPending &&
              !mutationError && (
                <p className="mt-4 text-sm text-muted-foreground" role="status">
                  Änderungen werden automatisch auf diesem Gerät gespeichert.
                </p>
              )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={storageConflict || saveMutation.isPending}
              >
                Profil speichern und Rechnung erstellen
              </Button>
              {validProfile && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={storageConflict}
                  onClick={() => void navigate({ to: '/invoice' })}
                >
                  Zur Rechnung
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profil sichern</CardTitle>
          <CardDescription>
            Sicherungen sind unverschlüsselte JSON-Dateien mit sensiblen
            Unternehmensdaten. Bewahre sie geschützt auf.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Button
            type="button"
            variant="outline"
            disabled={
              !Object.values(profile).some((value) => value.trim()) ||
              storageConflict
            }
            onClick={() => void exportProfile()}
          >
            Sicherung exportieren
          </Button>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="profile-import">
              Sicherung importieren
            </FieldLabel>
            <Input
              id="profile-import"
              type="file"
              accept="application/json,.json"
              disabled={storageConflict}
              onChange={(event) => {
                void importProfile(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
            />
          </Field>
        </CardContent>
      </Card>

      {Object.values(profile).some((value) => value.trim()) && (
        <Card>
          <CardHeader>
            <CardTitle>Unternehmensprofil löschen</CardTitle>
            <CardDescription>
              Bereits heruntergeladene PDFs werden dadurch nicht gelöscht.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="destructive"
              disabled={storageConflict}
              onClick={() => void deleteProfile()}
            >
              Profil löschen
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
