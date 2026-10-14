import { describe, expect, it } from 'vitest'
import {
  createBrowserBusinessProfileRepository,
  createBusinessProfileRepository,
  parseBusinessProfileBackup,
} from './business-profile-repository'

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
