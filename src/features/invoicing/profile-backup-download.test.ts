// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { downloadProfileBackup } from './profile-backup-download'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('cleans up a failed backup initiation and preserves its cause', () => {
  vi.useFakeTimers()
  const revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = () => 'blob:backup'
      static revokeObjectURL = revokeObjectURL
    },
  )
  const cause = new DOMException('download denied', 'SecurityError')
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    throw cause
  })
  expect(() => downloadProfileBackup('{}', 'backup.json')).toThrow(
    expect.objectContaining({ reason: 'backup', cause }),
  )
  expect(document.querySelector('a')).toBeNull()
  vi.runAllTimers()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
})
