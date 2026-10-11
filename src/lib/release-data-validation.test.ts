import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateReleaseData } from './release-data-validation'

const fixtures: string[] = []

function createFixture(version: string, changelog: string) {
  const directory = mkdtempSync(join(tmpdir(), 'regningen-release-data-'))
  fixtures.push(directory)
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }))
  writeFileSync(join(directory, 'CHANGELOG.md'), changelog)
  return directory
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('release data build validation', () => {
  it('consumes a valid catalog built from the manifest and changelog files', () => {
    const directory = createFixture(
      '2.0.0',
      '# Changelog\n\n## Unreleased\n\n- Not shipped.\n\n## v2.0.0\n\n- Current release.\n\n## v1.8.0\n\n- Prior release.\n',
    )

    expect(
      validateReleaseData(directory).map(({ version }) => version),
    ).toEqual(['2.0.0', '1.8.0'])
  })

  it('rejects absent current-version notes and inconsistent latest entries', () => {
    const missing = createFixture(
      '2.0.0',
      '# Changelog\n\n## v1.8.0\n\n- Prior release.\n',
    )
    expect(() => validateReleaseData(missing)).toThrow(
      'CHANGELOG.md is missing release notes for v2.0.0.',
    )

    const inconsistent = createFixture(
      '1.8.0',
      '# Changelog\n\n## v2.0.0\n\n- Newer notes.\n\n## v1.8.0\n\n- Current manifest.\n',
    )
    expect(() => validateReleaseData(inconsistent)).toThrow(
      'The current package version v1.8.0 does not match the latest changelog entry v2.0.0.',
    )
  })
})
