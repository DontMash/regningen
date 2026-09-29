// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessProfilePage from './BusinessProfilePage'
import {
  BUSINESS_PROFILE_STORAGE_KEY,
  createBusinessProfileRepository,
} from './business-profile-repository'
import { businessProfileStorageStatus } from './business-profile-storage-status'
import {
  disposeTestRouters,
  renderAtRoute,
} from '../../../tests/helpers/render'

import {
  completeBusinessProfile,
  saveBusinessProfile,
} from '../../../tests/helpers/business-profile'

async function fillRequiredFields(
  user: ReturnType<typeof userEvent.setup>,
  includeVatId = true,
) {
  await user.type(
    screen.getByRole('textbox', { name: 'Unternehmensname' }),
    'Nordlicht Catering',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Leistungsbeschreibung' }),
    'Party-Service',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Inhaber/in' }),
    'Erika Beispiel',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Straße und Hausnummer' }),
    'Hauptstraße 12',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Postleitzahl' }),
    '20095',
  )
  await user.type(screen.getByRole('textbox', { name: 'Ort' }), 'Hamburg')
  await user.type(
    screen.getByRole('textbox', { name: 'Telefon' }),
    '040 123456',
  )
  await user.type(
    screen.getByRole('textbox', { name: 'IBAN' }),
    'DE89370400440532013000',
  )
  if (includeVatId) {
    await user.type(
      screen.getByRole('textbox', { name: 'USt-IdNr.' }),
      'DE123456789',
    )
  }
}

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
  it('starts blank, persists edits locally, and opens invoicing after a valid save', async () => {
    const user = userEvent.setup()
    await renderAtRoute('/business-profile', BusinessProfilePage)

    expect(
      await screen.findByRole('heading', { name: 'Unternehmensprofil' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Profil speichern' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Sicherung exportieren' }),
    ).toBeDisabled()

    await fillRequiredFields(user)
    const saveButton = screen.getByRole('button', { name: 'Profil speichern' })
    await waitFor(() => expect(saveButton).toBeEnabled())

    const persisted = await createBusinessProfileRepository(
      window.localStorage,
    ).loadProfile()
    expect(persisted).toEqual(completeBusinessProfile)
    await user.click(saveButton)

    expect(
      await screen.findByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).toBeVisible()
    expect(await screen.findByText('Profil gespeichert.')).toBeVisible()
  })

  it('shows touched validation errors and accepts a tax number instead of a VAT ID', async () => {
    const user = userEvent.setup()
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })

    const vatId = screen.getByRole('textbox', { name: 'USt-IdNr.' })
    await user.type(vatId, 'DE123')
    await user.tab()
    expect(
      await screen.findByText(/beginnt mit DE und hat neun Ziffern/),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Profil speichern' }),
    ).toBeDisabled()

    await user.clear(vatId)
    const taxNumber = screen.getByRole('textbox', { name: 'Steuernummer' })
    await user.type(taxNumber, '12/345/67890')
    await fillRequiredFields(user, false)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Profil speichern' }),
      ).toBeEnabled(),
    )
  })

  it('exports a backup and leaves the current profile unchanged when import is cancelled', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    const createObjectURL = vi.fn(() => 'blob:profile-backup')
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    )
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })

    await user.click(
      screen.getByRole('button', { name: 'Sicherung exportieren' }),
    )
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(
      document.querySelector('a[download="regningen-unternehmensprofil.json"]'),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Sicherung erstellt.')).toBeVisible()
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))

    const fileInput = screen.getByLabelText('Sicherung importieren')
    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(
            [
              JSON.stringify({
                format: 'regningen-business-profile',
                version: 1,
                profile: {
                  ...completeBusinessProfile,
                  businessName: 'Neue Firma',
                },
              }),
            ],
            'backup.json',
            { type: 'application/json' },
          ),
        ],
      },
    })
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Unternehmensprofil ersetzen?',
      }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(
      screen.getByRole('textbox', { name: 'Unternehmensname' }),
    ).toHaveValue('Nordlicht Catering')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(completeBusinessProfile)
  })

  it('restores an unconfirmed partial backup when no profile exists', async () => {
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })
    const partial = {
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
    }
    fireEvent.change(screen.getByLabelText('Sicherung importieren'), {
      target: {
        files: [
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
        ],
      },
    })

    expect(
      await screen.findByText('Profilsicherung wiederhergestellt.'),
    ).toBeVisible()
    expect(
      screen.getByRole('textbox', { name: 'Unternehmensname' }),
    ).toHaveValue('Teilprofil Betrieb')
    expect(
      screen.getByRole('button', { name: 'Profil speichern' }),
    ).toBeDisabled()
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(partial)
  })

  it('rejects malformed backups without changing saved profile data', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })

    fireEvent.change(screen.getByLabelText('Sicherung importieren'), {
      target: {
        files: [
          new File(['not-json'], 'invalid.json', { type: 'application/json' }),
        ],
      },
    })
    await user.click(
      await screen.findByRole('button', { name: 'Profil ersetzen' }),
    )

    expect(
      await screen.findByText(
        'Die Profilsicherung konnte nicht importiert werden.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('textbox', { name: 'Unternehmensname' }),
    ).toHaveValue('Nordlicht Catering')
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(completeBusinessProfile)
  })

  it('cancels profile deletion or confirms it and clears the form', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })

    await user.click(screen.getByRole('button', { name: 'Profil löschen' }))
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }))
    expect(
      await createBusinessProfileRepository(window.localStorage).loadProfile(),
    ).toEqual(completeBusinessProfile)

    await user.click(screen.getByRole('button', { name: 'Profil löschen' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unternehmensprofil löschen?',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Profil löschen' }),
    )
    await waitFor(async () =>
      expect(
        await createBusinessProfileRepository(
          window.localStorage,
        ).loadProfile(),
      ).toBeNull(),
    )
    expect(
      screen.getByRole('textbox', { name: 'Unternehmensname' }),
    ).toHaveValue('')
    expect(await screen.findByText('Profil gelöscht.')).toBeVisible()
  })

  it('reports export and deletion failures without claiming data was handled', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })

    const originalGetItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === BUSINESS_PROFILE_STORAGE_KEY)
        throw new Error('storage unavailable')
      return originalGetItem.call(this, key)
    })
    await user.click(
      screen.getByRole('button', { name: 'Sicherung exportieren' }),
    )
    expect(
      await screen.findByText(
        'Die Profilsicherung konnte nicht erstellt werden.',
      ),
    ).toBeVisible()
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
    await user.click(screen.getByRole('button', { name: 'Profil löschen' }))
    await user.click(
      await screen.findByRole('button', { name: 'Profil löschen' }),
    )

    expect(
      await screen.findByText(
        'Das Profil konnte nicht aus diesem Browser gelöscht werden.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('alertdialog', {
        name: 'Profil konnte nicht gespeichert werden',
      }),
    ).toBeVisible()
    expect(
      await createBusinessProfileRepository({
        getItem: originalGetItem.bind(window.localStorage),
        setItem: window.localStorage.setItem.bind(window.localStorage),
        removeItem: () => {},
      }).loadProfile(),
    ).toEqual(completeBusinessProfile)
  })

  it('ignores unrelated storage events and locks editing after a profile change in another tab', async () => {
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
    expect(
      screen.queryByText('Profil in einem anderen Tab geändert'),
    ).not.toBeInTheDocument()
    window.dispatchEvent(
      new StorageEvent('storage', { key: BUSINESS_PROFILE_STORAGE_KEY }),
    )
    expect(
      await screen.findByText('Profil in einem anderen Tab geändert'),
    ).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Schließen' }))
    expect(
      screen.getByRole('textbox', { name: 'Unternehmensname' }),
    ).toBeDisabled()
  })

  it('reports local storage read and write failures instead of claiming success', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/business-profile', BusinessProfilePage)
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Unternehmensprofil nicht verfügbar',
      }),
    ).toBeVisible()

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
    const user = userEvent.setup()
    await renderAtRoute('/business-profile', BusinessProfilePage)
    await screen.findByRole('heading', { name: 'Unternehmensprofil' })
    await user.type(
      screen.getByRole('textbox', { name: 'Unternehmensname' }),
      'Betrieb',
    )

    expect(
      await screen.findByRole('alertdialog', {
        name: 'Profil konnte nicht gespeichert werden',
      }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(
      screen.getByRole('textbox', { name: 'Unternehmensname' }),
    ).toBeDisabled()
    expect(screen.queryByText('Profil gespeichert.')).not.toBeInTheDocument()
  })
})
