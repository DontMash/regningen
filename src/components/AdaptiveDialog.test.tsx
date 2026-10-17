// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdaptiveDialog from './AdaptiveDialog'
import { setLocale } from '@/paraglide/runtime'

function setViewportWidth(width: number) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 768px') && width >= 768,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  )
}

beforeEach(() => {
  setLocale('de', { reload: false })
  setViewportWidth(1024)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdaptiveDialog', () => {
  it.each([767, 1024])(
    'offers an English close action at viewport width %s',
    async (width) => {
      setViewportWidth(width)
      setLocale('en', { reload: false })
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      render(
        <AdaptiveDialog open onOpenChange={onOpenChange} title="Release notes">
          <p>Original content</p>
        </AdaptiveDialog>,
      )
      await user.click(await screen.findByRole('button', { name: 'Close' }))
      expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
    },
  )

  it('renders arbitrary content, accessible structure, and footer in a desktop dialog', async () => {
    render(
      <AdaptiveDialog
        open
        onOpenChange={vi.fn()}
        title="Export settings"
        description="Choose an export format."
        footer={<button>Save settings</button>}
        stickyHeader={<button>Change export format</button>}
      >
        <p>Independent feature content</p>
      </AdaptiveDialog>,
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Export settings',
    })
    expect(dialog).toHaveAttribute('data-slot', 'dialog-popup')
    expect(screen.getByText('Choose an export format.')).toBeVisible()
    expect(screen.getByText('Independent feature content')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Change export format' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeVisible()
  })

  it('uses a bottom drawer immediately below 768px and preserves caller content', async () => {
    setViewportWidth(767)
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <AdaptiveDialog
        open
        onOpenChange={onOpenChange}
        title="Unrelated panel"
        footer={<button>Apply unrelated setting</button>}
        stickyHeader={<p>Caller-owned controls</p>}
      >
        <p>Content belongs to the caller.</p>
      </AdaptiveDialog>,
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Unrelated panel',
    })
    expect(dialog).toHaveAttribute('data-slot', 'drawer-popup')
    expect(screen.getByText('Content belongs to the caller.')).toBeVisible()
    expect(screen.getByText('Caller-owned controls')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Apply unrelated setting' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })

  it('uses a dialog at exactly 768px and reports dismissal without owning state', async () => {
    setViewportWidth(768)
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <AdaptiveDialog
        open
        onOpenChange={onOpenChange}
        title="Keyboard accessible panel"
      >
        <p>Focused content</p>
      </AdaptiveDialog>,
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Keyboard accessible panel',
    })
    expect(dialog).toHaveAttribute('data-slot', 'dialog-popup')
    await user.keyboard('{Escape}')
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })
})
