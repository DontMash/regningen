// @vitest-environment jsdom
import { createElement } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { toast } from '@/components/ui/toast'
import { createProfileEditorHook } from './profile-editor-state'
import { createProfileQueryHooks } from './profile-query-state'
import { createProfileOperations } from './profile-domain'
import { ProfileFailure } from './profile-contract'
import { businessValidation } from './validation-composition'
import {
  businessProfileStorageStatus,
  clearBusinessProfileStorageFailure,
} from './business-profile-storage-status'
import { getApplicationResetGeneration } from '@/lib/application-reset-generation'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  clearBusinessProfileStorageFailure()
})

it.each(['storage', 'defect'] as const)(
  'does not misclassify a %s save failure',
  async (kind) => {
    const cause =
      kind === 'storage'
        ? new ProfileFailure('storage', 'denied', {
            cause: new DOMException('denied', 'QuotaExceededError'),
          })
        : new TypeError('broken validation')
    const operations = createProfileOperations(businessValidation, {
      loadProfile: async () => null,
      saveProfile: async () => {
        throw cause
      },
      deleteProfile: async () => {},
      exportProfile: async () => '',
    })
    const hooks = createProfileQueryHooks(operations, () => () => {})
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const { result } = renderHook(
      () => hooks.useSaveBusinessProfile(getApplicationResetGeneration()),
      {
        wrapper: ({ children }) =>
          createElement(QueryClientProvider, { client }, children),
      },
    )
    await act(async () => {
      await expect(
        result.current.mutateAsync(createBusinessProfileScenario()),
      ).rejects.toBe(cause)
    })
    await waitFor(() => expect(result.current.error).toBe(cause))
    expect(businessProfileStorageStatus.state.error !== null).toBe(
      kind === 'storage',
    )
    if (kind === 'storage')
      expect(businessProfileStorageStatus.state.cause).toBe(cause)
    client.clear()
  },
)

it('retains an unexpected export defect and reports failure without storage repair advice', async () => {
  const cause = new ReferenceError('broken export')
  const notify = vi.spyOn(toast, 'add')
  const operations = createProfileOperations(businessValidation, {
    loadProfile: async () => null,
    saveProfile: async () => {},
    deleteProfile: async () => {},
    exportProfile: async () => {
      throw cause
    },
  })
  const download = vi.fn()
  const hooks = createProfileQueryHooks(operations, () => () => {})
  const useEditor = createProfileEditorHook(
    operations,
    { read: async () => createBusinessProfileScenario(), download },
    hooks,
  )
  const client = new QueryClient()
  const { result } = renderHook(
    () => useEditor(createBusinessProfileScenario(), async () => true),
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  )
  await act(() => result.current.exportProfile())
  expect(result.current.operationFailure).toBe(cause)
  expect(result.current.storageDialogOpen).toBe(false)
  expect(businessProfileStorageStatus.state.error).toBeNull()
  expect(download).not.toHaveBeenCalled()
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'error',
      description: expect.stringMatching(/unexpected|unerwarteter/),
    }),
  )
  client.clear()
})
