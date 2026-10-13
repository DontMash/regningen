import { describe, expect, it } from 'vitest'
import {
  beginPwaCriticalOperation,
  runPwaCriticalOperation,
  waitForPwaCriticalOperations,
} from './pwa-critical-operations'

describe('local operations that defer a page reload', () => {
  it('waits for all PDF and Business Profile operations to settle', async () => {
    let finishPdf = () => {}
    let finishProfileWrite = () => {}
    const pdf = new Promise<void>((resolve) => {
      finishPdf = resolve
    })
    const profileWrite = new Promise<void>((resolve) => {
      finishProfileWrite = resolve
    })
    const pdfOperation = runPwaCriticalOperation(() => pdf)
    const profileOperation = runPwaCriticalOperation(() => profileWrite)
    let reloadReady = false
    const reload = waitForPwaCriticalOperations().then(() => {
      reloadReady = true
    })

    finishPdf()
    await pdfOperation
    expect(reloadReady).toBe(false)
    finishProfileWrite()
    await Promise.all([profileOperation, reload])
    expect(reloadReady).toBe(true)
  })

  it('resolves after repeated completion signals only when the operation is idle', async () => {
    const finish = beginPwaCriticalOperation()
    let reloadReady = false
    const reload = waitForPwaCriticalOperations().then(() => {
      reloadReady = true
    })

    finish()
    finish()
    await reload

    expect(reloadReady).toBe(true)
    await expect(waitForPwaCriticalOperations()).resolves.toBeUndefined()
  })
})
