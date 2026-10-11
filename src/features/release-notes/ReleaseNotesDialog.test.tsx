// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReleaseNotesDialog from './ReleaseNotesDialog'
import type { ReleaseEntry } from '@/lib/release-catalog'

const releases: ReleaseEntry[] = [
  {
    version: '2.0.0',
    markdown: `### 🚀 Enhancements\n\n- Added the new workflow.\n\n[Project page](https://example.com/project)\n\n[Unsafe](javascript:alert(1))\n\n<script>alert('no')</script>`,
  },
  {
    version: '1.0.0',
    markdown: '### 🩹 Fixes\n\n- Corrected an earlier issue.',
  },
]

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 768px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function ReopenableReleaseNotes({ onAcknowledge = vi.fn() } = {}) {
  const [open, setOpen] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState('2.0.0')
  return (
    <>
      <button
        onClick={() => {
          setSelectedVersion('2.0.0')
          setOpen(true)
        }}
      >
        Reopen notes
      </button>
      <ReleaseNotesDialog
        open={open}
        onOpenChange={setOpen}
        onAcknowledge={onAcknowledge}
        currentVersion="2.0.0"
        selectedVersion={selectedVersion}
        onVersionChange={setSelectedVersion}
        releases={releases}
      />
    </>
  )
}

describe('release notes dialog', () => {
  it('renders generated Markdown safely and opens changelog links in a new tab', async () => {
    render(
      <ReleaseNotesDialog
        open
        onOpenChange={vi.fn()}
        onAcknowledge={vi.fn()}
        currentVersion="2.0.0"
        selectedVersion="2.0.0"
        onVersionChange={vi.fn()}
        releases={releases}
      />,
    )

    expect(
      await screen.findByRole('heading', { name: '🚀 Enhancements' }),
    ).toBeVisible()
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Added the new workflow.',
    )
    const projectLink = screen.getByRole('link', { name: 'Project page' })
    expect(projectLink).toHaveAttribute('href', 'https://example.com/project')
    expect(projectLink).toHaveAttribute('target', '_blank')
    expect(projectLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      screen.queryByRole('link', { name: 'Unsafe' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("<script>alert('no')</script>")).toBeVisible()
  })

  it('starts each reopening on the running version after history was selected', async () => {
    const user = userEvent.setup()
    render(<ReopenableReleaseNotes />)

    const selector = await screen.findByRole('combobox', {
      name: 'Version auswählen',
    })
    await user.click(selector)
    await user.click(await screen.findByRole('option', { name: 'v1.0.0' }))
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Reopen notes' }))
    expect(
      await screen.findByRole('combobox', { name: 'Version auswählen' }),
    ).toHaveTextContent('v2.0.0')
    expect(screen.getByText('Added the new workflow.')).toBeVisible()
    expect(
      screen.queryByText('Corrected an earlier issue.'),
    ).not.toBeInTheDocument()
  })

  it('shows historical notes without changing which running version is acknowledged', async () => {
    const user = userEvent.setup()
    const onAcknowledge = vi.fn()
    render(<ReopenableReleaseNotes onAcknowledge={onAcknowledge} />)

    const selector = await screen.findByRole('combobox', {
      name: 'Version auswählen',
    })
    expect(selector).toHaveTextContent('v2.0.0')
    await user.click(selector)
    await user.click(await screen.findByRole('option', { name: 'v1.0.0' }))

    expect(screen.getByRole('heading', { name: '🩹 Fixes' })).toBeVisible()
    expect(screen.getByText('Corrected an earlier issue.')).toBeVisible()
    expect(
      screen.queryByText('Added the new workflow.'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Verstanden' }))
    expect(onAcknowledge).toHaveBeenCalledWith('2.0.0')
    expect(
      screen.queryByRole('dialog', { name: 'Versionshinweise' }),
    ).toBeNull()
  })
})
