// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessProfilePage from './BusinessProfilePage'
import { BusinessProfileRobot } from '../../../tests/robots/vitest/business-profile'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import {
  BUSINESS_PROFILE_STORAGE_KEY,
  createBusinessProfileRepository,
} from './business-profile-repository'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import {
  disposeTestRouters,
  renderAtRoute,
} from '../../../tests/support/vitest/render'

import { saveBusinessProfile } from '../../../tests/support/vitest/business-profile'
import {
  discardUnsavedProfileChanges,
  hasUnsavedProfileChanges,
  setUnsavedProfileChanges,
} from '../settings/unsaved-profile'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.localStorage.clear()
  businessProfileStorageStatus.setState(() => ({ error: null }))
  setUnsavedProfileChanges(false)
})

afterEach(() => {
  cleanup()
  disposeTestRouters()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('business profile settings', () => {
  it('refuses a stale profile Save after application-reset invalidation even before a browser event arrives', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({
      businessName: 'Pre-reset working business',
    })
    window.localStorage.setItem(
      'regningen.application-reset.generation',
      'new-reset-generation',
    )
    await businessProfile.save()
    await businessProfile.expectNotice(
      'Profil konnte nicht gespeichert werden.',
    )
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toBeNull()
    expect(hasUnsavedProfileChanges()).toBe(true)
  })

  it('keeps edits local until valid Save, stays on Profil, and offers the Invoice editor', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    await renderAtRoute('/settings/profile', BusinessProfilePage)

    await businessProfile.expectReady()
    businessProfile.expectAllFieldsEmpty()
    businessProfile.expectSaveDisabled()
    businessProfile.expectExportDisabled()

    await businessProfile.enterProfile(profile)
    await businessProfile.expectSaveEnabled()

    const persisted = await createBusinessProfileRepository(
      window.localStorage,
    ).loadProfile()
    expect(persisted).toBeNull()
    await businessProfile.save()

    await businessProfile.expectNotice('Profil gespeichert.')
    await businessProfile.expectReady()
    businessProfile.expectProfileValues(profile)
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
    await businessProfile.openInvoiceEditor()
    await businessProfile.expectInvoiceRouteSelected()
  })

  it('reports only values differing from the saved baseline as unsaved, including after Save', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    expect(hasUnsavedProfileChanges()).toBe(false)

    await businessProfile.enterProfile({ businessName: 'Geänderter Betrieb' })
    expect(hasUnsavedProfileChanges()).toBe(true)
    await businessProfile.enterProfile({ businessName: profile.businessName })
    expect(hasUnsavedProfileChanges()).toBe(false)

    await businessProfile.enterProfile({
      businessName: 'Gespeicherter Betrieb',
    })
    await businessProfile.save()
    await businessProfile.expectNotice('Profil gespeichert.')
    expect(hasUnsavedProfileChanges()).toBe(false)
    await businessProfile.enterProfile({ businessName: profile.businessName })
    expect(hasUnsavedProfileChanges()).toBe(true)
    await businessProfile.enterProfile({
      businessName: 'Gespeicherter Betrieb',
    })
    expect(hasUnsavedProfileChanges()).toBe(false)

    await businessProfile.enterProfile({ businessName: 'Nicht speichern' })
    expect(hasUnsavedProfileChanges()).toBe(true)
    cleanup()
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('restores the last successful saved baseline when discard is explicitly accepted', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({
      businessName: 'Neue gespeicherte Firma',
    })
    await businessProfile.save()
    await businessProfile.expectNotice('Profil gespeichert.')
    await businessProfile.enterProfile({ businessName: 'Verwerfen' })

    act(() => discardUnsavedProfileChanges())

    businessProfile.expectFieldValue('businessName', 'Neue gespeicherte Firma')
    expect(hasUnsavedProfileChanges()).toBe(false)
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual({ ...profile, businessName: 'Neue gespeicherte Firma' })

    await createBusinessProfileRepository(window.localStorage).deleteProfile()
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    await waitFor(() => businessProfile.expectExportDisabled())
    businessProfile.expectFieldValue('businessName', 'Neue gespeicherte Firma')
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('keeps an older saved empty profile editable with backup and deletion available but no Invoice action', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario({
      businessName: '',
      serviceDescription: '',
      ownerName: '',
      street: '',
      postalCode: '',
      town: '',
      phone: '',
      mobile: '',
      iban: '',
      vatId: '',
      taxNumber: '',
    })
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    businessProfile.expectAllFieldsEmpty()
    businessProfile.expectSaveDisabled()
    businessProfile.expectExportEnabled()
    businessProfile.expectNoInvoiceAction()
    await businessProfile.enterProfile({
      businessName: 'Älteres Profil ergänzen',
    })
    expect(hasUnsavedProfileChanges()).toBe(true)
    await businessProfile.requestDeletion()
    await businessProfile.cancelDeletion()
    businessProfile.expectFieldValue('businessName', 'Älteres Profil ergänzen')
  })

  it('shows touched validation errors and accepts a tax number instead of a VAT ID', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario({
      vatId: '',
      taxNumber: '12/345/67890',
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()

    await businessProfile.enterProfile({ vatId: 'DE123' })
    await businessProfile.touchField('vatId')
    await businessProfile.expectInvalidVatIdFeedback()
    businessProfile.expectSaveDisabled()

    await businessProfile.enterProfile(profile)
    await businessProfile.expectSaveEnabled()
  })

  it('marks tax identifiers as an either/or requirement and shows feedback after touching either input', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario({
      taxNumber: '12/345/67890',
      vatId: 'DE123',
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    businessProfile.expectRequiredAndOptionalFieldMarkers()
    businessProfile.expectTaxIdentifiersAreAlternative()
    businessProfile.expectNoTaxIdentifierErrors()

    await businessProfile.touchField('taxNumber')
    businessProfile.expectMissingTaxIdentifierFeedback()
    await businessProfile.enterProfile({ taxNumber: profile.taxNumber })
    businessProfile.expectNoTaxIdentifierErrors()
    await businessProfile.enterProfile({ vatId: profile.vatId })
    await businessProfile.touchField('vatId')
    await businessProfile.expectInvalidVatIdFeedback()
    businessProfile.expectTaxNumberValid()
  })

  it('exports every saved profile field and preserves the profile when import is cancelled', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario({
      mobile: '0171 2345678',
      iban: 'DE89 3704 0044 0532 0130 00',
      taxNumber: '12/345/67890',
    })
    saveBusinessProfile(profile)
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => 'blob:profile-backup',
    )
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    )
    const downloads: Array<{ filename: string; href: string }> = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ filename: this.download, href: this.href })
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({
      businessName: 'Nicht exportierte Eingabe',
    })

    await businessProfile.exportBackup()
    await businessProfile.expectNotice('Sicherung erstellt.')
    expect(downloads).toEqual([
      {
        filename: 'regningen-unternehmensprofil.json',
        href: 'blob:profile-backup',
      },
    ])
    expect(createObjectURL).toHaveBeenCalledOnce()
    const [blob] = createObjectURL.mock.calls[0]
    expect(blob.type).toBe('application/json')
    expect(JSON.parse(await blob.text())).toEqual({
      format: 'regningen-business-profile',
      version: 1,
      profile,
    })

    await businessProfile.importBackup(
      new File(
        [
          JSON.stringify({
            format: 'regningen-business-profile',
            version: 1,
            profile: {
              ...profile,
              businessName: 'Neue Firma',
            },
          }),
        ],
        'backup.json',
        { type: 'application/json' },
      ),
    )
    await businessProfile.expectImportConfirmation()
    await businessProfile.cancelImport()
    businessProfile.expectFieldValue(
      'businessName',
      'Nicht exportierte Eingabe',
    )
    expect(hasUnsavedProfileChanges()).toBe(true)
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
  })

  it('stages a partial backup without saving and lets the user complete it before Save', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const partial = createBusinessProfileScenario({
      businessName: 'Teilprofil Betrieb',
      serviceDescription: '',
      ownerName: '',
      street: '',
      postalCode: '',
      town: '',
      phone: '',
      mobile: '',
      iban: '',
      vatId: '',
      taxNumber: '',
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.importBackup(
      new File(
        [
          JSON.stringify({
            format: 'regningen-business-profile',
            version: 1,
            profile: partial,
          }),
        ],
        'partial.json',
        { type: 'application/json' },
      ),
    )

    await businessProfile.expectNotice(
      'Profilsicherung geladen. Bitte Profil speichern.',
    )
    businessProfile.expectFieldValue('businessName', 'Teilprofil Betrieb')
    businessProfile.expectSaveDisabled()
    businessProfile.expectExportDisabled()
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toBeNull()

    const completed = createBusinessProfileScenario({
      businessName: 'Teilprofil Betrieb',
    })
    await businessProfile.enterProfile(completed)
    await businessProfile.save()
    await businessProfile.expectNotice('Profil gespeichert.')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(completed)
  })

  it('stages a confirmed complete backup, preserves it across remote deletion, and persists only on Save', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const saved = createBusinessProfileScenario()
    const imported = createBusinessProfileScenario({
      businessName: 'Importierte Firma',
    })
    saveBusinessProfile(saved)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()

    await businessProfile.importBackup(
      new File(
        [
          JSON.stringify({
            format: 'regningen-business-profile',
            version: 1,
            profile: imported,
          }),
        ],
        'complete.json',
        { type: 'application/json' },
      ),
    )
    await businessProfile.confirmImport()
    await businessProfile.expectNotice(
      'Profilsicherung geladen. Bitte Profil speichern.',
    )
    businessProfile.expectProfileValues(imported)
    expect(hasUnsavedProfileChanges()).toBe(true)
    const repository = createBusinessProfileRepository(window.localStorage)
    expect(await repository.loadProfile()).toEqual(saved)

    await repository.deleteProfile()
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    await waitFor(() => businessProfile.expectExportDisabled())
    businessProfile.expectProfileValues(imported)
    expect(hasUnsavedProfileChanges()).toBe(true)
    await businessProfile.save()
    await businessProfile.expectNotice('Profil gespeichert.')
    expect(await repository.loadProfile()).toEqual(imported)
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('rejects malformed backups without replacing saved or working values or locking editing', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({ businessName: 'Lokale Eingabe' })

    await businessProfile.importBackup(
      new File(['not-json'], 'invalid.json', { type: 'application/json' }),
    )
    await businessProfile.confirmImport()

    await businessProfile.expectNotice(
      'Die Profilsicherung konnte nicht importiert werden.',
    )
    businessProfile.expectFieldValue('businessName', 'Lokale Eingabe')
    expect(hasUnsavedProfileChanges()).toBe(true)
    await businessProfile.enterProfile({ businessName: 'Weiterhin editierbar' })
    await businessProfile.expectSaveEnabled()
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
  })

  it('cancels profile deletion or confirms it and clears every profile field', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario({
      mobile: '0171 2345678',
      taxNumber: '12/345/67890',
    })
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    businessProfile.expectProfileValues(profile)
    await businessProfile.enterProfile({ businessName: 'Ungespeicherte Firma' })

    await businessProfile.requestDeletion()
    await businessProfile.cancelDeletion()
    businessProfile.expectFieldValue('businessName', 'Ungespeicherte Firma')
    expect(hasUnsavedProfileChanges()).toBe(true)
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)

    await businessProfile.requestDeletion()
    await businessProfile.confirmDeletion()
    await waitFor(async () =>
      expect(
        await createBusinessProfileRepository(
          window.localStorage,
        ).loadProfile(),
      ).toBeNull(),
    )
    await businessProfile.expectNotice('Profil gelöscht.')
    businessProfile.expectAllFieldsEmpty()
    expect(hasUnsavedProfileChanges()).toBe(false)
    businessProfile.expectExportDisabled()
    await businessProfile.enterProfile({ businessName: 'Neue Firma' })
    expect(hasUnsavedProfileChanges()).toBe(true)
    await businessProfile.enterProfile({ businessName: '' })
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('reports export and deletion failures without downloading a backup or claiming success', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    const originalGetItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === BUSINESS_PROFILE_STORAGE_KEY)
        throw new Error('storage unavailable')
      return originalGetItem.call(this, key)
    })
    await businessProfile.exportBackup()
    await businessProfile.expectNotice(
      'Die Profilsicherung konnte nicht erstellt werden.',
    )
    businessProfile.expectNoNotice('Sicherung erstellt.')
    expect(anchorClick).not.toHaveBeenCalled()
    vi.restoreAllMocks()

    const originalRemoveItem = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === BUSINESS_PROFILE_STORAGE_KEY)
        throw new Error('storage unavailable')
      return originalRemoveItem.call(this, key)
    })
    await businessProfile.requestDeletion()
    await businessProfile.confirmDeletion()

    await businessProfile.expectNotice(
      'Das Profil konnte nicht aus diesem Browser gelöscht werden.',
    )
    businessProfile.expectNoNotice('Profil gelöscht.')
    await businessProfile.expectStorageSaveFailure()
    expect(
      await createBusinessProfileRepository({
        getItem: originalGetItem.bind(window.localStorage),
        setItem: window.localStorage.setItem.bind(window.localStorage),
        removeItem: () => {},
      }).loadProfile(),
    ).toEqual(profile)
  })

  it('recovers editing and deletion of an incomplete profile after a failed deletion without reloading', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario({ ownerName: '' })
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({
      businessName: 'Lokale Eingabe behalten',
    })
    const originalRemoveItem = Storage.prototype.removeItem
    const removalFault = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (key === BUSINESS_PROFILE_STORAGE_KEY)
          throw new Error('removal unavailable')
        return originalRemoveItem.call(this, key)
      })
    await businessProfile.requestDeletion()
    await businessProfile.confirmDeletion()
    await businessProfile.expectStorageSaveFailure()

    removalFault.mockRestore()
    await businessProfile.retryStorageRead()
    await businessProfile.expectReady()
    businessProfile.expectFieldValue('businessName', 'Lokale Eingabe behalten')
    expect(hasUnsavedProfileChanges()).toBe(true)
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
    await businessProfile.enterProfile({ ownerName: 'Erika Musterfrau' })
    await businessProfile.expectSaveEnabled()
    await businessProfile.requestDeletion()
    await businessProfile.confirmDeletion()
    await businessProfile.expectNotice('Profil gelöscht.')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toBeNull()
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('preserves local edits across silent remote saves and deletion, allowing a later Save to win', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()

    await businessProfile.enterProfile({ businessName: 'Lokaler Betrieb' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
    const repository = createBusinessProfileRepository(window.localStorage)
    await repository.saveProfile({ ...profile, businessName: 'Anderer Tab' })
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    businessProfile.expectNoNotice('Profil in einem anderen Tab geändert')
    businessProfile.expectFieldValue('businessName', 'Lokaler Betrieb')
    await businessProfile.expectSaveEnabled()

    await repository.deleteProfile()
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    await waitFor(() => businessProfile.expectExportDisabled())
    businessProfile.expectFieldValue('businessName', 'Lokaler Betrieb')
    businessProfile.expectNoNotice('Profil in einem anderen Tab geändert')
    await businessProfile.save()
    await businessProfile.expectNotice('Profil gespeichert.')
    expect(await repository.loadProfile()).toEqual({
      ...profile,
      businessName: 'Lokaler Betrieb',
    })
  })

  it('keeps the mounted form baseline even when another tab deletes an untouched saved profile', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()

    await createBusinessProfileRepository(window.localStorage).deleteProfile()
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    await waitFor(() => businessProfile.expectExportDisabled())
    businessProfile.expectProfileValues(profile)
    await businessProfile.expectSaveEnabled()
  })

  it('retains unsaved form values when synchronizing the saved profile fails to read storage', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({
      businessName: 'Lokale Werte behalten',
    })
    const originalGetItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === BUSINESS_PROFILE_STORAGE_KEY) throw new Error('read failed')
      return originalGetItem.call(this, key)
    })
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )

    await businessProfile.expectStorageSaveFailure()
    await businessProfile.closeNotice()
    businessProfile.expectFieldValue('businessName', 'Lokale Werte behalten')
    expect(hasUnsavedProfileChanges()).toBe(true)
    businessProfile.expectFieldDisabled('businessName')
  })

  it('reports local storage read failures instead of offering an empty editable profile', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectStorageUnavailable()
  })

  it('retains working values after failed Save and retries after storage recovers without retyping', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({
      businessName: 'Nicht gespeicherter Betrieb',
    })
    const originalSetItem = Storage.prototype.setItem
    const writeFault = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === BUSINESS_PROFILE_STORAGE_KEY)
          throw new Error('storage unavailable')
        return originalSetItem.call(this, key, value)
      })
    await businessProfile.save()
    await businessProfile.expectStorageSaveFailure()
    await businessProfile.closeNotice()
    businessProfile.expectFieldValue(
      'businessName',
      'Nicht gespeicherter Betrieb',
    )
    expect(hasUnsavedProfileChanges()).toBe(true)
    businessProfile.expectFieldDisabled('businessName')
    businessProfile.expectNoNotice('Profil gespeichert.')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)

    writeFault.mockRestore()
    await businessProfile.expectSaveEnabled()
    await businessProfile.save()
    await businessProfile.expectNotice('Profil gespeichert.')
    businessProfile.expectFieldValue(
      'businessName',
      'Nicht gespeicherter Betrieb',
    )
    expect(hasUnsavedProfileChanges()).toBe(false)
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual({ ...profile, businessName: 'Nicht gespeicherter Betrieb' })
  })
})
