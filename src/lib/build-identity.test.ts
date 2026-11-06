import { describe, expect, it } from 'vitest'
import { resolveBuildIdentity } from './build-identity'

describe('build identity', () => {
  it('keeps local builds usable without a fabricated source commit', () => {
    expect(resolveBuildIdentity('1.2.3', {})).toEqual({
      version: '1.2.3',
      commit: null,
    })
    expect(resolveBuildIdentity('1.2.3', { RELEASE_COMMIT: '' })).toEqual({
      version: '1.2.3',
      commit: null,
    })
  })

  it('captures the supplied manifest version and full commit in release builds', () => {
    expect(
      resolveBuildIdentity('2.3.4', {
        RELEASE_BUILD: 'true',
        RELEASE_COMMIT: '1234567890ABCDEF1234567890ABCDEF12345678',
      }),
    ).toEqual({
      version: '2.3.4',
      commit: '1234567890abcdef1234567890abcdef12345678',
    })
  })

  it('does not silently discard malformed optional commit metadata', () => {
    expect(() =>
      resolveBuildIdentity('1.2.3', { RELEASE_COMMIT: 'abc123' }),
    ).toThrow('RELEASE_COMMIT')
  })

  it('requires a full source commit for a trusted release build', () => {
    for (const commit of [undefined, '', 'abc123', 'g'.repeat(40)]) {
      expect(() =>
        resolveBuildIdentity('1.2.3', {
          RELEASE_BUILD: 'true',
          RELEASE_COMMIT: commit,
        }),
      ).toThrow('RELEASE_COMMIT')
    }
  })
})
