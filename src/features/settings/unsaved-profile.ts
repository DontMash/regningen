import { Store } from '@tanstack/store'

export const unsavedProfileStore = new Store({
  dirty: false,
  confirming: false,
})
let discardHandler: (() => void) | undefined
let confirmations: Array<(allowed: boolean) => void> = []

export function hasUnsavedProfileChanges() {
  return unsavedProfileStore.state.dirty
}

export function setUnsavedProfileChanges(dirty: boolean) {
  unsavedProfileStore.setState((current) => ({ ...current, dirty }))
}

export function registerProfileDiscardHandler(handler: () => void) {
  discardHandler = handler
  return () => {
    if (discardHandler === handler) discardHandler = undefined
  }
}

export function confirmDiscardProfileChanges(): Promise<boolean> {
  if (!hasUnsavedProfileChanges()) return Promise.resolve(true)
  unsavedProfileStore.setState((current) => ({ ...current, confirming: true }))
  return new Promise((resolve) => confirmations.push(resolve))
}

export function resolveProfileDiscardConfirmation(allowed: boolean) {
  if (allowed) discardHandler?.()
  unsavedProfileStore.setState((current) => ({
    dirty: allowed ? false : current.dirty,
    confirming: false,
  }))
  const pending = confirmations
  confirmations = []
  pending.forEach((resolve) => resolve(allowed))
}

export function discardUnsavedProfileChanges() {
  resolveProfileDiscardConfirmation(true)
}

/** Reset supersedes pending user intents rather than approving stale navigation. */
export function invalidateUnsavedProfileChanges() {
  resolveProfileDiscardConfirmation(false)
  discardUnsavedProfileChanges()
}
