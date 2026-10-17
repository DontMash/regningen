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
import * as m from '@/paraglide/messages'

interface ReleaseNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAcknowledge: (version: string) => void
  currentVersion: string
  selectedVersion: string
  onVersionChange: (version: string) => void
  releases: ReleaseEntry[]
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
}: ReleaseNotesDialogProps) {
  const selectedRelease = releases.find(
    (release) => release.version === selectedVersion,
  )

  function acknowledgeRunningVersion() {
    onAcknowledge(currentVersion)
    onOpenChange(false)
  }

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.release_title()}
      footer={
        <Button onClick={acknowledgeRunningVersion}>
          {m.release_acknowledge()}
        </Button>
      }
      stickyHeader={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="paragraph-small text-muted-foreground">
            {selectedVersion === currentVersion
              ? m.release_version_current({ version: selectedVersion })
              : m.release_version_historical({ version: selectedVersion })}
          </p>
          <Select
            value={selectedVersion}
            onValueChange={(value) => {
              if (typeof value === 'string') onVersionChange(value)
            }}
          >
            <SelectTrigger
              aria-label={m.release_select_version()}
              className="w-full sm:w-40"
            >
              <SelectValue>v{selectedVersion}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {releases.map((release) => (
                  <SelectItem key={release.version} value={release.version}>
                    {release.version === currentVersion
                      ? m.release_option_current({ version: release.version })
                      : m.release_option_historical({
                          version: release.version,
                        })}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      }
    >
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
