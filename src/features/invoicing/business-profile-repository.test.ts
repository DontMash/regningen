import { describe, expect, it } from 'vitest'
import {
  createBrowserBusinessProfileRepository,
  createBusinessProfileRepository,
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
  it('persists and reloads an incomplete profile without sending it elsewhere', async () => {
    const repository = createBusinessProfileRepository(createStorage())

    await repository.saveProfile(partialProfile)

    expect(await repository.loadProfile()).toEqual(partialProfile)
  })

  it('exports and imports a partial profile', async () => {
    const source = createBusinessProfileRepository(createStorage())
    const destination = createBusinessProfileRepository(createStorage())
    await source.saveProfile(partialProfile)

    const backup = await source.exportProfile()
    await destination.importProfile(backup)

    expect(await destination.loadProfile()).toEqual(partialProfile)
  })

  it('does not replace the current profile when an import is malformed', async () => {
    const repository = createBusinessProfileRepository(createStorage())
    await repository.saveProfile(partialProfile)

    await expect(
      repository.importProfile('{"format":"wrong"}'),
    ).rejects.toThrow('ungültiges Format')

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
    await repository.saveProfile(partialProfile)

    await repository.deleteProfile()

    expect(await repository.loadProfile()).toBeNull()
  })

  it('rejects malformed JSON, unsupported versions, and unexpected backup fields', async () => {
    const repository = createBusinessProfileRepository(createStorage())

    await expect(repository.importProfile('{')).rejects.toThrow(
      'kein gültiges JSON',
    )
    await expect(
      repository.importProfile(
        JSON.stringify({
          format: 'regningen-business-profile',
          version: 2,
          profile: partialProfile,
        }),
      ),
    ).rejects.toThrow('ungültiges Format')
    await expect(
      repository.importProfile(
        JSON.stringify({
          format: 'regningen-business-profile',
          version: 1,
          profile: partialProfile,
          extra: true,
        }),
      ),
    ).rejects.toThrow('ungültiges Format')
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
