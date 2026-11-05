import { useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useSelector } from '@tanstack/react-store'
import type { BusinessProfileDraft } from './validation-contract'
import type { ProfileBackup, ProfileOperations } from './profile-contract'
import { ProfileFailure } from './profile-contract'
import type { createProfileQueryHooks } from './profile-query-state'
import { validationMessage } from './validation-feedback'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import { getApplicationResetGeneration } from '@/lib/application-reset-generation'
import { attachProfileEditor } from './profile-editing'
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
    const [importStatus, setImportStatus] = useState<
      | 'idle'
      | 'confirming'
      | 'pending'
      | 'applied'
      | 'canceled'
      | 'canceled-edits'
      | 'failed'
    >('idle')
    // Import alone is latest-selection-wins. Object identity fences superseded
    // reads; the values snapshot and reset generation fence newer working state.
    type ImportRequest = {
      file: File
      values: BusinessProfileDraft
      phase: 'confirming' | 'reading'
    }
    const importRequest = useRef<ImportRequest | null>(null)
    const [pendingImport, setPendingImport] = useState<File | null>(null)
    function cancelImport(edited = false) {
      if (!importRequest.current) return
      importRequest.current = null
      setPendingImport(null)
      setImportStatus(edited ? 'canceled-edits' : 'canceled')
    }
    const editing = useRef<ReturnType<typeof attachProfileEditor> | null>(null)
    const [resetGeneration] = useState(getApplicationResetGeneration)
    const saveMutation = hooks.useSaveBusinessProfile(resetGeneration)
    const deleteMutation = hooks.useDeleteBusinessProfile(resetGeneration)
    const storageError = useSelector(
      businessProfileStorageStatus,
      (state) => state.error,
    )
    const [operationFailure, setOperationFailure] = useState<unknown>(null)
    function failureDescription(error: unknown) {
      setOperationFailure(error)
      return error instanceof ProfileFailure
        ? error.message
        : m.profile_error_unexpected()
    }
    const [storageDialogOpen, setStorageDialogOpen] = useState(false)
    const [retryingStorage, setRetryingStorage] = useState(false)
    hooks.useProfileStorageSync()
    useEffect(() => {
      if (storageError) setStorageDialogOpen(true)
    }, [storageError])
    const form = useForm({
      defaultValues: initialProfile,
      onSubmit: async ({ value }) => {
        cancelImport()
        try {
          const result = await saveMutation.mutateAsync(value)
          if (
            !result.valid ||
            resetGeneration !== getApplicationResetGeneration()
          )
            return
          // Keep the raw saved baseline: normalization must not turn an unchanged form into unsaved work.
          editing.current?.saved(value)
          toast.add({ title: m.profile_saved(), type: 'success' })
        } catch (error) {
          toast.add({
            title: m.profile_save_failed(),
            description: failureDescription(error),
            type: 'error',
          })
        }
      },
    })
    useEffect(() => {
      const lifetime = attachProfileEditor(initialProfile, {
        getValues: () => form.state.values,
        subscribe: (changed) => {
          const subscription = form.store.subscribe(() => {
            const request = importRequest.current
            if (
              request &&
              profileFields.some(
                (name) => form.state.values[name] !== request.values[name],
              )
            )
              cancelImport(true)
            changed()
          })
          return () => subscription.unsubscribe()
        },
        restore: (baseline) =>
          form.reset(baseline, { keepDefaultValues: true }),
        invalidateImport: () => cancelImport(),
      })
      editing.current = lifetime
      return () => {
        lifetime.dispose()
        editing.current = null
      }
    }, [form, initialProfile])
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
      } catch (error) {
        toast.add({
          title: m.profile_backup_export_failed(),
          description: failureDescription(error),
          type: 'error',
        })
      }
    }
    function needsImportConfirmation() {
      return (
        Boolean(profile) ||
        Object.values(form.state.values).some((value) => value.trim())
      )
    }
    function importProfile(file: File) {
      const request: ImportRequest = {
        file,
        values: { ...form.state.values },
        phase: 'confirming',
      }
      // Selection, not read completion or confirmation, establishes the latest request.
      importRequest.current = request
      if (needsImportConfirmation()) {
        setPendingImport(file)
        setImportStatus('confirming')
      } else {
        void readImport(request)
      }
    }
    function confirmImport() {
      const request = importRequest.current
      if (!request) return
      setPendingImport(null)
      void readImport(request)
    }
    function cancelImportConfirmation() {
      if (importRequest.current?.phase === 'confirming') cancelImport()
    }
    function eligibleImport(request: ImportRequest) {
      if (importRequest.current !== request) return false
      if (resetGeneration !== getApplicationResetGeneration()) {
        importRequest.current = null
        setPendingImport(null)
        setImportStatus('idle')
        return false
      }
      if (
        profileFields.some(
          (name) => form.state.values[name] !== request.values[name],
        )
      ) {
        cancelImport(true)
        return false
      }
      return true
    }
    async function readImport(request: ImportRequest) {
      if (!eligibleImport(request)) return
      request.phase = 'reading'
      setImportStatus('pending')
      try {
        const imported = await backup.read(request.file)
        if (!eligibleImport(request)) return
        importRequest.current = null
        form.reset(imported, { keepDefaultValues: true })
        setImportStatus('applied')
        toast.add({ title: m.profile_backup_loaded(), type: 'success' })
      } catch (error) {
        if (!eligibleImport(request)) return
        importRequest.current = null
        setImportStatus('failed')
        toast.add({
          title: m.profile_backup_import_failed(),
          description: failureDescription(error),
          type: 'error',
        })
      }
    }
    async function deleteProfile() {
      cancelImport()
      try {
        await deleteMutation.mutateAsync()
        if (resetGeneration !== getApplicationResetGeneration()) return
        editing.current?.saved(emptyProfile)
        form.reset(emptyProfile, { keepDefaultValues: true })
        toast.add({
          title: m.profile_deleted(),
          description: m.profile_deleted_draft_retained(),
          type: 'success',
        })
      } catch (error) {
        toast.add({
          title: m.profile_delete_failed(),
          description: failureDescription(error),
          type: 'error',
        })
      }
    }
    return {
      fieldLimits: operations.fieldLimits,
      form,
      saveMutation,
      deleteMutation,
      operationFailure,
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
      needsImportConfirmation,
      isValidProfile: (value: BusinessProfileDraft) =>
        operations.validate(value).valid,
      savedReady: operations.readiness(profile).ready,
    }
  }
  return useProfileEditor
}
