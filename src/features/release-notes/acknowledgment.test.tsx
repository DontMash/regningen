// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Toaster } from '@/components/ui/toast'
import { AcknowledgmentPersistenceError } from './acknowledgment-persistence'
import type { AcknowledgmentPersistence } from './acknowledgment-persistence'
import { setLocale } from '@/paraglide/runtime'
import { ReleaseNotesProvider } from './ReleaseNotesProvider'

vi.mock('@/lib/application-release', () => ({
  applicationVersion: '2.0.0',
  applicationReleases: [{ version: '2.0.0', markdown: 'Current release.' }],
}))
beforeEach(() => {
  setLocale('en', { reload: false })
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('uses the supplied acknowledgments and releases its subscription on unmount', async () => {
  const dispose = vi.fn()
  const persistence = () => ({
    load: async () => ['2.0.0'],
    acknowledge: async () => {},
    subscribe: () => {},
    dispose,
  })
  const view = render(
    <ReleaseNotesProvider persistence={persistence}>
      Ready
    </ReleaseNotesProvider>,
  )
  await act(async () => {})
  expect(screen.queryByRole('dialog')).toBeNull()
  view.unmount()
  await waitFor(() => expect(dispose).toHaveBeenCalled())
})

it('closes automatic notes on supplied external acknowledgments and ignores updates after cleanup', async () => {
  let publish: (versions: string[]) => void = () => {}
  const session: AcknowledgmentPersistence = {
    load: async () => [],
    acknowledge: async () => {},
    subscribe: (listener) => {
      publish = listener
    },
    dispose: () => {},
  }
  const view = render(
    <ReleaseNotesProvider persistence={() => session}>
      Ready
    </ReleaseNotesProvider>,
  )
  expect(await screen.findByRole('dialog')).toBeVisible()
  act(() => publish(['2.0.0']))
  expect(screen.queryByRole('dialog')).toBeNull()
  view.unmount()
  act(() => publish([]))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('suppresses a failed acknowledgment notification after its owner unmounts', async () => {
  let rejectWrite: (reason: unknown) => void = () => {}
  const write = new Promise<void>((_resolve, reject) => {
    rejectWrite = reject
  })
  const session: AcknowledgmentPersistence = {
    load: async () => [],
    acknowledge: () => write,
    subscribe: () => {},
    dispose: () => {},
  }
  const view = render(
    <ReleaseNotesProvider persistence={() => session}>
      Ready
    </ReleaseNotesProvider>,
  )
  render(<Toaster />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Understood' }))
  view.unmount()
  await act(async () =>
    rejectWrite(
      new AcknowledgmentPersistenceError('write', new Error('quota')),
    ),
  )
  expect(
    screen.queryByText('Read release notes could not be saved.'),
  ).toBeNull()
})

it('acknowledges the running release through supplied operations while retaining history', async () => {
  let saved = ['1.0.0']
  const session: AcknowledgmentPersistence = {
    load: async () => saved,
    acknowledge: async (versions) => {
      saved = [...new Set([...saved, ...versions])]
    },
    subscribe: () => {},
    dispose: () => {},
  }
  render(
    <ReleaseNotesProvider persistence={() => session}>
      Ready
    </ReleaseNotesProvider>,
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Understood' }))
  expect(await session.load()).toEqual(['1.0.0', '2.0.0'])
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('ignores a late initial read after cleanup', async () => {
  let resolveRead: (versions: string[]) => void = () => {}
  const load = new Promise<string[]>((resolve) => {
    resolveRead = resolve
  })
  const session: AcknowledgmentPersistence = {
    load: () => load,
    acknowledge: async () => {},
    subscribe: () => {},
    dispose: () => {},
  }
  const view = render(
    <ReleaseNotesProvider persistence={() => session}>
      Ready
    </ReleaseNotesProvider>,
  )
  view.unmount()
  await act(async () => resolveRead([]))
  expect(screen.queryByRole('dialog')).toBeNull()
})
