import * as m from '@/paraglide/messages'

const RESET_GENERATION_KEY = 'regningen.application-reset.generation'
const RESET_COMPLETED_KEY = 'regningen.application-reset.completed'
export const INITIAL_APPLICATION_RESET_GENERATION = 'initial'

const listeners = new Set<() => void>()
const invalidationListeners = new Set<() => Promise<void>>()
let observedGeneration = INITIAL_APPLICATION_RESET_GENERATION
let observedCompletion = INITIAL_APPLICATION_RESET_GENERATION
let preparation: Promise<void> = Promise.resolve()
let attached = false

/** The write fence changes even for a partly failed reset; it is not a preference. */
export function getApplicationResetGeneration(): string {
  try {
    return (
      window.localStorage.getItem(RESET_GENERATION_KEY) ??
      INITIAL_APPLICATION_RESET_GENERATION
    )
  } catch {
    return observedGeneration
  }
}

export function getCompletedApplicationResetGeneration() {
  try {
    return (
      window.localStorage.getItem(RESET_COMPLETED_KEY) ??
      INITIAL_APPLICATION_RESET_GENERATION
    )
  } catch {
    return observedCompletion
  }
}

function prepareApplicationReset() {
  const generation = getApplicationResetGeneration()
  if (generation !== observedGeneration) {
    observedGeneration = generation
    // Invoke synchronously to fence stores before a caller can queue more work.
    preparation = Promise.all(
      Array.from(invalidationListeners, (listener) => listener()),
    ).then(() => {})
    // Browser events cannot report failures to the resetting tab. Retain the
    // rejected promise so completion will not falsely announce local success.
    void preparation.catch(() => {})
  }
  return preparation
}

async function checkForApplicationReset() {
  const prepared = prepareApplicationReset()
  const generation = getApplicationResetGeneration()
  if (
    getCompletedApplicationResetGeneration() !== generation ||
    observedCompletion === generation
  ) {
    return
  }
  await prepared
  if (
    getApplicationResetGeneration() !== generation ||
    getCompletedApplicationResetGeneration() !== generation ||
    observedCompletion === generation
  ) {
    return
  }
  observedCompletion = generation
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('Application reset listener failed.', error)
    }
  }
}

function onResume() {
  void checkForApplicationReset().catch(() => {})
}

function onStorage(event: StorageEvent) {
  if (event.key === RESET_GENERATION_KEY || event.key === RESET_COMPLETED_KEY) {
    try {
      if (event.storageArea === window.localStorage) onResume()
    } catch {
      // Inaccessible browser storage cannot prove that a reset completed.
    }
  }
}

function syncBrowserListeners() {
  if (typeof window === 'undefined') return
  const needed = listeners.size > 0 || invalidationListeners.size > 0
  if (needed && !attached) {
    observedGeneration = getApplicationResetGeneration()
    observedCompletion = getCompletedApplicationResetGeneration()
    preparation = Promise.resolve()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onResume)
    window.addEventListener('pageshow', onResume)
    document.addEventListener('visibilitychange', onResume)
    attached = true
  } else if (!needed && attached) {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', onResume)
    window.removeEventListener('pageshow', onResume)
    document.removeEventListener('visibilitychange', onResume)
    attached = false
  }
}

/** Only completed resets notify public subscribers, after local draft cleanup. */
export function subscribeToApplicationReset(listener: () => void): () => void {
  listeners.add(listener)
  syncBrowserListeners()
  return () => {
    listeners.delete(listener)
    syncBrowserListeners()
  }
}

/** Internal preparation, separate from the public successful-reset event. */
export function subscribeToApplicationResetInvalidation(
  listener: () => Promise<void>,
): () => void {
  invalidationListeners.add(listener)
  syncBrowserListeners()
  return () => {
    invalidationListeners.delete(listener)
    syncBrowserListeners()
  }
}

export function beginApplicationReset(generation: string): Promise<void> {
  window.localStorage.setItem(RESET_GENERATION_KEY, generation)
  return prepareApplicationReset()
}

/** Publish only after all local user-data removals have succeeded. May throw. */
export async function publishApplicationReset(generation: string) {
  await prepareApplicationReset()
  if (getApplicationResetGeneration() !== generation) {
    throw new Error(m.settings_reset_conflict())
  }
  window.localStorage.setItem(RESET_COMPLETED_KEY, generation)
  await checkForApplicationReset()
}
