import { afterEach, expect, it } from 'vitest'
import {
  attachProfileEditor,
  confirmDiscardProfileChanges,
  hasUnsavedProfileChanges,
  invalidateUnsavedProfileChanges,
  profileEditingStore,
} from './profile-editing'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import { createProfileEditor } from '../../../tests/support/vitest/profile-editor'

const disposals: Array<() => void> = []
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()))

function editor() {
  const profile = createProfileEditor()
  disposals.push(profile.dispose)
  return profile
}

it('allows local navigation and reload without a confirmation when there are no unsaved edits', async () => {
  expect(await confirmDiscardProfileChanges()).toBe(true)
  const profile = editor()
  expect(await confirmDiscardProfileChanges()).toBe(true)
  expect(profileEditingStore.state.confirmation).toBeNull()
  profile.edit('Unsaved business')
  profile.edit(createBusinessProfileScenario().businessName)
  expect(await confirmDiscardProfileChanges()).toBe(true)
})

it('restores the latest raw saved baseline once before granting every waiting permission', async () => {
  const profile = editor()
  profile.edit('  Saved business  ')
  profile.saved(profile.values())
  expect(hasUnsavedProfileChanges()).toBe(false)
  profile.edit('Unsaved business')
  const navigation = confirmDiscardProfileChanges().then((allowed) => ({
    allowed,
    name: profile.values().businessName,
  }))
  const reload = confirmDiscardProfileChanges().then((allowed) => ({
    allowed,
    name: profile.values().businessName,
  }))
  profileEditingStore.state.confirmation?.answer(true)
  expect(await navigation).toEqual({
    allowed: true,
    name: '  Saved business  ',
  })
  expect(await reload).toEqual({ allowed: true, name: '  Saved business  ' })
  expect(profile.restored.map((values) => values.businessName)).toEqual([
    '  Saved business  ',
  ])
  expect(hasUnsavedProfileChanges()).toBe(false)
  expect(profileEditingStore.state.confirmation).toBeNull()
})

it('retains edits and denies every waiting action when the user stays', async () => {
  const profile = editor()
  profile.edit('Unsaved business')
  const navigation = confirmDiscardProfileChanges()
  const reload = confirmDiscardProfileChanges()
  profileEditingStore.state.confirmation?.answer(false)
  expect(await navigation).toBe(false)
  expect(await reload).toBe(false)
  expect(profile.values().businessName).toBe('Unsaved business')
  expect(hasUnsavedProfileChanges()).toBe(true)
  expect(profileEditingStore.state.confirmation).toBeNull()
  expect(profile.restored).toEqual([])
})

it('denies all pending actions and closes confirmation when their editor disappears', async () => {
  const profile = editor()
  profile.edit('Unsaved business')
  const navigation = confirmDiscardProfileChanges()
  const reload = confirmDiscardProfileChanges()
  expect(profileEditingStore.state.confirmation).not.toBeNull()
  profile.dispose()
  expect(profileEditingStore.state.confirmation).toBeNull()
  expect(await navigation).toBe(false)
  expect(await reload).toBe(false)
  expect(hasUnsavedProfileChanges()).toBe(false)
  expect(profile.values().businessName).toBe('Unsaved business')
})

it('isolates a replacement editor from departed cleanup, saved publications and confirmation answers', async () => {
  const departed = editor()
  departed.edit('Departed edits')
  const staleNavigation = confirmDiscardProfileChanges()
  const staleReload = confirmDiscardProfileChanges()
  const staleConfirmation = profileEditingStore.state.confirmation

  const replacement = editor()
  expect(await staleNavigation).toBe(false)
  expect(await staleReload).toBe(false)
  expect(profileEditingStore.state.confirmation).toBeNull()
  replacement.edit('Replacement edits')
  const navigation = confirmDiscardProfileChanges()
  const confirmation = profileEditingStore.state.confirmation
  let settled = false
  void navigation.then(() => {
    settled = true
  })

  departed.dispose()
  departed.edit('Late departed edit')
  departed.saved(departed.values())
  staleConfirmation?.answer(true)
  staleConfirmation?.answer(false)
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(profileEditingStore.state.confirmation).toBe(confirmation)
  expect(hasUnsavedProfileChanges()).toBe(true)
  expect(replacement.values().businessName).toBe('Replacement edits')

  confirmation?.answer(true)
  expect(await navigation).toBe(true)
  expect(replacement.values().businessName).toBe(
    createBusinessProfileScenario().businessName,
  )
})

it('ignores a queued form publication from a replaced editor', () => {
  const baseline = createBusinessProfileScenario()
  let queuedPublication = () => {}
  const departed = attachProfileEditor(baseline, {
    getValues: () => baseline,
    subscribe: (changed) => {
      queuedPublication = changed
      return () => {}
    },
    restore: () => {},
    invalidateImport: () => {},
  })
  disposals.push(departed.dispose)
  const replacement = editor()
  replacement.edit('Replacement edits')
  queuedPublication()
  expect(hasUnsavedProfileChanges()).toBe(true)
  expect(replacement.values().businessName).toBe('Replacement edits')
})

it('ignores an already answered confirmation when the same editor requests permission again', async () => {
  const profile = editor()
  profile.edit('Unsaved business')
  const first = confirmDiscardProfileChanges()
  const obsolete = profileEditingStore.state.confirmation
  obsolete?.answer(false)
  expect(await first).toBe(false)
  const second = confirmDiscardProfileChanges()
  const current = profileEditingStore.state.confirmation
  obsolete?.answer(true)
  expect(profileEditingStore.state.confirmation).toBe(current)
  expect(profile.values().businessName).toBe('Unsaved business')
  current?.answer(false)
  expect(await second).toBe(false)
})

it('denies pre-reset navigation and reload before restoring obsolete work', async () => {
  const profile = editor()
  profile.edit('Pre-reset edits')
  const navigation = confirmDiscardProfileChanges()
  const reload = confirmDiscardProfileChanges()
  const obsolete = profileEditingStore.state.confirmation
  invalidateUnsavedProfileChanges()
  expect(await navigation).toBe(false)
  expect(await reload).toBe(false)
  expect(profile.values().businessName).toBe(
    createBusinessProfileScenario().businessName,
  )
  expect(hasUnsavedProfileChanges()).toBe(false)
  expect(profileEditingStore.state.confirmation).toBeNull()
  obsolete?.answer(true)
  expect(await confirmDiscardProfileChanges()).toBe(true)
  invalidateUnsavedProfileChanges()
})

it('denies all callers and preserves the diagnostic error if restoration cannot complete', async () => {
  const baseline = createBusinessProfileScenario()
  const failure = new Error('form restoration failed')
  const profile = attachProfileEditor(baseline, {
    getValues: () => ({ ...baseline, businessName: 'Unsaved business' }),
    subscribe: () => () => {},
    invalidateImport: () => {},
    restore: () => {
      throw failure
    },
  })
  disposals.push(profile.dispose)
  const navigation = confirmDiscardProfileChanges()
  const reload = confirmDiscardProfileChanges()
  expect(() => profileEditingStore.state.confirmation?.answer(true)).toThrow(
    failure,
  )
  expect(await navigation).toBe(false)
  expect(await reload).toBe(false)
  expect(hasUnsavedProfileChanges()).toBe(true)
  expect(profileEditingStore.state.confirmation).toBeNull()
})
