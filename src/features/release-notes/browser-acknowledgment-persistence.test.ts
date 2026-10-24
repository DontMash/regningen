// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { openBrowserAcknowledgmentPersistence } from './browser-acknowledgment-persistence'
import { AcknowledgmentPersistenceError } from './acknowledgment-persistence'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('preserves storage failure context without translating programming defects', async () => {
  const session = openBrowserAcknowledgmentPersistence()
  const failure = new DOMException('Quota exhausted', 'QuotaExceededError')
  const write = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw failure
    })
  await expect(session.acknowledge(['2.0.0'])).rejects.toMatchObject({
    name: 'AcknowledgmentPersistenceError',
    cause: failure,
  })
  const defect = new TypeError('invalid integration')
  write.mockImplementation(() => {
    throw defect
  })
  await expect(session.acknowledge(['2.0.0'])).rejects.toBe(defect)
  await session.dispose()
})

it('decodes supported legacy entries without exposing invalid external values', async () => {
  localStorage.setItem(
    'regningen.release-notes.acknowledged-versions',
    '["1.0.0",null,42,"2.0.0"]',
  )
  const session = openBrowserAcknowledgmentPersistence()
  expect(await session.load()).toEqual(['1.0.0', '2.0.0'])
  await session.dispose()
})

it('gives denied browser access a contextual persistence failure', async () => {
  const failure = new DOMException('Denied', 'SecurityError')
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw failure
  })
  const session = openBrowserAcknowledgmentPersistence()
  await expect(session.load()).rejects.toBeInstanceOf(
    AcknowledgmentPersistenceError,
  )
  await session.dispose()
})
