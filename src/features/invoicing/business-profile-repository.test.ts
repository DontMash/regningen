import { describe, expect, it } from 'vitest'
import { createBusinessProfileRepository } from './business-profile-repository'

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
})
