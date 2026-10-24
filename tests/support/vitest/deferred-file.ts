import { vi } from 'vitest'

/** Control the browser file-read boundary without timers or oversized inputs. */
export function deferredFileRead(name = 'backup.json') {
  let resolve: (text: string) => void = () => {
    throw new Error('File read not initialized')
  }
  let reject: (error: Error) => void = () => {
    throw new Error('File read not initialized')
  }
  const contents = new Promise<string>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  const file = new File([], name, { type: 'application/json' })
  vi.spyOn(file, 'text').mockImplementation(() => contents)
  return { file, resolve, reject }
}
