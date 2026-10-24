/** Supported feature composition: consumers receive operations, never concrete repositories. */
import {
  createBrowserBusinessProfileRepository,
  parseBusinessProfileBackup,
  BUSINESS_PROFILE_STORAGE_KEY,
} from './business-profile-repository'
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
  read: async (file) => parseBusinessProfileBackup(await file.text()),
  download(contents) {
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
