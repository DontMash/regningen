// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createProfileOperations } from './profile-domain'
import { businessValidation } from './validation-composition'
import { createBusinessProfileRepository } from './business-profile-repository'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'

beforeEach(() => localStorage.clear())

describe('Business Profile operations', () => {
  it('rejects invalid saves without overwriting the saved profile', async () => {
    const repository = createBusinessProfileRepository(localStorage)
    const operations = createProfileOperations(businessValidation, repository)
    const profile = createBusinessProfileScenario()
    expect((await operations.save(profile)).valid).toBe(true)
    expect((await operations.save({ ...profile, ownerName: '' })).valid).toBe(
      false,
    )
    expect(await operations.load()).toEqual(profile)
  })

  it('normalizes valid saving and distinguishes missing, incomplete and unavailable readiness', async () => {
    const repository = createBusinessProfileRepository(localStorage)
    const operations = createProfileOperations(businessValidation, repository)
    const profile = createBusinessProfileScenario()
    expect(operations.readiness(null)).toEqual({
      ready: false,
      reason: 'missing',
    })
    expect(operations.readiness({ ...profile, iban: '' })).toEqual({
      ready: false,
      reason: 'incomplete',
    })
    expect(operations.readiness(profile, true)).toEqual({
      ready: false,
      reason: 'unavailable',
    })
    await operations.save({
      ...profile,
      businessName: '  Nordlicht Catering  ',
      iban: 'de89 3704 0044 0532 0130 00',
    })
    expect(await operations.load()).toEqual(profile)
    expect(operations.readiness(await operations.load())).toEqual({
      ready: true,
      profile,
    })
  })
})
