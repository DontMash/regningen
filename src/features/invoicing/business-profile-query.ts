/** Supported feature composition: consumers receive operations, never concrete repositories. */
import {
  createBrowserBusinessProfileRepository,
  parseBusinessProfileBackup,
  BUSINESS_PROFILE_STORAGE_KEY,
} from './business-profile-repository'
import { downloadProfileBackup } from './profile-backup-download'
import { ProfileFailure } from './profile-contract'
import { createProfileOperations } from './profile-domain'
import { businessValidation } from './validation-composition'
import { createProfileQueryHooks } from './profile-query-state'
import { createProfileEditorHook } from './profile-editor-state'
import type { ProfilePersistence, ProfileBackup } from './profile-contract'
import * as m from '@/paraglide/messages'

// Browser access is deferred until an operation; composition also executes during SSR.
const persistence: ProfilePersistence = {
  loadProfile: () => createBrowserBusinessProfileRepository().loadProfile(),
  saveProfile: (profile, generation) =>
    createBrowserBusinessProfileRepository().saveProfile(profile, generation),
  deleteProfile: (generation) =>
    createBrowserBusinessProfileRepository().deleteProfile(generation),
  exportProfile: () => createBrowserBusinessProfileRepository().exportProfile(),
}
const backup: ProfileBackup = {
  read: async (file) => {
    let contents: string
    try {
      contents = await file.text()
    } catch (cause) {
      if (cause instanceof DOMException)
        throw new ProfileFailure('backup', m.profile_backup_import_failed(), {
          cause,
        })
      throw cause
    }
    return parseBusinessProfileBackup(contents)
  },
  download(contents) {
    downloadProfileBackup(contents, m.profile_backup_filename())
  },
}
const operations = createProfileOperations(businessValidation, persistence)
const hooks = createProfileQueryHooks(operations, (listener) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === BUSINESS_PROFILE_STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
})
export const {
  useBusinessProfile,
  useSaveBusinessProfile,
  useDeleteBusinessProfile,
  useProfileStorageSync,
} = hooks
export const useProfileEditor = createProfileEditorHook(
  operations,
  backup,
  hooks,
)
export { BUSINESS_PROFILE_QUERY_KEY } from './profile-query-state'
