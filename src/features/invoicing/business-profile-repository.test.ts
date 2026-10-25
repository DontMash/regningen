import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import {
  createBrowserBusinessProfileRepository,
  createBusinessProfileRepository,
  parseBusinessProfileBackup,
} from './business-profile-repository'

const originalGetLocale = getLocale
afterEach(() => overwriteGetLocale(originalGetLocale))

function createStorage() {
  const values = new Map<string, string>()

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

const partialProfile = {
  businessName: 'Beispielbetrieb',
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

describe('local business profile repository', () => {
  it('classifies expected browser denial but preserves programming defects unchanged', async () => {
    const cause = new DOMException('denied', 'SecurityError')
    const repository = createBusinessProfileRepository({
      ...createStorage(),
      getItem: () => {
        throw cause
      },
    })
    await expect(repository.loadProfile()).rejects.toMatchObject({
      reason: 'storage',
      cause,
    })
    const defect = new TypeError('broken adapter')
    const broken = createBusinessProfileRepository({
      ...createStorage(),
      getItem: () => {
        throw defect
      },
    })
    await expect(broken.loadProfile()).rejects.toBe(defect)
  })

  it('explains malformed backups in the active language without changing saved values', async () => {
    const repository = createBusinessProfileRepository(createStorage())
    await repository.saveProfile(partialProfile)
    overwriteGetLocale(() => 'en')

    expect(() => parseBusinessProfileBackup('{')).toThrow(
      'The profile backup does not contain valid JSON.',
    )
    expect(() => parseBusinessProfileBackup('{')).toThrow(
      expect.objectContaining({ cause: expect.any(SyntaxError) }),
    )
    expect(() => parseBusinessProfileBackup('{}')).toThrow(
      'The profile backup has an invalid format.',
    )
    expect(await repository.loadProfile()).toEqual(partialProfile)
    expect(JSON.parse(await repository.exportProfile())).toEqual({
      format: 'regningen-business-profile',
      version: 1,
      profile: partialProfile,
    })

    overwriteGetLocale(() => 'de')
    expect(() => parseBusinessProfileBackup('{')).toThrow(
      'Die Profilsicherung enthält kein gültiges JSON.',
    )
  })

  it('explains reset and unavailable-profile failures in English', async () => {
    overwriteGetLocale(() => 'en')
    let generation = 'before-reset'
    const storage = createStorage()
    const repository = createBusinessProfileRepository(
      storage,
      () => generation,
    )
    await repository.saveProfile(partialProfile)
    generation = 'after-reset'

    await expect(
      repository.saveProfile(partialProfile, 'before-reset'),
    ).rejects.toThrow(
      'The application was reset. Reload the page before saving the profile.',
    )
    await expect(repository.deleteProfile('before-reset')).rejects.toThrow(
      'The application was reset. Reload the page before deleting the profile.',
    )
    await expect(repository.exportProfile()).rejects.toThrow(
      'There is no Business Profile to export yet.',
    )
    expect(() => createBrowserBusinessProfileRepository()).toThrow(
      'Business Profiles are available only in the browser.',
    )

    const resetDuringSave = createBusinessProfileRepository(
      {
        ...storage,
        setItem: (key, value) => {
          storage.setItem(key, value)
          generation = 'reset-during-save'
        },
      },
      () => generation,
    )
    await expect(resetDuringSave.saveProfile(partialProfile)).rejects.toThrow(
      'The application was reset while saving.',
    )
  })

  it('cannot read, export, or resave a Business Profile from before an application reset', async () => {
    let generation = 'before-reset'
    const repository = createBusinessProfileRepository(
      createStorage(),
      () => generation,
    )
    await repository.saveProfile(partialProfile, generation)
    generation = 'after-reset'
    expect(await repository.loadProfile()).toBeNull()
    await expect(repository.exportProfile()).rejects.toThrow(
      'noch kein Unternehmensprofil',
    )
    await expect(
      repository.saveProfile(partialProfile, 'before-reset'),
    ).rejects.toThrow('zurückgesetzt')
    await repository.saveProfile(
      { ...partialProfile, businessName: 'Fresh business' },
      generation,
    )
    await expect(repository.deleteProfile('before-reset')).rejects.toThrow(
      'zurückgesetzt',
    )
    expect(await repository.loadProfile()).toEqual({
      ...partialProfile,
      businessName: 'Fresh business',
    })
    expect(JSON.parse(await repository.exportProfile())).toEqual({
      format: 'regningen-business-profile',
      version: 1,
      profile: { ...partialProfile, businessName: 'Fresh business' },
    })
  })

  it('persists and reloads an incomplete profile without sending it elsewhere', async () => {
    const repository = createBusinessProfileRepository(createStorage())

    await repository.saveProfile(partialProfile)

    expect(await repository.loadProfile()).toEqual(partialProfile)
  })

  it('parses an exported partial profile without persistence until an explicit save', async () => {
    const source = createBusinessProfileRepository(createStorage())
    const destination = createBusinessProfileRepository(createStorage())
    await source.saveProfile(partialProfile)

    const backup = await source.exportProfile()
    const parsed = parseBusinessProfileBackup(backup)
    expect(parsed).toEqual(partialProfile)
    expect(await destination.loadProfile()).toBeNull()

    await destination.saveProfile(parsed)
    expect(await destination.loadProfile()).toEqual(partialProfile)
  })

  it('does not replace the current profile when an import is malformed', async () => {
    const repository = createBusinessProfileRepository(createStorage())
    await repository.saveProfile(partialProfile)

    expect(() => parseBusinessProfileBackup('{"format":"wrong"}')).toThrow(
      'ungültiges Format',
    )

    expect(await repository.loadProfile()).toEqual(partialProfile)
  })

  it('is available only in a browser environment', () => {
    expect(() => createBrowserBusinessProfileRepository()).toThrow(
      'nur im Browser verfügbar',
    )
  })

  it('reports browser storage write failures', async () => {
    const repository = createBusinessProfileRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {},
    })

    await expect(repository.saveProfile(partialProfile)).rejects.toThrow(
      'quota exceeded',
    )
  })

  it('deletes only the locally stored profile', async () => {
    const storage = createStorage()
    const repository = createBusinessProfileRepository(storage)
    storage.setItem('regningen.invoice-draft', 'unsubmitted invoice inputs')
    storage.setItem('theme', 'dark')
    await repository.saveProfile(partialProfile)

    await repository.deleteProfile()

    expect(await repository.loadProfile()).toBeNull()
    expect(storage.getItem('regningen.invoice-draft')).toBe(
      'unsubmitted invoice inputs',
    )
    expect(storage.getItem('theme')).toBe('dark')
  })

  it('rejects malformed JSON, unsupported versions, and unexpected backup fields', () => {
    expect(() => parseBusinessProfileBackup('{')).toThrow('kein gültiges JSON')
    expect(() =>
      parseBusinessProfileBackup(
        JSON.stringify({
          format: 'regningen-business-profile',
          version: 2,
          profile: partialProfile,
        }),
      ),
    ).toThrow('ungültiges Format')
    expect(() =>
      parseBusinessProfileBackup(
        JSON.stringify({
          format: 'regningen-business-profile',
          version: 1,
          profile: partialProfile,
          extra: true,
        }),
      ),
    ).toThrow('ungültiges Format')
  })

  it('reports missing, invalid, and unreadable stored profiles', async () => {
    const storage = createStorage()
    const repository = createBusinessProfileRepository(storage)
    await expect(repository.exportProfile()).rejects.toThrow(
      'noch kein Unternehmensprofil',
    )

    storage.setItem('regningen.business-profile', 'not-json')
    await expect(repository.loadProfile()).rejects.toThrow('kein gültiges JSON')
    await expect(repository.exportProfile()).rejects.toThrow(
      'kein gültiges JSON',
    )

    const unreadable = createBusinessProfileRepository({
      getItem: () => {
        throw new Error('read failed')
      },
      setItem: () => {},
      removeItem: () => {},
    })
    await expect(unreadable.loadProfile()).rejects.toThrow('read failed')
  })

  it('rejects malformed profiles before writing and reports delete failures', async () => {
    let writes = 0
    const repository = createBusinessProfileRepository({
      getItem: () => null,
      setItem: () => {
        writes++
      },
      removeItem: () => {
        throw new Error('delete failed')
      },
    })

    await expect(
      repository.saveProfile({ businessName: 'incomplete' } as never),
    ).rejects.toThrow()
    expect(writes).toBe(0)
    await expect(repository.deleteProfile()).rejects.toThrow('delete failed')
  })
})
