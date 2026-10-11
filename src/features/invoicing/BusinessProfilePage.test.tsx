// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, waitFor } from '@testing-library/react'
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

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.localStorage.clear()
  businessProfileStorageStatus.setState(() => ({ error: null }))
})

afterEach(() => {
  cleanup()
  disposeTestRouters()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('business profile settings', () => {
  it('starts blank, persists edits locally, and selects the Invoice route after a valid save', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    await renderAtRoute('/business-profile', BusinessProfilePage)

    await businessProfile.expectReady()
    businessProfile.expectAllFieldsEmpty()
    businessProfile.expectSaveDisabled()
    businessProfile.expectExportDisabled()

    await businessProfile.enterProfile(profile)
    await businessProfile.expectSaveEnabled()

    const persisted = await createBusinessProfileRepository(
      window.localStorage,
    ).loadProfile()
    expect(persisted).toEqual(profile)
    await businessProfile.save()

    await businessProfile.expectInvoiceRouteSelected()
    await businessProfile.expectNotice('Profil gespeichert.')
  })

  it('shows touched validation errors and accepts a tax number instead of a VAT ID', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario({
      vatId: '',
      taxNumber: '12/345/67890',
    })
    await renderAtRoute('/business-profile', BusinessProfilePage)
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
    await renderAtRoute('/business-profile', BusinessProfilePage)
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
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await businessProfile.expectReady()

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
    businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
  })

  it('restores an unconfirmed partial backup when no profile exists', async () => {
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
    await renderAtRoute('/business-profile', BusinessProfilePage)
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

    await businessProfile.expectNotice('Profilsicherung wiederhergestellt.')
    businessProfile.expectFieldValue('businessName', 'Teilprofil Betrieb')
    businessProfile.expectSaveDisabled()
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(partial)
  })

  it('rejects malformed backups without changing saved profile data', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await businessProfile.expectReady()

    await businessProfile.importBackup(
      new File(['not-json'], 'invalid.json', { type: 'application/json' }),
    )
    await businessProfile.confirmImport()

    await businessProfile.expectNotice(
      'Die Profilsicherung konnte nicht importiert werden.',
    )
    businessProfile.expectFieldValue('businessName', 'Nordlicht Catering')
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
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await businessProfile.expectReady()
    businessProfile.expectProfileValues(profile)

    await businessProfile.requestDeletion()
    await businessProfile.cancelDeletion()
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
  })

  it('reports export and deletion failures without downloading a backup or claiming success', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/business-profile', BusinessProfilePage)
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

  it('ignores unrelated storage events and locks editing after a profile change in another tab', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await businessProfile.expectReady()

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
    businessProfile.expectNoNotice('Profil in einem anderen Tab geändert')
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    await businessProfile.expectNotice('Profil in einem anderen Tab geändert')
    await businessProfile.closeNotice()
    businessProfile.expectFieldDisabled('businessName')
  })

  it('reports local storage read and write failures instead of claiming success', async () => {
    const user = userEvent.setup()
    const businessProfile = new BusinessProfileRobot(user)
    const profile = createBusinessProfileScenario({ businessName: 'Betrieb' })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await businessProfile.expectStorageUnavailable()

    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === BUSINESS_PROFILE_STORAGE_KEY)
        throw new Error('storage unavailable')
      return originalSetItem.call(this, key, value)
    })
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({ businessName: profile.businessName })

    await businessProfile.expectStorageSaveFailure()
    await businessProfile.closeNotice()
    businessProfile.expectFieldDisabled('businessName')
    businessProfile.expectNoNotice('Profil gespeichert.')
  })
})
