import { useEffect } from 'react'
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

export const BUSINESS_PROFILE_QUERY_KEY = ['business-profile'] as const

export function useBusinessProfile() {
  return useQuery<BusinessProfileDraft | null>({
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
    enabled: typeof window !== 'undefined',
    staleTime: Infinity,
    retry: false,
  })
}

export function useSaveBusinessProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (profile: BusinessProfileDraft) => {
      await createBrowserBusinessProfileRepository().saveProfile(profile)
      return profile
    },
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
    mutationFn: (backup: string) =>
      createBrowserBusinessProfileRepository().importProfile(backup),
    onSuccess: (profile) => {
      clearBusinessProfileStorageFailure()
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, profile)
    },
    onError: markBusinessProfileStorageFailure,
  })
}

export function useDeleteBusinessProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => createBrowserBusinessProfileRepository().deleteProfile(),
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
