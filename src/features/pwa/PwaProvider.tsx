'use client'

import * as React from 'react'
import { registerSW } from 'virtual:pwa-register'
import AdaptiveDialog from '@/components/AdaptiveDialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  initializeInvoiceDraftPersistence,
  invoiceDraftPersistenceStore,
  waitForInvoiceDraftPersistence,
} from '@/features/invoicing/invoice-draft'
import { waitForPwaCriticalOperations } from './pwa-critical-operations'
import { confirmDiscardProfileChanges } from '@/features/settings/unsaved-profile'
import { getCompletedApplicationResetGeneration } from '@/lib/application-reset-generation'
import * as m from '@/paraglide/messages'

type NotificationStatus =
  'unavailable' | 'install-required' | 'denied' | 'enabled' | 'disabled'

interface PwaContextValue {
  notificationStatus: NotificationStatus
  enableNotifications: () => Promise<void>
  disableNotifications: () => void
  reportPdfExport: (filename: string) => Promise<void>
  offlineReady: boolean
  updateAvailable: boolean
  openUpdatePrompt: () => void
  updateError: string | null
  applyUpdate: () => void
}

const PwaContext = React.createContext<PwaContextValue | null>(null)
const NOTIFICATION_PREFERENCE_KEY = 'regningen.pwa.pdf-notifications'

function detectStandaloneMode() {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone === true)
    )
  } catch {
    return false
  }
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [notificationSupported, setNotificationSupported] =
    React.useState(false)
  const [notificationPermission, setNotificationPermission] = React.useState<
    NotificationPermission | 'unavailable'
  >('unavailable')
  const [notificationPreference, setNotificationPreference] =
    React.useState(false)
  const [notificationRequiresInstall, setNotificationRequiresInstall] =
    React.useState(false)
  const [offlineReady, setOfflineReady] = React.useState(false)
  const [updateAvailable, setUpdateAvailable] = React.useState(false)
  const [updateDialogOpen, setUpdateDialogOpen] = React.useState(false)
  const [updateRequested, setUpdateRequested] = React.useState(false)
  const [reloadDeferred, setReloadDeferred] = React.useState(false)
  const [updateError, setUpdateError] = React.useState<string | null>(null)
  const registrationRef = React.useRef<ServiceWorkerRegistration | null>(null)
  const updateServiceWorkerRef = React.useRef<ReturnType<
    typeof registerSW
  > | null>(null)
  const reloadStartedRef = React.useRef(false)
  const promptShownRef = React.useRef(false)
  const lastUpdateErrorRef = React.useRef<string | null>(null)
  const draftPersistence = React.useSyncExternalStore(
    (onChange) => {
      const subscription = invoiceDraftPersistenceStore.subscribe(onChange)
      return () => subscription.unsubscribe()
    },
    () => invoiceDraftPersistenceStore.state,
    () => invoiceDraftPersistenceStore.state,
  )
  const hasHandledDraftError = React.useRef(false)

  const onNeedReload = React.useCallback(() => {
    if (reloadStartedRef.current) return
    reloadStartedRef.current = true
    const resetGeneration = getCompletedApplicationResetGeneration()
    void (async () => {
      await waitForPwaCriticalOperations()
      await waitForInvoiceDraftPersistence()
      if (!(await confirmDiscardProfileChanges())) {
        reloadStartedRef.current = false
        setReloadDeferred(true)
        setUpdateRequested(false)
        setUpdateDialogOpen(false)
        return
      }
      await waitForPwaCriticalOperations()
      if (resetGeneration !== getCompletedApplicationResetGeneration()) {
        // Successful reset already navigates to fresh Profil setup.
        reloadStartedRef.current = false
        return
      }
      setReloadDeferred(false)
      window.location.reload()
    })()
  }, [])
  const onRegisterError = React.useCallback((error: unknown) => {
    setUpdateError(
      error instanceof Error
        ? m.pwa_registration_error_detail({ detail: error.message })
        : m.pwa_registration_error(),
    )
  }, [])
  React.useEffect(() => {
    // The React plugin hook registers during render. Use the same public plugin
    // interface after hydration instead, without remounting children or mirroring
    // hook state. The ref also prevents duplicate registration in Strict Mode.
    if (updateServiceWorkerRef.current) return
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setUpdateAvailable(true),
      onOfflineReady: () => setOfflineReady(true),
      onNeedReload,
      onRegisteredSW: (_scriptUrl, registration) => {
        registrationRef.current = registration ?? null
      },
      onRegisterError,
    })
  }, [onNeedReload, onRegisterError])

  React.useEffect(() => {
    if (draftPersistence.initialized) return
    void initializeInvoiceDraftPersistence()
  }, [draftPersistence.initialized])

  React.useEffect(() => {
    if (!updateError) {
      lastUpdateErrorRef.current = null
      return
    }
    if (lastUpdateErrorRef.current === updateError) return
    lastUpdateErrorRef.current = updateError
    toast.add({
      title: m.pwa_unavailable_title(),
      description: updateError,
      type: 'warning',
    })
  }, [updateError])

  React.useEffect(() => {
    if (!draftPersistence.error || hasHandledDraftError.current) return
    hasHandledDraftError.current = true
    toast.add({
      title: m.pwa_draft_storage_unavailable(),
      description: draftPersistence.error,
      type: 'warning',
    })
  }, [draftPersistence.error])

  React.useEffect(() => {
    if (!draftPersistence.error) hasHandledDraftError.current = false
  }, [draftPersistence.error])

  React.useEffect(() => {
    const syncNotificationCapabilities = () => {
      const supported =
        typeof Notification !== 'undefined' && 'serviceWorker' in navigator
      setNotificationSupported(supported)
      setNotificationPermission(
        supported ? Notification.permission : 'unavailable',
      )
      const userAgent = navigator.userAgent.toLowerCase()
      const appleMobile =
        /iphone|ipad|ipod/.test(userAgent) ||
        (navigator.platform.toLowerCase() === 'macintel' &&
          navigator.maxTouchPoints > 1)
      setNotificationRequiresInstall(appleMobile && !detectStandaloneMode())
    }

    try {
      setNotificationPreference(
        window.localStorage.getItem(NOTIFICATION_PREFERENCE_KEY) === 'enabled',
      )
    } catch {
      // Notification preferences are optional and never block the application.
    }
    syncNotificationCapabilities()
    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null
    window.addEventListener('focus', syncNotificationCapabilities)
    mediaQuery?.addEventListener('change', syncNotificationCapabilities)
    return () => {
      window.removeEventListener('focus', syncNotificationCapabilities)
      mediaQuery?.removeEventListener('change', syncNotificationCapabilities)
    }
  }, [])

  React.useEffect(() => {
    if (!updateAvailable) {
      promptShownRef.current = false
      return
    }
    if (promptShownRef.current) return
    promptShownRef.current = true
    setUpdateDialogOpen(true)
  }, [updateAvailable])

  React.useEffect(() => {
    const checkForUpdates = () => {
      if (document.visibilityState !== 'visible') return
      void registrationRef.current?.update().catch(() => {
        // Update checks are optional and will be retried on a later focus.
      })
    }
    window.addEventListener('focus', checkForUpdates)
    document.addEventListener('visibilitychange', checkForUpdates)
    return () => {
      window.removeEventListener('focus', checkForUpdates)
      document.removeEventListener('visibilitychange', checkForUpdates)
    }
  }, [])

  const enableNotifications = React.useCallback(async () => {
    if (!notificationSupported || notificationRequiresInstall) return
    if (typeof Notification === 'undefined') return
    try {
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()
      setNotificationPermission(permission)
      if (permission !== 'granted') return
      window.localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'enabled')
      setNotificationPreference(true)
    } catch {
      setNotificationPreference(false)
    }
  }, [notificationRequiresInstall, notificationSupported])

  const disableNotifications = React.useCallback(() => {
    setNotificationPreference(false)
    try {
      window.localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'disabled')
    } catch {
      // The in-memory opt-out still applies for this application session.
    }
  }, [])

  const reportPdfExport = React.useCallback(
    async (filename: string) => {
      if (
        !notificationSupported ||
        notificationRequiresInstall ||
        !notificationPreference ||
        notificationPermission !== 'granted' ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted'
      )
        return
      try {
        const registration = registrationRef.current
        if (!registration) return
        await registration.showNotification(m.pwa_pdf_created(), {
          body: m.pwa_pdf_downloaded({ filename }),
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
        })
      } catch {
        // A local notification is optional; the successful download stays successful.
      }
    },
    [
      notificationPermission,
      notificationPreference,
      notificationRequiresInstall,
      notificationSupported,
    ],
  )

  const applyUpdate = React.useCallback(() => {
    if (updateRequested || (!reloadDeferred && !updateAvailable)) return
    setUpdateRequested(true)
    setUpdateError(null)
    void (async () => {
      if (!(await confirmDiscardProfileChanges())) {
        setUpdateRequested(false)
        return
      }
      if (reloadDeferred) {
        onNeedReload()
        return
      }
      try {
        await updateServiceWorkerRef.current?.()
      } catch (error) {
        setUpdateRequested(false)
        setUpdateError(
          error instanceof Error
            ? m.pwa_update_error_detail({ detail: error.message })
            : m.pwa_update_error(),
        )
      }
    })()
  }, [updateAvailable, updateRequested, reloadDeferred, onNeedReload])

  const notificationStatus: NotificationStatus = !notificationSupported
    ? 'unavailable'
    : notificationRequiresInstall
      ? 'install-required'
      : notificationPermission === 'denied'
        ? 'denied'
        : notificationPreference && notificationPermission === 'granted'
          ? 'enabled'
          : 'disabled'

  const openUpdatePrompt = React.useCallback(() => {
    if (updateAvailable || reloadDeferred) setUpdateDialogOpen(true)
  }, [updateAvailable, reloadDeferred])
  const value = React.useMemo(
    () => ({
      notificationStatus,
      enableNotifications,
      disableNotifications,
      reportPdfExport,
      offlineReady,
      updateAvailable: updateAvailable || reloadDeferred,
      openUpdatePrompt,
      updateError,
      applyUpdate,
    }),
    [
      notificationStatus,
      enableNotifications,
      disableNotifications,
      reportPdfExport,
      offlineReady,
      updateAvailable,
      reloadDeferred,
      openUpdatePrompt,
      updateError,
      applyUpdate,
    ],
  )

  return (
    <PwaContext.Provider value={value}>
      {children}
      <AdaptiveDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        title={m.pwa_update_title()}
        description={m.pwa_update_description()}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setUpdateDialogOpen(false)}
            >
              {m.pwa_update_later()}
            </Button>
            <Button onClick={applyUpdate} disabled={updateRequested}>
              {updateRequested ? m.pwa_update_starting() : m.pwa_update_now()}
            </Button>
          </div>
        }
      >
        {updateError ? (
          <p role="alert" className="paragraph-small text-destructive">
            {updateError}
          </p>
        ) : null}
      </AdaptiveDialog>
    </PwaContext.Provider>
  )
}

export function usePwa() {
  const context = React.useContext(PwaContext)
  if (!context) throw new Error('usePwa must be used within PwaProvider.')
  return context
}

export function useOptionalPwa() {
  return React.useContext(PwaContext)
}
