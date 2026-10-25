import { vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

let controls: RegisterSWOptions | null = null
let updateServiceWorkerCalls = 0
let updateServiceWorkerError: unknown = null
const registration = {
  update: vi.fn(async () => {}),
  showNotification: vi.fn(async () => {}),
} as unknown as ServiceWorkerRegistration

export function registerSW(options: RegisterSWOptions = {}) {
  controls = options
  options.onRegisteredSW?.('/sw.js', registration)
  return async () => {
    updateServiceWorkerCalls += 1
    if (updateServiceWorkerError) throw updateServiceWorkerError
  }
}

export function triggerPwaUpdateAvailable() {
  controls?.onNeedRefresh?.()
}

export function triggerPwaOfflineReady() {
  controls?.onOfflineReady?.()
}

export function triggerPwaNeedReload() {
  controls?.onNeedReload?.()
}

export function triggerPwaRegisterError(error: unknown) {
  controls?.onRegisterError?.(error)
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
