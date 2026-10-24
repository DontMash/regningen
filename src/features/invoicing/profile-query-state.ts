import { useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BusinessProfileDraft } from './validation-contract'
import type { ProfileOperations } from './profile-contract'
import {
  clearBusinessProfileStorageFailure,
  markBusinessProfileStorageFailure,
} from './business-profile-storage-status'
import { runPwaCriticalOperation } from '@/features/pwa/pwa-critical-operations'
import { getApplicationResetGeneration } from '@/features/settings/reset-generation'

export const BUSINESS_PROFILE_QUERY_KEY = ['business-profile'] as const
const subscribeToHydration = () => () => {}

export function createProfileQueryHooks(
  operations: ProfileOperations,
  subscribe: (listener: () => void) => () => void,
) {
  function useBusinessProfile() {
    const hydrated = useSyncExternalStore(
      subscribeToHydration,
      () => true,
      () => false,
    )
    const query = useQuery({
      networkMode: 'always',
      queryKey: BUSINESS_PROFILE_QUERY_KEY,
      queryFn: async () => {
        try {
          const profile = await operations.load()
          clearBusinessProfileStorageFailure()
          return profile
        } catch (error) {
          markBusinessProfileStorageFailure(error)
          throw error
        }
      },
      enabled: hydrated,
      staleTime: Infinity,
      retry: false,
    })
    return {
      ...query,
      readiness: operations.readiness(query.data, query.isError),
      async entryDestination() {
        const result = await query.refetch()
        const readiness = operations.readiness(result.data, result.isError)
        return readiness.ready
          ? ('/invoice' as const)
          : readiness.reason === 'unavailable'
            ? null
            : ('/settings/profile' as const)
      },
    }
  }
  function useSaveBusinessProfile(generation: string) {
    const client = useQueryClient()
    return useMutation({
      networkMode: 'always',
      mutationFn: (profile: BusinessProfileDraft) =>
        runPwaCriticalOperation(() => operations.save(profile, generation)),
      onSuccess: (result) => {
        if (!result.valid || generation !== getApplicationResetGeneration())
          return
        clearBusinessProfileStorageFailure()
        client.setQueryData(BUSINESS_PROFILE_QUERY_KEY, result.data)
      },
      onError: (error) => {
        if (generation === getApplicationResetGeneration())
          markBusinessProfileStorageFailure(error)
      },
    })
  }
  function useDeleteBusinessProfile(generation: string) {
    const client = useQueryClient()
    return useMutation({
      networkMode: 'always',
      mutationFn: () =>
        runPwaCriticalOperation(() => operations.delete(generation)),
      onSuccess: () => {
        if (generation !== getApplicationResetGeneration()) return
        clearBusinessProfileStorageFailure()
        client.setQueryData(BUSINESS_PROFILE_QUERY_KEY, null)
      },
      onError: (error) => {
        if (generation === getApplicationResetGeneration())
          markBusinessProfileStorageFailure(error)
      },
    })
  }
  function useProfileStorageSync(onExternalChange?: () => void) {
    const client = useQueryClient()
    useEffect(
      () =>
        subscribe(() => {
          onExternalChange?.()
          void client.invalidateQueries({
            queryKey: BUSINESS_PROFILE_QUERY_KEY,
          })
        }),
      [client, onExternalChange],
    )
  }
  return {
    useBusinessProfile,
    useSaveBusinessProfile,
    useDeleteBusinessProfile,
    useProfileStorageSync,
  }
}
