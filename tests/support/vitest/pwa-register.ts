import { useEffect, useRef, useState } from 'react'
import { vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

interface RegistrationControls {
  needRefresh: (value: boolean) => void
  offlineReady: (value: boolean) => void
  options: RegisterSWOptions
}

let controls: RegistrationControls | null = null
let updateServiceWorkerCalls = 0
let updateServiceWorkerError: unknown = null
const registration = {
  update: vi.fn(async () => {}),
  showNotification: vi.fn(async () => {}),
} as unknown as ServiceWorkerRegistration

export function useRegisterSW(options: RegisterSWOptions = {}) {
  const latestOptions = useRef(options)
  latestOptions.current = options
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateServiceWorker] = useState(() => async () => {
    updateServiceWorkerCalls += 1
    if (updateServiceWorkerError) throw updateServiceWorkerError
  })

  useEffect(() => {
    controls = {
      needRefresh: setNeedRefresh,
      offlineReady: setOfflineReady,
      options: latestOptions.current,
    }
    latestOptions.current.onRegisteredSW?.('/sw.js', registration)
    return () => {
      controls = null
    }
  }, [])

  return {
    needRefresh: [needRefresh, setNeedRefresh] as const,
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker,
  }
}

export function triggerPwaUpdateAvailable() {
  controls?.needRefresh(true)
}

export function triggerPwaOfflineReady() {
  controls?.offlineReady(true)
}

export function triggerPwaNeedReload() {
  controls?.options.onNeedReload?.()
}

export function triggerPwaRegisterError(error: unknown) {
  controls?.options.onRegisterError?.(error)
}

export function setPwaUpdateServiceWorkerError(error: unknown) {
  updateServiceWorkerError = error
}

export function getPwaUpdateServiceWorkerCalls() {
  return updateServiceWorkerCalls
}

export function getPwaRegistration() {
  return registration
}

export function resetPwaRegisterMock() {
  controls = null
  updateServiceWorkerCalls = 0
  updateServiceWorkerError = null
  vi.mocked(registration.update).mockClear()
  vi.mocked(registration.showNotification).mockClear()
}
