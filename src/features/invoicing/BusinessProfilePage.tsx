import { useCallback, useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { useForm } from '@tanstack/react-form'
import { useSelector } from '@tanstack/react-store'
import { useNavigate } from '@tanstack/react-router'
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
import { FormInput, RequiredAlternativeFields } from './FormFields'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
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
import {
  IconDeviceFloppy,
  IconDownload,
  IconReload,
  IconReplace,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'

type ProfileFieldName = keyof BusinessProfileDraft

function ProfileInput({
  hint,
  maxLength,
  ...props
}: Omit<ComponentProps<typeof FormInput>, 'id'> & { id: ProfileFieldName }) {
  const inputHint = [
    hint,
    maxLength ? `Maximal ${maxLength} Zeichen.` : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <FormInput {...props} maxLength={maxLength} hint={inputHint || undefined} />
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const profileQuery = useBusinessProfile()

  if (!mounted || profileQuery.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12" aria-live="polite">
        Unternehmensprofil wird lokal geladen …
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unternehmensprofil nicht verfügbar
            </AlertDialogTitle>
            <AlertDialogDescription>
              Der Browser kann das Profil nicht lesen. Prüfe die lokalen
              Speichereinstellungen und lade die Seite erneut.
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
  const [storageConflict, setStorageConflict] = useState(false)
  const [storageDialogOpen, setStorageDialogOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleExternalChange = useCallback(() => {
    setStorageConflict(true)
    setStorageDialogOpen(true)
  }, [])
  useProfileStorageSync(handleExternalChange)

  useEffect(() => {
    if (storageError) setStorageDialogOpen(true)
  }, [storageError])

  const form = useForm({
    defaultValues: profile,
    onSubmit: async ({ value }) => {
      if (
        storageConflict ||
        storageError ||
        !businessProfileSchema.safeParse(value).success
      )
        return

      try {
        await saveMutation.mutateAsync(value)
      } catch {
        toast.add({
          title: 'Profil konnte nicht gespeichert werden.',
          type: 'error',
        })
        return
      }

      toast.add({ title: 'Profil gespeichert.', type: 'success' })
      await navigate({ to: '/invoice' })
    },
  })

  const changeProfileField = (name: ProfileFieldName, value: string) => {
    const nextProfile = { ...form.state.values, [name]: value }
    form.setFieldValue(name, value)
    if (!storageConflict && !storageError) {
      saveMutation.mutate(nextProfile, {
        onError: () => {
          toast.add({
            title: 'Profil konnte nicht gespeichert werden.',
            type: 'error',
          })
        },
      })
    }
  }

  async function exportProfile() {
    try {
      const contents =
        await createBrowserBusinessProfileRepository().exportProfile()
      downloadBackup(contents)
      toast.add({
        title: 'Sicherung erstellt.',
        description: 'Die Datei enthält sensible, unverschlüsselte Daten.',
        type: 'success',
      })
    } catch {
      toast.add({
        title: 'Die Profilsicherung konnte nicht erstellt werden.',
        type: 'error',
      })
    }
  }

  async function importProfile(file: File) {
    try {
      const imported = await importMutation.mutateAsync(await file.text())
      form.reset(imported)
      toast.add({
        title: 'Profilsicherung wiederhergestellt.',
        type: 'success',
      })
    } catch (error) {
      toast.add({
        title: 'Die Profilsicherung konnte nicht importiert werden.',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      })
    }
  }

  async function deleteProfile() {
    try {
      await deleteMutation.mutateAsync()
      form.reset(emptyBusinessProfile)
      toast.add({
        title: 'Profil gelöscht.',
        description: 'Die Rechnungseingaben bleiben in diesem Tab erhalten.',
        type: 'success',
      })
    } catch {
      toast.add({
        title: 'Das Profil konnte nicht aus diesem Browser gelöscht werden.',
        type: 'error',
      })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:py-14">
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">Unternehmensprofil</h1>
        <p className="paragraph-large max-w-2xl text-muted-foreground">
          Die Angaben werden nur in diesem Browser gespeichert und für deine
          Rechnungen verwendet. Es gibt kein Benutzerkonto und keine
          Rechnungsablage.
        </p>
      </div>

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
            <fieldset
              disabled={storageConflict || Boolean(storageError)}
              className="min-w-0"
            >
              <form.Subscribe
                selector={(state) => ({
                  errors: getProfileErrors(state.values),
                  taxIdentifiersMissing:
                    !state.values.vatId.trim() &&
                    !state.values.taxNumber.trim(),
                  taxIdentifiersTouched: Boolean(
                    state.fieldMeta.vatId?.isTouched ||
                    state.fieldMeta.taxNumber?.isTouched,
                  ),
                })}
              >
                {({ errors, taxIdentifiersMissing, taxIdentifiersTouched }) => (
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
                          error={
                            field.state.meta.isTouched
                              ? errors.businessName
                              : undefined
                          }
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
                          error={
                            field.state.meta.isTouched
                              ? errors.serviceDescription
                              : undefined
                          }
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
                          error={
                            field.state.meta.isTouched
                              ? errors.ownerName
                              : undefined
                          }
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
                          error={
                            field.state.meta.isTouched
                              ? errors.street
                              : undefined
                          }
                          onBlur={field.handleBlur}
                          onChange={(value) =>
                            changeProfileField('street', value)
                          }
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
                          error={
                            field.state.meta.isTouched
                              ? errors.postalCode
                              : undefined
                          }
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
                          error={
                            field.state.meta.isTouched ? errors.town : undefined
                          }
                          onBlur={field.handleBlur}
                          onChange={(value) =>
                            changeProfileField('town', value)
                          }
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
                          error={
                            field.state.meta.isTouched
                              ? errors.phone
                              : undefined
                          }
                          onBlur={field.handleBlur}
                          onChange={(value) =>
                            changeProfileField('phone', value)
                          }
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
                          error={
                            field.state.meta.isTouched
                              ? errors.mobile
                              : undefined
                          }
                          onBlur={field.handleBlur}
                          onChange={(value) =>
                            changeProfileField('mobile', value)
                          }
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
                          hint="Die IBAN muss gültig sein. Leerzeichen sind erlaubt."
                          error={
                            field.state.meta.isTouched ? errors.iban : undefined
                          }
                          onBlur={field.handleBlur}
                          onChange={(value) =>
                            changeProfileField('iban', value)
                          }
                        />
                      )}
                    </form.Field>
                    <RequiredAlternativeFields
                      id="profile-tax-identifiers"
                      label="USt-IdNr. oder Steuernummer"
                      error={
                        taxIdentifiersMissing && taxIdentifiersTouched
                          ? errors.vatId
                          : undefined
                      }
                    >
                      <form.Field name="vatId">
                        {(field) => (
                          <ProfileInput
                            id="vatId"
                            label="USt-IdNr."
                            value={field.state.value}
                            maxLength={14}
                            autoComplete="off"
                            hint="Eine deutsche USt-IdNr. besteht aus DE und neun Ziffern. Alternativ kannst du eine Steuernummer angeben."
                            error={
                              !taxIdentifiersMissing &&
                              field.state.meta.isTouched
                                ? errors.vatId
                                : undefined
                            }
                            onBlur={field.handleBlur}
                            onChange={(value) =>
                              changeProfileField('vatId', value)
                            }
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
                            hint="Optional, wenn eine USt-IdNr. angegeben wird."
                            maxLength={30}
                            error={
                              field.state.meta.isTouched
                                ? errors.taxNumber
                                : undefined
                            }
                            onBlur={field.handleBlur}
                            onChange={(value) =>
                              changeProfileField('taxNumber', value)
                            }
                          />
                        )}
                      </form.Field>
                    </RequiredAlternativeFields>
                  </FieldGroup>
                )}
              </form.Subscribe>
            </fieldset>

            <div className="mt-6 flex flex-wrap gap-3">
              <form.Subscribe
                selector={(state) =>
                  businessProfileSchema.safeParse(state.values).success
                }
              >
                {(valid) => (
                  <Button
                    type="submit"
                    disabled={
                      !valid ||
                      storageConflict ||
                      Boolean(storageError) ||
                      saveMutation.isPending
                    }
                  >
                    <IconDeviceFloppy data-icon="inline-start" />
                    Profil speichern
                  </Button>
                )}
              </form.Subscribe>
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
              storageConflict ||
              Boolean(storageError)
            }
            onClick={() => void exportProfile()}
          >
            <IconDownload data-icon="inline-start" />
            Sicherung exportieren
          </Button>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="profile-import">
              <IconUpload data-icon="inline-start" />
              Sicherung importieren
            </FieldLabel>
            <Input
              id="profile-import"
              type="file"
              accept="application/json,.json"
              disabled={storageConflict || Boolean(storageError)}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (!file) return
                if (
                  Object.values(profile).some((value) => value.trim()) ||
                  Object.values(form.state.values).some((value) => value.trim())
                ) {
                  setPendingImport(file)
                } else {
                  void importProfile(file)
                }
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
              disabled={storageConflict || Boolean(storageError)}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <IconTrash data-icon="inline-start" />
              Profil löschen
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unternehmensprofil ersetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die importierte Sicherung überschreibt das vorhandene Profil auf
              diesem Gerät.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={
                storageConflict ||
                Boolean(storageError) ||
                importMutation.isPending
              }
              onClick={() => {
                if (pendingImport) void importProfile(pendingImport)
                setPendingImport(null)
              }}
            >
              <IconReplace data-icon="inline-start" />
              Profil ersetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unternehmensprofil löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Heruntergeladene PDFs bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={
                storageConflict ||
                Boolean(storageError) ||
                deleteMutation.isPending
              }
              onClick={() => {
                setDeleteDialogOpen(false)
                void deleteProfile()
              }}
            >
              <IconTrash data-icon="inline-start" />
              Profil löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={storageDialogOpen} onOpenChange={setStorageDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {storageConflict
                ? 'Profil in einem anderen Tab geändert'
                : 'Profil konnte nicht gespeichert werden'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {storageConflict
                ? 'Lade das Profil neu, bevor du hier weiterarbeitest. Noch nicht gespeicherte Änderungen in diesem Formular gehen beim Neuladen verloren.'
                : `${storageError} Prüfe die Speichereinstellungen des Browsers und lade die Seite erneut.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Schließen</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => window.location.reload()}
            >
              <IconReload data-icon="inline-start" />
              Profil neu laden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
