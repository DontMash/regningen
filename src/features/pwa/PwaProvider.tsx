'use client'

import * as React from 'react'
import { useCreateStore, useSelector } from '@tanstack/react-store'
import AdaptiveDialog from '@/components/AdaptiveDialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { restoreInvoiceUpdateSession } from '@/features/invoicing/invoice-update-participant'
import { applicationVersion } from '@/lib/application-release'
import {
  abortPwaUpdateParticipants,
  preparePwaUpdateParticipants,
} from './update-participants'
import { UPDATE_ACKNOWLEDGMENT_KEY } from './update-session'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export interface StagedRelease {
  version: string
  markdown: string
}

type NotificationStatus =
  'unavailable' | 'install-required' | 'denied' | 'enabled' | 'disabled'

type UpdateState = 'idle' | 'preparing' | 'accepted'

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
  stagedRelease: StagedRelease | null
  updateState: UpdateState
  updateError: string | null
  applyUpdate: () => void
}

interface PwaState {
  installed: boolean
  installationHelp: string | null
  notificationSupported: boolean
  notificationPermission: NotificationPermission | 'unavailable'
  notificationPreference: boolean
  notificationRequiresInstall: boolean
  offlineReady: boolean
  stagedRelease: StagedRelease | null
  updateState: UpdateState
  updateError: string | null
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

function isStagedRelease(value: unknown): value is StagedRelease {
  if (!value || typeof value !== 'object') return false
  const release = value as Partial<StagedRelease>
  return (
    typeof release.version === 'string' &&
    release.version !== applicationVersion &&
    /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(release.version) &&
    typeof release.markdown === 'string'
  )
}

function requestWorkerMessage(worker: ServiceWorker, type: string) {
  return new Promise<unknown>((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      resolve(null)
      return
    }

    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => {
      channel.port1.close()
      resolve(null)
    }, 3000)
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout)
      channel.port1.close()
      resolve(event.data)
    }
    try {
      worker.postMessage({ type }, [channel.port2])
    } catch {
      window.clearTimeout(timeout)
      channel.port1.close()
      resolve(null)
    }
  })
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const store = useCreateStore<PwaState>({
    installed: false,
    installationHelp: null,
    notificationSupported: false,
    notificationPermission: 'unavailable',
    notificationPreference: false,
    notificationRequiresInstall: false,
    offlineReady: false,
    stagedRelease: null,
    updateState: 'idle',
    updateError: null,
  })
  const {
    installed,
    installationHelp,
    notificationSupported,
    notificationPermission,
    notificationPreference,
    notificationRequiresInstall,
    offlineReady,
    stagedRelease,
    updateState,
    updateError,
  } = useSelector(store)
  const {
    setInstalled,
    setInstallationHelp,
    setNotificationSupported,
    setNotificationPermission,
    setNotificationPreference,
    setNotificationRequiresInstall,
    setOfflineReady,
    setStagedRelease,
    setUpdateState,
    setUpdateError,
  } = React.useMemo(() => {
    const setter =
      <TKey extends keyof PwaState>(key: TKey) =>
      (value: PwaState[TKey]) =>
        store.setState((current) => ({ ...current, [key]: value }))
    return {
      setInstalled: setter('installed'),
      setInstallationHelp: setter('installationHelp'),
      setNotificationSupported: setter('notificationSupported'),
      setNotificationPermission: setter('notificationPermission'),
      setNotificationPreference: setter('notificationPreference'),
      setNotificationRequiresInstall: setter('notificationRequiresInstall'),
      setOfflineReady: setter('offlineReady'),
      setStagedRelease: setter('stagedRelease'),
      setUpdateState: setter('updateState'),
      setUpdateError: setter('updateError'),
    }
  }, [store])
  const installPrompt = React.useRef<InstallPromptEvent | null>(null)
  const activePreparationRef = React.useRef<{
    requestId: string
    targetVersion: string
    previousInert: boolean
    cancellation: AbortController
  } | null>(null)
  const activeRequestIdRef = React.useRef<string | null>(null)
  const requestSequenceRef = React.useRef(0)
  const acceptanceTimeoutRef = React.useRef<number | null>(null)
  const reloadStartedRef = React.useRef(false)
  const controllerVerificationRef = React.useRef(false)

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
    try {
      restoreInvoiceUpdateSession(applicationVersion)
    } catch (error) {
      toast.add({
        title: 'Rechnungseingaben konnten nicht wiederhergestellt werden',
        description:
          error instanceof Error
            ? error.message
            : 'Die temporäre Sicherung ist ungültig.',
        type: 'warning',
      })
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
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    const active = { current: true }
    const isActive = () => active.current
    let registration: ServiceWorkerRegistration | null = null

    const inspectRegistration = async () => {
      if (!registration || !active.current) return

      const runningWorker =
        registration.active ?? navigator.serviceWorker.controller
      if (runningWorker) {
        const status = await requestWorkerMessage(runningWorker, 'GET_STATUS')
        if (
          status &&
          typeof status === 'object' &&
          'version' in status &&
          status.version === applicationVersion &&
          'offlineReady' in status &&
          status.offlineReady === true
        ) {
          setOfflineReady(true)
        }
      }

      const waitingWorker = registration.waiting
      if (!waitingWorker) {
        setStagedRelease(null)
        return
      }

      const descriptor = await requestWorkerMessage(
        waitingWorker,
        'GET_RELEASE_INFO',
      )
      if (!isActive()) return
      const release =
        descriptor && typeof descriptor === 'object' && 'release' in descriptor
          ? descriptor.release
          : null
      setStagedRelease(isStagedRelease(release) ? release : null)
    }

    const updateRegistration = () => {
      if (!registration) return
      void registration
        .update()
        .then(inspectRegistration)
        .catch(() => {})
    }
    const onControllerChange = () => {
      let targetRelease: string | null = null
      try {
        targetRelease = window.sessionStorage.getItem(UPDATE_ACKNOWLEDGMENT_KEY)
      } catch {
        // An accepted update always writes this marker before responding ready.
      }

      const controller = navigator.serviceWorker.controller
      if (
        targetRelease &&
        controller &&
        !reloadStartedRef.current &&
        !controllerVerificationRef.current
      ) {
        controllerVerificationRef.current = true
        void requestWorkerMessage(controller, 'GET_STATUS')
          .then((status) => {
            if (
              !status ||
              typeof status !== 'object' ||
              !('version' in status) ||
              status.version !== targetRelease ||
              reloadStartedRef.current
            )
              return

            reloadStartedRef.current = true
            window.location.reload()
          })
          .finally(() => {
            controllerVerificationRef.current = false
          })
        return
      }
      void inspectRegistration()
    }
    const onServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data
      if (!message || typeof message.type !== 'string') return

      if (message.type === 'PREPARE_UPDATE') {
        const { requestId, targetVersion } = message as {
          requestId: string
          targetVersion: string
        }
        if (activePreparationRef.current) {
          if (activePreparationRef.current.requestId !== requestId) {
            navigator.serviceWorker.controller?.postMessage({
              type: 'PREPARE_RESULT',
              requestId,
              prepared: false,
            })
          }
          return
        }

        activeRequestIdRef.current = requestId
        const previousInert = document.body.inert
        document.body.inert = true
        const preparation = {
          requestId,
          targetVersion,
          previousInert,
          cancellation: new AbortController(),
        }
        activePreparationRef.current = preparation
        setUpdateState('preparing')
        setUpdateError(null)

        void (async () => {
          try {
            await preparePwaUpdateParticipants(
              targetVersion,
              preparation.cancellation.signal,
            )
            if (activePreparationRef.current !== preparation) return
            window.sessionStorage.setItem(
              UPDATE_ACKNOWLEDGMENT_KEY,
              targetVersion,
            )
            navigator.serviceWorker.controller?.postMessage({
              type: 'PREPARE_RESULT',
              requestId,
              prepared: true,
            })
          } catch {
            if (preparation.cancellation.signal.aborted) return
            await abortPwaUpdateParticipants(targetVersion)
            try {
              window.sessionStorage.removeItem(UPDATE_ACKNOWLEDGMENT_KEY)
            } catch {
              // Continue unlocking editing if cleanup is unavailable.
            }
            activePreparationRef.current = null
            document.body.inert = previousInert
            setUpdateState('idle')
            navigator.serviceWorker.controller?.postMessage({
              type: 'PREPARE_RESULT',
              requestId,
              prepared: false,
            })
          }
        })()
        return
      }

      if (message.type === 'ABORT_UPDATE') {
        const preparation = activePreparationRef.current
        if (!preparation || preparation.requestId !== message.requestId) return
        preparation.cancellation.abort()
        void abortPwaUpdateParticipants(preparation.targetVersion).finally(
          () => {
            try {
              window.sessionStorage.removeItem(UPDATE_ACKNOWLEDGMENT_KEY)
            } catch {
              // A failed cleanup must not leave the current session inert.
            }
            document.body.inert = preparation.previousInert
            activePreparationRef.current = null
            setUpdateState('idle')
          },
        )
        return
      }

      if (message.type === 'UPDATE_JOINED') {
        activeRequestIdRef.current = message.activeRequestId
        setUpdateState('preparing')
        return
      }

      if (message.type === 'UPDATE_DEFERRED') {
        if (message.requestId !== activeRequestIdRef.current) return
        activeRequestIdRef.current = null
        const preparation = activePreparationRef.current
        if (preparation) {
          preparation.cancellation.abort()
          void abortPwaUpdateParticipants(preparation.targetVersion).finally(
            () => {
              document.body.inert = preparation.previousInert
              activePreparationRef.current = null
              setUpdateState('idle')
            },
          )
        } else {
          setUpdateState('idle')
        }
        setUpdateError(
          typeof message.reason === 'string'
            ? message.reason
            : 'Die Aktualisierung wurde sicherheitshalber verschoben.',
        )
        return
      }

      if (message.type === 'UPDATE_ACCEPTED') {
        if (message.requestId !== activeRequestIdRef.current) return
        setUpdateState('accepted')
        if (acceptanceTimeoutRef.current !== null) {
          window.clearTimeout(acceptanceTimeoutRef.current)
        }
        acceptanceTimeoutRef.current = window.setTimeout(() => {
          if (reloadStartedRef.current) return
          // skipWaiting cannot be cancelled after acceptance. Keep the bridge
          // and editing lock intact so a delayed activation remains lossless.
          setUpdateError(
            'Der Browser benötigt länger für die Aktualisierung. Deine Eingaben sind gesichert; bitte lasse dieses Fenster geöffnet.',
          )
          onControllerChange()
        }, 15000)
      }
    }

    const onUpdateFound = () => {
      const installing = registration?.installing
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') void inspectRegistration()
      })
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateRegistration()
    }

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage)
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange,
    )
    window.addEventListener('focus', updateRegistration)
    document.addEventListener('visibilitychange', onVisibilityChange)

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((value) => {
        if (!isActive()) return
        registration = value
        registration.addEventListener('updatefound', onUpdateFound)
        void inspectRegistration()
        updateRegistration()
      })
      .catch(() => {
        // A worker is an enhancement; network invoicing remains available.
      })

    return () => {
      active.current = false
      navigator.serviceWorker.removeEventListener(
        'message',
        onServiceWorkerMessage,
      )
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      )
      window.removeEventListener('focus', updateRegistration)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      registration?.removeEventListener('updatefound', onUpdateFound)
      if (acceptanceTimeoutRef.current !== null) {
        window.clearTimeout(acceptanceTimeoutRef.current)
      }
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
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification('PDF wurde erstellt', {
          body: `${filename} wurde heruntergeladen. Du findest es in den Downloads.`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
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
    if (updateState !== 'idle') return
    const controller = navigator.serviceWorker.controller
    if (!stagedRelease || !controller) {
      setUpdateError(
        'Die vorbereitete Version ist nicht mehr verfügbar. Prüfe die Verbindung und versuche es später erneut.',
      )
      return
    }
    requestSequenceRef.current += 1
    const randomValues = new Uint32Array(1)
    window.crypto.getRandomValues(randomValues)
    const requestId = `${applicationVersion}-${Date.now()}-${randomValues[0]}-${requestSequenceRef.current}`
    activeRequestIdRef.current = requestId
    setUpdateState('preparing')
    setUpdateError(null)
    controller.postMessage({
      type: 'PREPARE_UPDATE',
      requestId,
      targetVersion: stagedRelease.version,
    })
  }, [stagedRelease, updateState])

  const notificationStatus: NotificationStatus = !notificationSupported
    ? 'unavailable'
    : notificationRequiresInstall
      ? 'install-required'
      : notificationPermission === 'denied'
        ? 'denied'
        : notificationPreference && notificationPermission === 'granted'
          ? 'enabled'
          : 'disabled'

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
      stagedRelease,
      updateState,
      updateError,
      applyUpdate,
    }),
    [
      installed,
      installationHelp,
      requestInstallation,
      notificationStatus,
      enableNotifications,
      disableNotifications,
      reportPdfExport,
      offlineReady,
      stagedRelease,
      updateState,
      updateError,
      applyUpdate,
    ],
  )

  return (
    <PwaContext.Provider value={value}>
      {children}
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
