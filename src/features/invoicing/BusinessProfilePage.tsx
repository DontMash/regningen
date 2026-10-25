import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
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
import * as m from '@/paraglide/messages'
import type { BusinessProfileDraft } from './validation-contract'
import { useBusinessProfile, useProfileEditor } from './business-profile-query'
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
              {profileQuery.failureKind === 'storage'
                ? m.profile_unavailable_description()
                : m.profile_error_unexpected()}
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
  const {
    fieldLimits,
    form,
    saveMutation,
    deleteMutation,
    storageError,
    storageDialogOpen,
    setStorageDialogOpen,
    retryingStorage,
    recoverStorage,
    exportProfile,
    importProfile,
    importStatus,
    pendingImport,
    confirmImport,
    cancelImportConfirmation,
    deleteProfile,
    changeProfileField,
    getProfileErrors,
    taxIdentifiersMissing,
    isValidProfile,
    savedReady,
  } = useProfileEditor(profile, retryProfileRead)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

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
                  taxIdentifiersMissing: taxIdentifiersMissing(state.values),
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
                          maxLength={fieldLimits.businessName}
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
                          maxLength={fieldLimits.serviceDescription}
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
                          maxLength={fieldLimits.ownerName}
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
                          maxLength={fieldLimits.street}
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
                          maxLength={fieldLimits.postalCode}
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
                          maxLength={fieldLimits.town}
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
                          maxLength={fieldLimits.phone}
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
                          maxLength={fieldLimits.mobile}
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
                            maxLength={fieldLimits.taxNumber}
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
                selector={(state) => isValidProfile(state.values)}
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
              {savedReady && (
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
                importProfile(file)
              }}
            />
          </Field>
        </CardContent>
        <p role="status" aria-live="polite" className="px-6">
          {importStatus === 'pending' && m.profile_backup_pending()}
          {importStatus === 'canceled-edits' &&
            m.profile_backup_canceled_edits()}
          {importStatus === 'canceled' && m.profile_backup_canceled()}
        </p>
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
          if (!open) cancelImportConfirmation()
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
              onClick={confirmImport}
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
            <form.Subscribe selector={(state) => isValidProfile(state.values)}>
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
