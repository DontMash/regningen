export class AcknowledgmentPersistenceError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Release-note acknowledgment ${operation} failed.`, { cause })
    this.name = 'AcknowledgmentPersistenceError'
  }
}

/** Each owner opens its own session after hydration and disposes it on cleanup.
 * Acknowledge merges with the latest persisted versions, under a browser lock
 * where available. Expected storage failures reject with diagnostic context;
 * programming defects are not persistence outcomes.
 */
export interface AcknowledgmentPersistence {
  load: () => Promise<string[]>
  acknowledge: (versions: string[]) => Promise<void>
  subscribe: (listener: (versions: string[]) => void) => Promise<void> | void
  dispose: () => Promise<void> | void
}

export type OpenAcknowledgmentPersistence = () => AcknowledgmentPersistence
