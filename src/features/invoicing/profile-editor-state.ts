import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useSelector } from '@tanstack/react-store'
import type { BusinessProfileDraft } from './validation-contract'
import type { ProfileBackup, ProfileOperations } from './profile-contract'
import type { createProfileQueryHooks } from './profile-query-state'
import { validationMessage } from './validation-feedback'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import { getApplicationResetGeneration } from '@/lib/application-reset-generation'
import {
  registerProfileDiscardHandler,
  setUnsavedProfileChanges,
} from '@/features/settings/unsaved-profile'
import { toast } from '@/components/ui/toast'
import * as m from '@/paraglide/messages'

export const emptyProfile: BusinessProfileDraft = {
  businessName: '',
  serviceDescription: '',
  ownerName: '',
  street: '',
  postalCode: '',
  town: '',
  phone: '',
  mobile: '',
  iban: '',
  vatId: '',
  taxNumber: '',
}

const profileFields = [
  'businessName',
  'serviceDescription',
  'ownerName',
  'street',
  'postalCode',
  'town',
  'phone',
  'mobile',
  'iban',
  'vatId',
  'taxNumber',
] as const satisfies ReadonlyArray<keyof BusinessProfileDraft>

export function createProfileEditorHook(
  operations: ProfileOperations,
  backup: ProfileBackup,
  hooks: ReturnType<typeof createProfileQueryHooks>,
) {
  function getProfileErrors(profile: BusinessProfileDraft) {
    const result = operations.validate(profile)
    if (result.valid) return {}
    const errors: Partial<Record<keyof BusinessProfileDraft, string>> = {}
    for (const field of profileFields) {
      const failure = result.failures.find((item) => item.path[0] === field)
      if (failure) errors[field] = validationMessage('profile', failure)
    }
    return errors
  }
  function useProfileEditor(
    profile: BusinessProfileDraft | null,
    retryProfileRead: () => Promise<boolean>,
  ) {
    const [initialProfile] = useState(profile ?? emptyProfile)
    const savedBaseline = useRef(initialProfile)
    const [resetGeneration] = useState(getApplicationResetGeneration)
    const saveMutation = hooks.useSaveBusinessProfile(resetGeneration)
    const deleteMutation = hooks.useDeleteBusinessProfile(resetGeneration)
    const storageError = useSelector(
      businessProfileStorageStatus,
      (state) => state.error,
    )
    const [storageDialogOpen, setStorageDialogOpen] = useState(false)
    const [retryingStorage, setRetryingStorage] = useState(false)
    hooks.useProfileStorageSync()
    useEffect(() => {
      if (storageError) setStorageDialogOpen(true)
    }, [storageError])
    const form = useForm({
      defaultValues: initialProfile,
      onSubmit: async ({ value }) => {
        try {
          const result = await saveMutation.mutateAsync(value)
          if (
            !result.valid ||
            resetGeneration !== getApplicationResetGeneration()
          )
            return
          // Keep the raw saved baseline: normalization must not turn an unchanged form into unsaved work.
          savedBaseline.current = { ...value }
          updateUnsavedChanges()
          toast.add({ title: m.profile_saved(), type: 'success' })
        } catch {
          toast.add({ title: m.profile_save_failed(), type: 'error' })
        }
      },
    })
    const updateUnsavedChanges = useCallback(() => {
      setUnsavedProfileChanges(
        profileFields.some(
          (name) => form.state.values[name] !== savedBaseline.current[name],
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
        backup.download(await operations.export())
        toast.add({
          title: m.profile_backup_created(),
          description: m.profile_backup_sensitive(),
          type: 'success',
        })
      } catch {
        toast.add({ title: m.profile_backup_export_failed(), type: 'error' })
      }
    }
    async function importProfile(file: File) {
      try {
        const imported = await backup.read(file)
        form.reset(imported, { keepDefaultValues: true })
        toast.add({ title: m.profile_backup_loaded(), type: 'success' })
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
        savedBaseline.current = emptyProfile
        form.reset(emptyProfile, { keepDefaultValues: true })
        updateUnsavedChanges()
        toast.add({
          title: m.profile_deleted(),
          description: m.profile_deleted_draft_retained(),
          type: 'success',
        })
      } catch {
        toast.add({ title: m.profile_delete_failed(), type: 'error' })
      }
    }
    return {
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
      deleteProfile,
      changeProfileField: (name: keyof BusinessProfileDraft, value: string) =>
        form.setFieldValue(name, value),
      getProfileErrors,
      taxIdentifiersMissing: (value: BusinessProfileDraft) => {
        const result = operations.validate(value)
        return (
          !result.valid &&
          result.failures.some(
            (failure) => failure.reason === 'tax-identifier-required',
          )
        )
      },
      needsImportConfirmation: () =>
        Boolean(profile) ||
        Object.values(form.state.values).some((value) => value.trim()),
      isValidProfile: (value: BusinessProfileDraft) =>
        operations.validate(value).valid,
      savedReady: operations.readiness(profile).ready,
    }
  }
  return useProfileEditor
}
