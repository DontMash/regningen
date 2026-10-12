import { useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BusinessProfileDraft } from './business-profile'
import {
  BUSINESS_PROFILE_STORAGE_KEY,
  InvalidBusinessProfileBackupError,
  createBrowserBusinessProfileRepository,
} from './business-profile-repository'
import {
  clearBusinessProfileStorageFailure,
  markBusinessProfileStorageFailure,
} from './business-profile-storage-status'
import { runPwaCriticalOperation } from '@/features/pwa/update-participants'

export const BUSINESS_PROFILE_QUERY_KEY = ['business-profile'] as const

const subscribeToHydration = () => () => {}
const browserReady = () => true
const serverReady = () => false

export function useBusinessProfile() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    browserReady,
    serverReady,
  )

  return useQuery<BusinessProfileDraft | null>({
    networkMode: 'always',
    queryKey: BUSINESS_PROFILE_QUERY_KEY,
    queryFn: async () => {
      try {
        const profile =
          await createBrowserBusinessProfileRepository().loadProfile()
        clearBusinessProfileStorageFailure()
        return profile
      } catch (error) {
        markBusinessProfileStorageFailure()
        throw error
      }
    },
    enabled: hydrated,
    staleTime: Infinity,
    retry: false,
  })
}

export function useSaveBusinessProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: (profile: BusinessProfileDraft) =>
      runPwaCriticalOperation(async () => {
        await createBrowserBusinessProfileRepository().saveProfile(profile)
        return profile
      }),
    onSuccess: (profile) => {
      clearBusinessProfileStorageFailure()
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, profile)
    },
    onError: markBusinessProfileStorageFailure,
  })
}

export function useImportBusinessProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: (backup: string) =>
      runPwaCriticalOperation(() =>
        createBrowserBusinessProfileRepository().importProfile(backup),
      ),
    onSuccess: (profile) => {
      clearBusinessProfileStorageFailure()
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, profile)
    },
    onError: (error) => {
      if (!(error instanceof InvalidBusinessProfileBackupError)) {
        markBusinessProfileStorageFailure()
      }
    },
  })
}

export function useDeleteBusinessProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: () =>
      runPwaCriticalOperation(() =>
        createBrowserBusinessProfileRepository().deleteProfile(),
      ),
    onSuccess: () => {
      clearBusinessProfileStorageFailure()
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, null)
    },
    onError: markBusinessProfileStorageFailure,
  })
}

export function useProfileStorageSync(onExternalChange?: () => void) {
  const queryClient = useQueryClient()

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== BUSINESS_PROFILE_STORAGE_KEY) return

      onExternalChange?.()
      void queryClient.invalidateQueries({
        queryKey: BUSINESS_PROFILE_QUERY_KEY,
      })
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [onExternalChange, queryClient])
}
