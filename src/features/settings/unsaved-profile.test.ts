import { afterEach, expect, it } from 'vitest'
import {
  confirmDiscardProfileChanges,
  discardUnsavedProfileChanges,
  hasUnsavedProfileChanges,
  resolveProfileDiscardConfirmation,
  registerProfileDiscardHandler,
  invalidateUnsavedProfileChanges,
  setUnsavedProfileChanges,
} from './unsaved-profile'

afterEach(() => discardUnsavedProfileChanges())

it('allows a local reload when no Business Profile edits are unsaved', async () => {
  expect(await confirmDiscardProfileChanges()).toBe(true)
})

it('discards working profile values before allowing waiting local navigation and reload', async () => {
  let workingName = 'Unsaved business'
  const unregister = registerProfileDiscardHandler(() => {
    workingName = 'Saved business'
  })
  setUnsavedProfileChanges(true)
  const navigation = confirmDiscardProfileChanges()
  const reload = confirmDiscardProfileChanges()
  resolveProfileDiscardConfirmation(true)
  expect(await navigation).toBe(true)
  expect(await reload).toBe(true)
  expect(workingName).toBe('Saved business')
  expect(hasUnsavedProfileChanges()).toBe(false)
  unregister()
})

it('invalidates unsaved edits on application reset without approving a previously requested navigation', async () => {
  setUnsavedProfileChanges(true)
  const staleNavigation = confirmDiscardProfileChanges()
  invalidateUnsavedProfileChanges()
  expect(await staleNavigation).toBe(false)
  expect(hasUnsavedProfileChanges()).toBe(false)
})

it('keeps unsaved Business Profile changes when abandoning a local reload is cancelled', async () => {
  setUnsavedProfileChanges(true)
  const permitted = confirmDiscardProfileChanges()
  resolveProfileDiscardConfirmation(false)
  expect(await permitted).toBe(false)
  expect(hasUnsavedProfileChanges()).toBe(true)
})
