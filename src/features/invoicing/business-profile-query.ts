import { useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BusinessProfileDraft } from './business-profile'
import {
  BUSINESS_PROFILE_STORAGE_KEY,
  createBrowserBusinessProfileRepository,
} from './business-profile-repository'
import {
  clearBusinessProfileStorageFailure,
  markBusinessProfileStorageFailure,
} from './business-profile-storage-status'
import { runPwaCriticalOperation } from '@/features/pwa/pwa-critical-operations'
import { getApplicationResetGeneration } from '@/features/settings/reset-generation'

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

export function useSaveBusinessProfile(generation: string) {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: (profile: BusinessProfileDraft) =>
      runPwaCriticalOperation(async () => {
        await createBrowserBusinessProfileRepository().saveProfile(
          profile,
          generation,
        )
        return profile
      }),
    onSuccess: (profile) => {
      if (generation !== getApplicationResetGeneration()) return
      clearBusinessProfileStorageFailure()
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, profile)
    },
    onError: () => {
      if (generation === getApplicationResetGeneration())
        markBusinessProfileStorageFailure()
    },
  })
}

export function useDeleteBusinessProfile(generation: string) {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: () =>
      runPwaCriticalOperation(() =>
        createBrowserBusinessProfileRepository().deleteProfile(generation),
      ),
    onSuccess: () => {
      if (generation !== getApplicationResetGeneration()) return
      clearBusinessProfileStorageFailure()
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, null)
    },
    onError: () => {
      if (generation === getApplicationResetGeneration())
        markBusinessProfileStorageFailure()
    },
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
