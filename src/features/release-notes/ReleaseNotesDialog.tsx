'use client'

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AdaptiveDialog from '@/components/AdaptiveDialog'
import type { ReleaseEntry } from '@/lib/release-catalog'
import type { StagedRelease } from '@/features/pwa/PwaProvider'

interface ReleaseNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAcknowledge: (version: string) => void
  currentVersion: string
  selectedVersion: string
  onVersionChange: (version: string) => void
  releases: ReleaseEntry[]
  stagedRelease?: StagedRelease | null
  onApplyUpdate?: () => void
  updateState?: 'idle' | 'preparing' | 'accepted'
  updateError?: string | null
}

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
}

function ReleaseNotesDialog({
  open,
  onOpenChange,
  onAcknowledge,
  currentVersion,
  selectedVersion,
  onVersionChange,
  releases,
  stagedRelease = null,
  onApplyUpdate = () => {},
  updateState = 'idle',
  updateError = null,
}: ReleaseNotesDialogProps) {
  const stagedSelected = stagedRelease?.version === selectedVersion
  const selectedRelease = stagedSelected
    ? stagedRelease
    : releases.find((release) => release.version === selectedVersion)
  const availableReleases = stagedRelease
    ? [stagedRelease, ...releases]
    : releases

  function acknowledgeRunningVersion() {
    onAcknowledge(currentVersion)
    onOpenChange(false)
  }

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Versionshinweise"
      footer={
        stagedSelected ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Später
            </Button>
            <Button onClick={onApplyUpdate} disabled={updateState !== 'idle'}>
              {updateState === 'preparing'
                ? 'Eingaben werden gesichert …'
                : updateState === 'accepted'
                  ? 'Aktualisierung wird gestartet …'
                  : 'Update jetzt'}
            </Button>
          </div>
        ) : (
          <Button onClick={acknowledgeRunningVersion}>Verstanden</Button>
        )
      }
      stickyHeader={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            {stagedRelease ? (
              <>
                <p className="paragraph-small text-muted-foreground">
                  Laufende Version: v{currentVersion}
                </p>
                <p className="paragraph-small text-primary">
                  Neue Version bereit: v{stagedRelease.version}
                </p>
              </>
            ) : (
              <p className="paragraph-small text-muted-foreground">
                Version {selectedVersion}
              </p>
            )}
          </div>
          <Select
            value={selectedVersion}
            onValueChange={(value) => {
              if (typeof value === 'string') onVersionChange(value)
            }}
          >
            <SelectTrigger
              aria-label="Version auswählen"
              className="w-full sm:w-40"
            >
              <SelectValue>v{selectedVersion}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {availableReleases.map((release) => (
                  <SelectItem key={release.version} value={release.version}>
                    v{release.version}
                    {release.version === stagedRelease?.version
                      ? ' (bereit)'
                      : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {stagedSelected && updateError ? (
        <p role="alert" className="paragraph-small mb-4 text-destructive">
          {updateError}
        </p>
      ) : null}
      {selectedRelease ? (
        <article className="prose prose-sm max-w-none text-foreground prose-headings:font-serif prose-a:text-primary dark:prose-invert">
          <ReactMarkdown components={markdownComponents}>
            {selectedRelease.markdown}
          </ReactMarkdown>
        </article>
      ) : null}
    </AdaptiveDialog>
  )
}

export default ReleaseNotesDialog
