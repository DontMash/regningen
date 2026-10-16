import { describe, expect, it } from 'vitest'
import { readEnvironment } from './env'

describe('deployment configuration', () => {
  it('allows unconfigured deployments with private, untrusted and HSTS-off defaults', () => {
    expect(readEnvironment({})).toEqual({
      ORIGIN: undefined,
      TRUST_PROXY: false,
      HSTS_STAGE: 'off',
    })
  })

  it('treats empty inputs as omitted without changing the supplied environment', () => {
    const values = { ORIGIN: '', TRUST_PROXY: '', HSTS_STAGE: '' }
    expect(readEnvironment(values)).toEqual({
      ORIGIN: undefined,
      TRUST_PROXY: false,
      HSTS_STAGE: 'off',
    })
    expect(values).toEqual({ ORIGIN: '', TRUST_PROXY: '', HSTS_STAGE: '' })
  })

  it.each(['http://localhost:3000', 'https://example.com'])(
    'accepts a bare origin: %s',
    (ORIGIN) => {
      expect(readEnvironment({ ORIGIN }).ORIGIN).toBe(ORIGIN)
    },
  )

  it.each(['off', 'one-day', 'one-week', 'one-year', 'reset'])(
    'accepts the explicit HSTS stage %s',
    (HSTS_STAGE) => {
      expect(readEnvironment({ HSTS_STAGE }).HSTS_STAGE).toBe(HSTS_STAGE)
    },
  )

  it.each([
    ['TRUST_PROXY', 'TRUE'],
    ['TRUST_PROXY', '1'],
    ['TRUST_PROXY', 'false '],
    ['TRUST_PROXY', 'invalid'],
    ['HSTS_STAGE', 'OFF'],
    ['HSTS_STAGE', 'toString'],
    ['HSTS_STAGE', 'invalid'],
  ])('rejects an invalid %s setting: %s', (name, value) => {
    expect(() => readEnvironment({ [name]: value })).toThrow(
      new RegExp(`${name}:`),
    )
  })

  it('accepts explicit safe defaults and ignores unrelated framework or scaffold inputs', () => {
    expect(
      readEnvironment({
        TRUST_PROXY: 'false',
        HSTS_STAGE: 'off',
        NITRO_PORT: '4173',
        SERVER_URL: 'unused',
        PUBLIC_APP_TITLE: '',
      }),
    ).toEqual({
      ORIGIN: undefined,
      TRUST_PROXY: false,
      HSTS_STAGE: 'off',
    })
  })

  it('reports the bad setting without disclosing its value or unrelated secrets', () => {
    expect(() =>
      readEnvironment({
        ORIGIN: 'https://user:secret@example.com',
        API_KEY: 'private-key',
      }),
    ).toThrow('ORIGIN: Expected a bare HTTP(S) origin')
    try {
      readEnvironment({
        ORIGIN: 'https://user:secret@example.com',
        API_KEY: 'private-key',
      })
    } catch (error) {
      expect(String(error)).not.toMatch(/secret|private-key/)
    }
  })

  it('normalizes an accepted canonical origin without changing proxy or HSTS policy', () => {
    expect(
      readEnvironment({
        ORIGIN: 'https://EXAMPLE.com:443/',
        TRUST_PROXY: 'true',
        HSTS_STAGE: 'one-week',
      }),
    ).toEqual({
      ORIGIN: 'https://example.com',
      TRUST_PROXY: true,
      HSTS_STAGE: 'one-week',
    })
  })

  it.each([
    'example.com',
    'not a URL',
    'ftp://example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com/extra/..',
    'https://example.com/?query',
    'https://example.com/?',
    'https://example.com/#fragment',
    'https://example.com/#',
    'https://[invalid',
    ' https://example.com',
    ' ',
  ])('rejects an invalid canonical origin: %s', (ORIGIN) => {
    expect(() => readEnvironment({ ORIGIN })).toThrow(
      /ORIGIN:.*HTTP\(S\) origin/,
    )
  })
})
