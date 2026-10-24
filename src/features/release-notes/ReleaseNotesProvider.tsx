'use client'

import * as React from 'react'
import { useCreateStore, useSelector } from '@tanstack/react-store'
import { AcknowledgmentPersistenceError } from './acknowledgment-persistence'
import type {
  AcknowledgmentPersistence,
  OpenAcknowledgmentPersistence,
} from './acknowledgment-persistence'
import { toast } from '@/components/ui/toast'
import {
  applicationReleases,
  applicationVersion,
} from '@/lib/application-release'
import ReleaseNotesDialog from './ReleaseNotesDialog'
import * as m from '@/paraglide/messages'

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

function warnAcknowledgmentStorageFailure() {
  toast.add({
    title: m.release_acknowledgment_error(),
    description: m.release_acknowledgment_error_description(),
    type: 'warning',
  })
}

interface ReleaseNotesProviderProps {
  children: React.ReactNode
  persistence: OpenAcknowledgmentPersistence
}

export function ReleaseNotesProvider({
  children,
  persistence,
}: ReleaseNotesProviderProps) {
  const store = useCreateStore<ReleaseNotesState>({
    open: false,
    selectedVersion: applicationVersion,
    acknowledgedVersions: [],
    initialized: false,
    automaticNotice: false,
  })
  const state = useSelector(store)
  const storageRef = React.useRef<AcknowledgmentPersistence | null>(null)

  React.useEffect(() => {
    let active = true
    let storage: AcknowledgmentPersistence | undefined

    async function initialize() {
      let acknowledgedVersions: string[] = []
      try {
        const browserStorage = persistence()
        storage = browserStorage
        storageRef.current = browserStorage
        await browserStorage.subscribe((acknowledged) => {
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
        })
        acknowledgedVersions = await browserStorage.load()
      } catch (error) {
        if (!(error instanceof AcknowledgmentPersistenceError)) throw error
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
      if (storage) {
        void Promise.resolve(storage.dispose()).catch((error: unknown) => {
          if (!(error instanceof AcknowledgmentPersistenceError)) throw error
        })
      }
    }
  }, [persistence, store])

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

    const owner = storageRef.current
    try {
      if (!owner)
        throw new AcknowledgmentPersistenceError('write', 'Session unavailable')
      await owner.acknowledge(acknowledgedVersions)
    } catch (error) {
      if (!(error instanceof AcknowledgmentPersistenceError)) throw error
      if (storageRef.current === owner && owner)
        warnAcknowledgmentStorageFailure()
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
