'use client'

import * as React from 'react'
import { useCreateStore, useSelector } from '@tanstack/react-store'
import { createStorage } from 'unstorage'
import localStorageDriver from 'unstorage/drivers/localstorage'
import type { Storage } from 'unstorage'
import { toast } from '@/components/ui/toast'
import {
  applicationReleases,
  applicationVersion,
} from '@/lib/application-release'
import ReleaseNotesDialog from './ReleaseNotesDialog'

const ACKNOWLEDGED_VERSIONS_STORAGE_KEY =
  'regningen.release-notes.acknowledged-versions'

interface ReleaseNotesState {
  open: boolean
  selectedVersion: string
  acknowledgedVersions: string[]
  initialized: boolean
  automaticNotice: boolean
}

interface ReleaseNotesContextValue {
  applicationVersion: string
  openReleaseNotes: () => void
}

const ReleaseNotesContext =
  React.createContext<ReleaseNotesContextValue | null>(null)

function parseAcknowledgedVersions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((version): version is string => typeof version === 'string')
    : []
}

interface ReleaseNotesProviderProps {
  children: React.ReactNode
}

export function ReleaseNotesProvider({ children }: ReleaseNotesProviderProps) {
  const store = useCreateStore<ReleaseNotesState>({
    open: false,
    selectedVersion: applicationVersion,
    acknowledgedVersions: [],
    initialized: false,
    automaticNotice: false,
  })
  const state = useSelector(store)
  const storageRef = React.useRef<Storage | null>(null)

  React.useEffect(() => {
    let active = true
    let storage: Storage | undefined

    async function initialize() {
      let acknowledgedVersions: string[] = []
      try {
        // Construct the browser driver only after hydration, never during SSR.
        const browserStorage = createStorage({
          driver: localStorageDriver({ window }),
        })
        storage = browserStorage
        storageRef.current = browserStorage
        await browserStorage.watch(async (_event, key) => {
          if (key !== ACKNOWLEDGED_VERSIONS_STORAGE_KEY) return

          try {
            const acknowledged = parseAcknowledgedVersions(
              await browserStorage.getItem(ACKNOWLEDGED_VERSIONS_STORAGE_KEY),
            )
            if (!active) return
            store.setState((current) => {
              const closeAutomaticNotice =
                current.automaticNotice &&
                acknowledged.includes(applicationVersion)
              return {
                ...current,
                acknowledgedVersions: acknowledged,
                open: closeAutomaticNotice ? false : current.open,
                automaticNotice: closeAutomaticNotice
                  ? false
                  : current.automaticNotice,
              }
            })
          } catch {
            // Preference reads must not interrupt invoicing.
          }
        })
        acknowledgedVersions = parseAcknowledgedVersions(
          await browserStorage.getItem(ACKNOWLEDGED_VERSIONS_STORAGE_KEY),
        )
      } catch {
        // Unavailable storage behaves like an unacknowledged first visit.
      }

      if (!active) return
      store.setState((current) => {
        if (current.initialized) return current
        const open = !acknowledgedVersions.includes(applicationVersion)
        return {
          ...current,
          initialized: true,
          acknowledgedVersions,
          open,
          automaticNotice: open,
        }
      })
    }

    void initialize()
    return () => {
      active = false
      storageRef.current = null
      if (storage) void storage.dispose()
    }
  }, [store])

  function handleOpenChange(open: boolean) {
    store.setState((current) => ({
      ...current,
      open,
      initialized: true,
      automaticNotice: false,
    }))
  }

  function openReleaseNotes() {
    store.setState((current) => ({
      ...current,
      open: true,
      selectedVersion: applicationVersion,
      initialized: true,
      automaticNotice: false,
    }))
  }

  async function acknowledgeRunningVersion() {
    const acknowledgedVersions = [
      ...new Set([...store.get().acknowledgedVersions, applicationVersion]),
    ]
    store.setState((current) => ({
      ...current,
      open: false,
      acknowledgedVersions,
      initialized: true,
      automaticNotice: false,
    }))

    try {
      const storage = storageRef.current
      if (!storage) throw new Error('Release-note storage is unavailable.')
      const saveAcknowledgment = async () => {
        const savedVersions = parseAcknowledgedVersions(
          await storage.getItem(ACKNOWLEDGED_VERSIONS_STORAGE_KEY),
        )
        await storage.setItem(ACKNOWLEDGED_VERSIONS_STORAGE_KEY, [
          ...new Set([...savedVersions, ...acknowledgedVersions]),
        ])
      }

      // Serialize read/merge/write across tabs that may run different releases.
      if ('locks' in window.navigator) {
        await window.navigator.locks.request(
          ACKNOWLEDGED_VERSIONS_STORAGE_KEY,
          saveAcknowledgment,
        )
      } else {
        await saveAcknowledgment()
      }
    } catch {
      toast.add({
        title: 'Gelesene Versionshinweise konnten nicht gespeichert werden.',
        description:
          'Die Versionshinweise können beim nächsten Start erneut erscheinen.',
        type: 'warning',
      })
    }
  }

  return (
    <ReleaseNotesContext.Provider
      value={{ applicationVersion, openReleaseNotes }}
    >
      {children}
      <ReleaseNotesDialog
        open={state.open}
        onOpenChange={handleOpenChange}
        onAcknowledge={() => {
          void acknowledgeRunningVersion()
        }}
        currentVersion={applicationVersion}
        selectedVersion={state.selectedVersion}
        onVersionChange={(selectedVersion) => {
          store.setState((current) => ({ ...current, selectedVersion }))
        }}
        releases={applicationReleases}
      />
    </ReleaseNotesContext.Provider>
  )
}

export function useReleaseNotes() {
  const context = React.useContext(ReleaseNotesContext)
  if (!context) {
    throw new Error('useReleaseNotes must be used within ReleaseNotesProvider.')
  }
  return context
}
