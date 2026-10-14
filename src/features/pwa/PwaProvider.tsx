'use client'

import * as React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import AdaptiveDialog from '@/components/AdaptiveDialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  initializeInvoiceDraftPersistence,
  invoiceDraftPersistenceStore,
  waitForInvoiceDraftPersistence,
} from '@/features/invoicing/invoice-draft-store'
import { waitForPwaCriticalOperations } from './pwa-critical-operations'
import { confirmDiscardProfileChanges } from '@/features/settings/unsaved-profile'
import { getCompletedApplicationResetGeneration } from '@/features/settings/reset-generation'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type NotificationStatus =
  'unavailable' | 'install-required' | 'denied' | 'enabled' | 'disabled'

interface PwaContextValue {
  installed: boolean
  requestInstallation: () => Promise<void>
  installationHelp: string | null
  closeInstallationHelp: () => void
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

interface RegistrationState {
  needRefresh: (value: boolean) => void
  offlineReady: (value: boolean) => void
  setUpdateServiceWorker: (update: (() => Promise<void>) | null) => void
  setRegistration: (registration: ServiceWorkerRegistration | null) => void
  onNeedReload: () => void
  onRegisterError: (error: unknown) => void
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

function manualInstallationInstructions() {
  const userAgent = navigator.userAgent.toLowerCase()
  const ipadDesktopMode =
    navigator.platform.toLowerCase() === 'macintel' &&
    navigator.maxTouchPoints > 1
  if (/iphone|ipad|ipod/.test(userAgent) || ipadDesktopMode) {
    return 'Öffne das Teilen-Menü in Safari und wähle „Zum Home-Bildschirm“. Die Installationsmöglichkeit hängt von deiner iOS-Version und dem Browser ab.'
  }
  if (/android/.test(userAgent)) {
    return 'Öffne das Browsermenü und suche nach „App installieren“ oder „Zum Startbildschirm hinzufügen“. Die Bezeichnung hängt vom Browser ab.'
  }
  return 'Dieser Browser stellt keine native Installation bereit. Manche Browser bieten die Installation über ihr Menü an; andernfalls kannst du regningen weiterhin in diesem Browser nutzen.'
}

function PluginRegistration({
  needRefresh,
  offlineReady,
  setUpdateServiceWorker,
  setRegistration,
  onNeedReload,
  onRegisterError,
}: RegistrationState) {
  const {
    needRefresh: [pluginNeedsRefresh],
    offlineReady: [pluginOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedReload,
    onRegisteredSW: (_scriptUrl, registration) => {
      setRegistration(registration ?? null)
    },
    onRegisterError,
  })

  React.useEffect(() => {
    needRefresh(pluginNeedsRefresh)
  }, [needRefresh, pluginNeedsRefresh])

  React.useEffect(() => {
    offlineReady(pluginOfflineReady)
  }, [offlineReady, pluginOfflineReady])

  React.useEffect(() => {
    setUpdateServiceWorker(() => updateServiceWorker())
    return () => setUpdateServiceWorker(null)
  }, [setUpdateServiceWorker, updateServiceWorker])

  return null
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = React.useState(false)
  const [installed, setInstalled] = React.useState(false)
  const [installationHelp, setInstallationHelp] = React.useState<string | null>(
    null,
  )
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
  const updateServiceWorkerRef = React.useRef<(() => Promise<void>) | null>(
    null,
  )
  const installPrompt = React.useRef<InstallPromptEvent | null>(null)
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

  const setUpdateServiceWorker = React.useCallback(
    (update: (() => Promise<void>) | null) => {
      updateServiceWorkerRef.current = update
    },
    [],
  )
  const setRegistration = React.useCallback(
    (registration: ServiceWorkerRegistration | null) => {
      registrationRef.current = registration
    },
    [],
  )
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
        ? `Offline-Funktionen konnten nicht eingerichtet werden: ${error.message}`
        : 'Offline-Funktionen konnten nicht eingerichtet werden. Die Online-Nutzung bleibt verfügbar.',
    )
  }, [])

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (!hydrated || draftPersistence.initialized) return
    void initializeInvoiceDraftPersistence()
  }, [draftPersistence.initialized, hydrated])

  React.useEffect(() => {
    if (!updateError) {
      lastUpdateErrorRef.current = null
      return
    }
    if (lastUpdateErrorRef.current === updateError) return
    lastUpdateErrorRef.current = updateError
    toast.add({
      title: 'PWA-Funktion nicht verfügbar',
      description: updateError,
      type: 'warning',
    })
  }, [updateError])

  React.useEffect(() => {
    if (!draftPersistence.error || hasHandledDraftError.current) return
    hasHandledDraftError.current = true
    toast.add({
      title: 'Invoice Draft-Speicherung nicht verfügbar',
      description: draftPersistence.error,
      type: 'warning',
    })
  }, [draftPersistence.error])

  React.useEffect(() => {
    if (!draftPersistence.error) hasHandledDraftError.current = false
  }, [draftPersistence.error])

  React.useEffect(() => {
    const updateInstalledState = () => setInstalled(detectStandaloneMode())
    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault()
      installPrompt.current = event as InstallPromptEvent
    }
    const markInstalled = () => {
      installPrompt.current = null
      setInstalled(true)
    }

    updateInstalledState()
    mediaQuery?.addEventListener('change', updateInstalledState)
    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('appinstalled', markInstalled)

    return () => {
      mediaQuery?.removeEventListener('change', updateInstalledState)
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

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
    window.addEventListener('focus', syncNotificationCapabilities)
    return () =>
      window.removeEventListener('focus', syncNotificationCapabilities)
  }, [installed])

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
        await registration.showNotification('PDF wurde erstellt', {
          body: `${filename} wurde heruntergeladen. Du findest es in den Downloads.`,
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
    const updateServiceWorker = updateServiceWorkerRef.current
    if (
      updateRequested ||
      (!reloadDeferred && (!updateAvailable || !updateServiceWorker))
    )
      return
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
        await updateServiceWorker?.()
      } catch (error) {
        setUpdateRequested(false)
        setUpdateError(
          error instanceof Error
            ? error.message
            : 'Die Aktualisierung konnte nicht gestartet werden. Versuche es später erneut.',
        )
      }
    })()
  }, [updateAvailable, updateRequested, reloadDeferred, onNeedReload])

  const requestInstallation = React.useCallback(async () => {
    const promptEvent = installPrompt.current
    if (!promptEvent) {
      setInstallationHelp(manualInstallationInstructions())
      return
    }

    // The browser's install event is single-use, including when the user cancels.
    installPrompt.current = null
    try {
      await promptEvent.prompt()
      await promptEvent.userChoice
    } catch {
      setInstallationHelp(manualInstallationInstructions())
    }
  }, [])

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
      installed,
      requestInstallation,
      installationHelp,
      closeInstallationHelp: () => setInstallationHelp(null),
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
      installed,
      requestInstallation,
      installationHelp,
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
      {hydrated ? (
        <PluginRegistration
          needRefresh={setUpdateAvailable}
          offlineReady={setOfflineReady}
          setUpdateServiceWorker={setUpdateServiceWorker}
          setRegistration={setRegistration}
          onNeedReload={onNeedReload}
          onRegisterError={onRegisterError}
        />
      ) : null}
      <AdaptiveDialog
        open={installationHelp !== null}
        onOpenChange={(open) => {
          if (!open) setInstallationHelp(null)
        }}
        title="regningen installieren"
        description="Die verfügbaren Schritte unterscheiden sich je nach Browser und Plattform."
        footer={
          <Button onClick={() => setInstallationHelp(null)}>Schließen</Button>
        }
      >
        <p className="paragraph">{installationHelp}</p>
      </AdaptiveDialog>
      <AdaptiveDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        title="Aktualisierung verfügbar"
        description="Neue Anwendungsinhalte wurden im Hintergrund vorbereitet. Gespeicherte Invoice Drafts werden nach dem Neuladen in dieser Browsersitzung wiederhergestellt."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setUpdateDialogOpen(false)}
            >
              Später
            </Button>
            <Button onClick={applyUpdate} disabled={updateRequested}>
              {updateRequested
                ? 'Aktualisierung wird gestartet …'
                : 'Update jetzt'}
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
