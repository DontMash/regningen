// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessProfilePage from './BusinessProfilePage'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
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

import { deferredFileRead } from '../../../tests/support/vitest/deferred-file'

const originalGetLocale = getLocale

beforeEach(() => {
  overwriteGetLocale(() => 'de')
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
  overwriteGetLocale(originalGetLocale)
})

describe('business profile settings', () => {
  it('protects edits made while a backup is being read and explains the cancellation', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const read = deferredFileRead()
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.importBackup(read.file)
    await businessProfile.expectImportStatus('Profilsicherung wird gelesen …')

    await businessProfile.enterProfile({ businessName: 'Neuere Eingabe' })
    await act(async () =>
      read.resolve(
        JSON.stringify({
          format: 'regningen-business-profile',
          version: 1,
          profile: createBusinessProfileScenario({
            businessName: 'Veralteter Import',
          }),
        }),
      ),
    )

    businessProfile.expectFieldValue('businessName', 'Neuere Eingabe')
    await businessProfile.expectImportStatus(
      'Import abgebrochen. Neuere Eingaben bleiben erhalten.',
    )
    businessProfile.expectNoNotice(
      'Profilsicherung geladen. Bitte Profil speichern.',
    )
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toBeNull()
  })

  it.each(
    (['older-first', 'newer-first'] as const).flatMap((order) =>
      (['success', 'failure'] as const).map((completion) => ({
        order,
        completion,
      })),
    ),
  )(
    'only applies the latest selected backup ($order, stale $completion)',
    async ({ order, completion }) => {
      const businessProfile = new BusinessProfileRobot(userEvent.setup())
      const saved = createBusinessProfileScenario()
      saveBusinessProfile(saved)
      const older = deferredFileRead('older.json')
      const newer = deferredFileRead('newer.json')
      const envelope = (businessName: string) =>
        JSON.stringify({
          format: 'regningen-business-profile',
          version: 1,
          profile: createBusinessProfileScenario({ businessName }),
        })
      await renderAtRoute('/settings/profile', BusinessProfilePage)
      await businessProfile.expectReady()
      await businessProfile.importBackup(older.file)
      await businessProfile.confirmImport()
      await businessProfile.importBackup(newer.file)
      // Selection supersedes the old request even while confirmation is open.
      const completeOlder = async () => {
        await act(async () => {
          if (completion === 'success')
            older.resolve(envelope('Obsolete business'))
          else older.reject(new Error('obsolete read failure'))
        })
      }
      if (order === 'older-first') {
        await completeOlder()
        businessProfile.expectNoNotice(
          'Profilsicherung geladen. Bitte Profil speichern.',
        )
      }
      await businessProfile.confirmImport()
      businessProfile.expectFieldValue('businessName', saved.businessName)
      await act(async () => newer.resolve(envelope('Latest business')))
      if (order === 'newer-first') {
        await completeOlder()
      }
      businessProfile.expectFieldValue('businessName', 'Latest business')
      businessProfile.expectNoNotice(
        'Die Profilsicherung konnte nicht importiert werden.',
      )
      expect(
        await createBusinessProfileRepository(
          window.localStorage,
        ).loadProfile(),
      ).toEqual(saved)
    },
  )

  it.each(
    (['discard', 'delete', 'save', 'reset', 'leave'] as const).flatMap(
      (action) =>
        (['success', 'failure'] as const).map((completion) => ({
          action,
          completion,
        })),
    ),
  )(
    'does not restore obsolete imports or publish stale $completion after $action',
    async ({ action, completion }) => {
      const businessProfile = new BusinessProfileRobot(userEvent.setup())
      const profile = createBusinessProfileScenario()
      saveBusinessProfile(profile)
      const read = deferredFileRead()
      await renderAtRoute('/settings/profile', BusinessProfilePage)
      await businessProfile.expectReady()
      await businessProfile.enterProfile({ businessName: 'Working business' })
      await businessProfile.importBackup(read.file)
      await businessProfile.confirmImport()
      if (action === 'discard') act(() => discardUnsavedProfileChanges())
      if (action === 'delete') {
        await businessProfile.requestDeletion()
        await businessProfile.confirmDeletion()
        await businessProfile.expectNotice('Profil gelöscht.')
      }
      if (action === 'save') {
        await businessProfile.save()
        await businessProfile.expectNotice('Profil gespeichert.')
      }
      if (action === 'reset')
        window.localStorage.setItem(
          'regningen.application-reset.generation',
          'reset-during-import',
        )
      if (action === 'leave') {
        await businessProfile.openInvoiceEditor()
        await businessProfile.expectInvoiceRouteSelected()
      }
      await act(async () => {
        if (completion === 'failure')
          read.reject(new Error('obsolete read failure'))
        else
          read.resolve(
            JSON.stringify({
              format: 'regningen-business-profile',
              version: 1,
              profile: createBusinessProfileScenario({
                businessName: 'Obsolete import',
              }),
            }),
          )
      })
      businessProfile.expectNoNotice(
        'Profilsicherung geladen. Bitte Profil speichern.',
      )
      businessProfile.expectNoNotice(
        'Die Profilsicherung konnte nicht importiert werden.',
      )
      if (action !== 'leave')
        businessProfile.expectFieldValue(
          'businessName',
          action === 'delete'
            ? ''
            : action === 'discard'
              ? profile.businessName
              : 'Working business',
        )
      expect(
        await createBusinessProfileRepository(
          window.localStorage,
        ).loadProfile(),
      ).toEqual(
        action === 'delete' || action === 'reset'
          ? null
          : action === 'save'
            ? { ...profile, businessName: 'Working business' }
            : profile,
      )
    },
  )

  it.each(['read-failure', 'malformed', 'unsupported'] as const)(
    'reports a current %s in English without changing working or saved values',
    async (failure) => {
      overwriteGetLocale(() => 'en')
      const businessProfile = new BusinessProfileRobot(userEvent.setup())
      const read = deferredFileRead()
      await renderAtRoute('/settings/profile', BusinessProfilePage)
      await businessProfile.expectNotice('Business Profile')
      await businessProfile.importBackup(read.file)
      await businessProfile.expectImportStatus('Reading profile backup …')
      await act(async () => {
        if (failure === 'read-failure')
          read.reject(new Error('file unavailable'))
        else
          read.resolve(failure === 'malformed' ? 'not-json' : '{"version":99}')
      })
      await businessProfile.expectNotice(
        'The profile backup could not be imported.',
      )
      businessProfile.expectNoNotice('Reading profile backup …')
      expect(
        await createBusinessProfileRepository(
          window.localStorage,
        ).loadProfile(),
      ).toBeNull()
      overwriteGetLocale(() => 'de')
      // A further upload causes a render in the current locale and remains editable.
      await businessProfile.importBackup(
        new File(['not-json'], 'retry.json', { type: 'application/json' }),
      )
      await businessProfile.expectNotice(
        'Die Profilsicherung konnte nicht importiert werden.',
      )
      businessProfile.expectAllFieldsEmpty()
    },
  )

  it('explains edit cancellation in English and suppresses the late read failure', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const read = deferredFileRead()
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.importBackup(read.file)
    overwriteGetLocale(() => 'en')
    await businessProfile.enterProfile({ businessName: 'Newer business' })
    await businessProfile.expectImportStatus(
      'Import canceled. Newer inputs have been kept.',
    )
    await act(async () => read.reject(new Error('obsolete failure')))
    businessProfile.expectNoNotice('The profile backup could not be imported.')
    businessProfile.expectNoNotice(
      'Profile backup loaded. Please save the profile.',
    )
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toBeNull()
  })

  it('keeps the form when a newer replacement is canceled and suppresses an earlier pending read', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    const older = deferredFileRead()
    const newer = deferredFileRead('newer.json')
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.importBackup(older.file)
    await businessProfile.confirmImport()
    await businessProfile.importBackup(newer.file)
    await businessProfile.cancelImport()
    await businessProfile.expectImportStatus(
      'Import abgebrochen. Das Profil wurde nicht importiert.',
    )
    await act(async () => older.reject(new Error('obsolete read failure')))
    businessProfile.expectNoNotice(
      'Die Profilsicherung konnte nicht importiert werden.',
    )
    businessProfile.expectProfileValues(profile)
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('shows English Business Profile setup and backup guidance', async () => {
    overwriteGetLocale(() => 'en')
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    await renderAtRoute('/settings/profile', BusinessProfilePage)

    await businessProfile.expectNotice('Business Profile')
    await businessProfile.expectNotice('Business name')
    await businessProfile.expectNotice('Owner')
    await businessProfile.expectNotice('Save profile')
    await businessProfile.expectNotice('Export backup')
    await businessProfile.expectNotice('Import backup')
    await businessProfile.expectNotice(
      'These details are stored only in this browser and used for your invoices. There is no user account or invoice archive.',
    )
    await businessProfile.expectNotice(
      'Backups are unencrypted JSON files containing sensitive business data. Store them securely.',
    )
  })

  it('offers English field labels and saved-profile actions without changing stored content', async () => {
    overwriteGetLocale(() => 'en')
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario({
      businessName: 'Unveränderter Betrieb',
      ownerName: 'Renée Beispiel',
    })
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)

    for (const message of [
      'Invoice issuer details',
      'Service description',
      'Street and house number',
      'Postal code',
      'Town or city',
      'Phone',
      'Mobile phone',
      'VAT ID',
      'Tax number',
      'Invoice',
      'Back up profile',
      'Delete Business Profile',
      'Delete profile',
      'Previously downloaded PDFs will not be deleted.',
    ]) {
      await businessProfile.expectNotice(message)
    }
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('shows English storage-read recovery instead of an editable empty profile', async () => {
    overwriteGetLocale(() => 'en')
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)

    await businessProfile.expectNotice('Business Profile unavailable')
    await businessProfile.expectNotice(
      'The browser cannot read the profile. Check the local storage settings and reload the page.',
    )
    await businessProfile.expectNotice('Reload')
    await businessProfile.expectNotice('Close')
  })

  it('resolves Save feedback in the active language and preserves entered profile content', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario({
      businessName: 'Unveränderter Betrieb',
      ownerName: 'Renée Beispiel',
    })
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({ businessName: 'Neue Eingabe' })
    overwriteGetLocale(() => 'en')

    await businessProfile.save()

    await businessProfile.expectNotice('Profile saved.')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual({ ...profile, businessName: 'Neue Eingabe' })
    expect(hasUnsavedProfileChanges()).toBe(false)
  })

  it('exports an English-named backup without translating or changing its saved profile format', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario({
      businessName: 'Unveränderter Betrieb',
    })
    saveBusinessProfile(profile)
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => 'blob:english-profile-backup',
    )
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    )
    const filenames: Array<string> = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download)
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({ businessName: 'Nicht exportieren' })
    overwriteGetLocale(() => 'en')

    await businessProfile.exportBackup()

    await businessProfile.expectNotice('Backup created.')
    await businessProfile.expectNotice(
      'The file contains sensitive, unencrypted data.',
    )
    expect(filenames).toEqual(['regningen-business-profile.json'])
    const [blob] = createObjectURL.mock.calls[0]
    expect(JSON.parse(await blob.text())).toEqual({
      format: 'regningen-business-profile',
      version: 1,
      profile,
    })
    expect(hasUnsavedProfileChanges()).toBe(true)
  })

  it('loads a backup with English feedback while retaining the explicit profile Save boundary', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario({
      businessName: 'Übernommener Betrieb',
    })
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    overwriteGetLocale(() => 'en')

    await businessProfile.importBackup(
      new File(
        [
          JSON.stringify({
            format: 'regningen-business-profile',
            version: 1,
            profile,
          }),
        ],
        'profile.json',
        { type: 'application/json' },
      ),
    )

    await businessProfile.expectNotice(
      'Profile backup loaded. Please save the profile.',
    )
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toBeNull()
    expect(hasUnsavedProfileChanges()).toBe(true)
  })

  it('explains profile deletion in English without deleting before confirmation', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    overwriteGetLocale(() => 'en')

    await businessProfile.requestDeletion()

    await businessProfile.expectNotice('Delete Business Profile?')
    await businessProfile.expectNotice(
      'The saved profile and current form inputs will be deleted. Invoice inputs, settings and downloaded PDFs will be retained.',
    )
    await businessProfile.expectNotice('Cancel')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
  })

  it('reports English storage recovery guidance without saving or discarding working inputs', async () => {
    const businessProfile = new BusinessProfileRobot(userEvent.setup())
    const profile = createBusinessProfileScenario()
    saveBusinessProfile(profile)
    await renderAtRoute('/settings/profile', BusinessProfilePage)
    await businessProfile.expectReady()
    await businessProfile.enterProfile({
      businessName: 'Ungespeicherte Eingabe',
    })
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
    overwriteGetLocale(() => 'en')

    await businessProfile.save()

    await businessProfile.expectNotice('The profile could not be saved')
    await businessProfile.expectNotice('Check storage again')
    await businessProfile.expectNotice('Save again')
    await businessProfile.expectNotice(
      "The Business Profile could not be saved or read locally. Invoicing is blocked. Check the browser's storage settings and try saving again. Your changes remain in this form; there is no need to reload the page. For read or deletion problems, check storage again without saving changes.",
    )
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(profile)
    expect(hasUnsavedProfileChanges()).toBe(true)
  })

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
