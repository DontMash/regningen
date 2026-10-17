import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { useForm } from '@tanstack/react-form'
import { useSelector } from '@tanstack/react-store'
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
import { FormInput, RequiredAlternativeFields } from './FormFields'
import { Button, buttonVariants } from '@/components/ui/button'
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
import * as m from '@/paraglide/messages'
import { businessProfileSchema, emptyBusinessProfile } from './business-profile'
import type { BusinessProfileDraft } from './business-profile'
import {
  createBrowserBusinessProfileRepository,
  parseBusinessProfileBackup,
} from './business-profile-repository'
import {
  useBusinessProfile,
  useDeleteBusinessProfile,
  useProfileStorageSync,
  useSaveBusinessProfile,
} from './business-profile-query'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import { getApplicationResetGeneration } from '@/features/settings/reset-generation'
import {
  registerProfileDiscardHandler,
  setUnsavedProfileChanges,
} from '@/features/settings/unsaved-profile'
import {
  IconDeviceFloppy,
  IconDownload,
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
  const inputHint = maxLength
    ? hint
      ? m.form_hint_with_maximum_characters({ hint, limit: maxLength })
      : m.form_maximum_characters({ limit: maxLength })
    : hint
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
  link.download = m.profile_backup_filename()
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
      <div className="py-6" aria-live="polite">
        {m.profile_loading()}
      </div>
    )
  }

  if (profileQuery.isError && profileQuery.data === undefined) {
    return (
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.profile_unavailable_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.profile_unavailable_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.profile_close()}</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.reload()}>
              {m.profile_reload()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <ProfileEditor
      profile={profileQuery.data ?? null}
      retryProfileRead={async () => (await profileQuery.refetch()).isSuccess}
    />
  )
}

function ProfileEditor({
  profile,
  retryProfileRead,
}: {
  profile: BusinessProfileDraft | null
  retryProfileRead: () => Promise<boolean>
}) {
  // Query refreshes update saved-profile actions, never this tab's working form.
  const [initialProfile] = useState(profile ?? emptyBusinessProfile)
  const savedBaseline = useRef(initialProfile)
  const [resetGeneration] = useState(getApplicationResetGeneration)
  const saveMutation = useSaveBusinessProfile(resetGeneration)
  const deleteMutation = useDeleteBusinessProfile(resetGeneration)
  const storageError = useSelector(
    businessProfileStorageStatus,
    (state) => state.error,
  )
  const [storageDialogOpen, setStorageDialogOpen] = useState(false)
  const [retryingStorage, setRetryingStorage] = useState(false)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useProfileStorageSync()

  useEffect(() => {
    if (storageError) setStorageDialogOpen(true)
  }, [storageError])

  const form = useForm({
    defaultValues: initialProfile,
    onSubmit: async ({ value }) => {
      if (!businessProfileSchema.safeParse(value).success) return

      try {
        await saveMutation.mutateAsync(value)
      } catch {
        toast.add({
          title: m.profile_save_failed(),
          type: 'error',
        })
        return
      }

      if (resetGeneration !== getApplicationResetGeneration()) return
      savedBaseline.current = { ...value }
      updateUnsavedChanges()
      toast.add({ title: m.profile_saved(), type: 'success' })
    },
  })

  const updateUnsavedChanges = useCallback(() => {
    setUnsavedProfileChanges(
      Object.keys(savedBaseline.current).some(
        (name) =>
          form.state.values[name as ProfileFieldName] !==
          savedBaseline.current[name as ProfileFieldName],
      ),
    )
  }, [form])

  useEffect(() => {
    updateUnsavedChanges()
    const subscription = form.store.subscribe(updateUnsavedChanges)
    const unregisterDiscard = registerProfileDiscardHandler(() => {
      form.reset(savedBaseline.current, { keepDefaultValues: true })
      setUnsavedProfileChanges(false)
    })
    return () => {
      subscription.unsubscribe()
      unregisterDiscard()
      setUnsavedProfileChanges(false)
    }
  }, [form, updateUnsavedChanges])

  const changeProfileField = (name: ProfileFieldName, value: string) => {
    form.setFieldValue(name, value)
  }

  async function recoverStorage() {
    setRetryingStorage(true)
    try {
      if (await retryProfileRead()) setStorageDialogOpen(false)
    } finally {
      setRetryingStorage(false)
    }
  }

  async function exportProfile() {
    try {
      const contents =
        await createBrowserBusinessProfileRepository().exportProfile()
      downloadBackup(contents)
      toast.add({
        title: m.profile_backup_created(),
        description: m.profile_backup_sensitive(),
        type: 'success',
      })
    } catch {
      toast.add({
        title: m.profile_backup_export_failed(),
        type: 'error',
      })
    }
  }

  async function importProfile(file: File) {
    try {
      const imported = parseBusinessProfileBackup(await file.text())
      form.reset(imported, { keepDefaultValues: true })
      toast.add({
        title: m.profile_backup_loaded(),
        type: 'success',
      })
    } catch (error) {
      toast.add({
        title: m.profile_backup_import_failed(),
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      })
    }
  }

  async function deleteProfile() {
    try {
      await deleteMutation.mutateAsync()
      if (resetGeneration !== getApplicationResetGeneration()) return
      savedBaseline.current = emptyBusinessProfile
      form.reset(emptyBusinessProfile, { keepDefaultValues: true })
      updateUnsavedChanges()
      toast.add({
        title: m.profile_deleted(),
        description: m.profile_deleted_draft_retained(),
        type: 'success',
      })
    } catch {
      toast.add({
        title: m.profile_delete_failed(),
        type: 'error',
      })
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="heading-2">{m.profile_title()}</h2>
        <p className="paragraph-large max-w-2xl text-muted-foreground">
          {m.profile_intro()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.profile_issuer_details()}</CardTitle>
          <CardDescription>{m.profile_required_guidance()}</CardDescription>
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
            <fieldset disabled={Boolean(storageError)} className="min-w-0">
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
                          label={m.profile_business_name()}
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
                          label={m.profile_service_description()}
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
                          label={m.profile_owner_name()}
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
                          label={m.profile_street()}
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
                          label={m.profile_postal_code()}
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
                          label={m.profile_town()}
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
                          label={m.profile_phone()}
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
                          label={m.profile_mobile()}
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
                          label={m.profile_iban()}
                          value={field.state.value}
                          maxLength={42}
                          required
                          autoComplete="off"
                          hint={m.profile_iban_hint()}
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
                      label={m.profile_tax_identifiers()}
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
                            label={m.profile_vat_id()}
                            value={field.state.value}
                            maxLength={14}
                            autoComplete="off"
                            hint={m.profile_vat_id_hint()}
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
                            label={m.profile_tax_number()}
                            value={field.state.value}
                            autoComplete="off"
                            hint={m.profile_tax_number_hint()}
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
                    disabled={!valid || saveMutation.isPending}
                  >
                    <IconDeviceFloppy data-icon="inline-start" />
                    {m.profile_save()}
                  </Button>
                )}
              </form.Subscribe>
              {businessProfileSchema.safeParse(profile).success && (
                <Link
                  to="/invoice"
                  className={buttonVariants({ variant: 'outline' })}
                >
                  {m.profile_invoice()}
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.profile_backup_title()}</CardTitle>
          <CardDescription>{m.profile_backup_description()}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Button
            type="button"
            variant="outline"
            disabled={!profile || Boolean(storageError)}
            onClick={() => void exportProfile()}
          >
            <IconUpload data-icon="inline-start" />
            {m.profile_backup_export()}
          </Button>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="profile-import">
              <IconDownload className="size-4" data-icon="inline-start" />
              {m.profile_backup_import()}
            </FieldLabel>
            <Input
              id="profile-import"
              type="file"
              accept="application/json,.json"
              disabled={Boolean(storageError)}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (!file) return
                if (
                  profile ||
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

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>{m.profile_delete_title()}</CardTitle>
            <CardDescription>{m.profile_delete_description()}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(storageError)}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <IconTrash data-icon="inline-start" />
              {m.profile_delete()}
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
            <AlertDialogTitle>
              {m.profile_replace_confirmation_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.profile_replace_confirmation_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.profile_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={Boolean(storageError)}
              onClick={() => {
                if (pendingImport) void importProfile(pendingImport)
                setPendingImport(null)
              }}
            >
              <IconReplace data-icon="inline-start" />
              {m.profile_replace()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.profile_delete_confirmation_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.profile_delete_confirmation_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.profile_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={Boolean(storageError) || deleteMutation.isPending}
              onClick={() => {
                setDeleteDialogOpen(false)
                void deleteProfile()
              }}
            >
              <IconTrash data-icon="inline-start" />
              {m.profile_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={storageDialogOpen} onOpenChange={setStorageDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.profile_storage_failure_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.profile_storage_failure_description({
                error: storageError ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.profile_close()}</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={retryingStorage || saveMutation.isPending}
              onClick={() => void recoverStorage()}
            >
              {m.profile_storage_retry_read()}
            </Button>
            <form.Subscribe
              selector={(state) =>
                businessProfileSchema.safeParse(state.values).success
              }
            >
              {(valid) =>
                valid && (
                  <AlertDialogAction
                    type="button"
                    disabled={saveMutation.isPending || retryingStorage}
                    onClick={() => void form.handleSubmit()}
                  >
                    <IconDeviceFloppy data-icon="inline-start" />
                    {m.profile_storage_retry_save()}
                  </AlertDialogAction>
                )
              }
            </form.Subscribe>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
