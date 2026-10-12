import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  abortPwaUpdateParticipants,
  beginPwaCriticalOperation,
  preparePwaUpdateParticipants,
  registerUpdateParticipant,
  runPwaCriticalOperation,
} from './update-participants'

const cleanups: Array<() => void> = []

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

describe('coordinated update participants', () => {
  it('waits for pending PDF or profile work before asking features to capture state', async () => {
    const prepare = vi.fn()
    cleanups.push(registerUpdateParticipant({ prepare, abort: vi.fn() }))
    const finishOperation = beginPwaCriticalOperation()
    let preparationFinished = false

    const preparation = preparePwaUpdateParticipants('2.1.0').then(() => {
      preparationFinished = true
    })
    await Promise.resolve()
    expect(preparationFinished).toBe(false)
    expect(prepare).not.toHaveBeenCalled()

    finishOperation()
    await preparation
    expect(prepare).toHaveBeenCalledWith('2.1.0')
  })

  it('finishes each critical operation once even when its work rejects', async () => {
    const operation = vi.fn(async () => {
      throw new Error('storage write failed')
    })
    await expect(runPwaCriticalOperation(operation)).rejects.toThrow(
      'storage write failed',
    )

    const prepare = vi.fn()
    cleanups.push(registerUpdateParticipant({ prepare, abort: vi.fn() }))
    await preparePwaUpdateParticipants('2.1.0')
    expect(prepare).toHaveBeenCalledOnce()
  })

  it('aborts every feature participant after a preparation failure', async () => {
    const firstAbort = vi.fn()
    const secondAbort = vi.fn(() => {
      throw new Error('temporary cleanup blocked')
    })
    cleanups.push(
      registerUpdateParticipant({
        prepare: vi.fn(),
        abort: firstAbort,
      }),
      registerUpdateParticipant({
        prepare: vi.fn(),
        abort: secondAbort,
      }),
    )

    await abortPwaUpdateParticipants('2.1.0')
    expect(firstAbort).toHaveBeenCalledWith('2.1.0')
    expect(secondAbort).toHaveBeenCalledWith('2.1.0')
  })

  it('propagates a feature preparation failure so the worker can defer activation', async () => {
    cleanups.push(
      registerUpdateParticipant({
        prepare: async () => {
          throw new Error('tab storage is unavailable')
        },
        abort: vi.fn(),
      }),
    )

    await expect(preparePwaUpdateParticipants('2.1.0')).rejects.toThrow(
      'tab storage is unavailable',
    )
  })
})
