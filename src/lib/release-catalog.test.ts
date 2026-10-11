import { describe, expect, it } from 'vitest'
import { createReleaseCatalog } from './release-catalog'

const changelog = `# Changelog

## Unreleased

- Work that has not shipped.

## v1.9.0

### 🚀 Enhancements

- Keep this wording unchanged.

## v1.10.0

### 🩹 Fixes

- Render links as authored.

## v1.2.0

### 🏡 Chore

- Earlier release.
`

describe('release catalog', () => {
  it('lists released changelog sections newest first and excludes unreleased notes', () => {
    const releases = createReleaseCatalog(changelog, '1.10.0')

    expect(releases.map(({ version }) => version)).toEqual([
      '1.10.0',
      '1.9.0',
      '1.2.0',
    ])
    expect(releases[0]?.markdown).toContain('### 🩹 Fixes')
    expect(releases[0]?.markdown).toContain('- Render links as authored.')
    expect(releases.map(({ markdown }) => markdown).join('\n')).not.toContain(
      'Work that has not shipped',
    )
  })

  it('rejects missing current-version notes and a changelog led by another version', () => {
    expect(() =>
      createReleaseCatalog('# Changelog\n\n## v1.2.0\n\n- Old\n', '1.3.0'),
    ).toThrow('CHANGELOG.md is missing release notes for v1.3.0.')
    expect(() => createReleaseCatalog(changelog, '1.2.0')).toThrow(
      'The current package version v1.2.0 does not match the latest changelog entry v1.10.0.',
    )
  })

  it('rejects invalid package versions and duplicate release entries', () => {
    expect(() => createReleaseCatalog(changelog, '1.10')).toThrow(
      'package.json must contain a valid SemVer version.',
    )
    expect(() =>
      createReleaseCatalog(
        `${changelog}\n## v1.10.0\n\n- Duplicate\n`,
        '1.10.0',
      ),
    ).toThrow('CHANGELOG.md contains duplicate release entries for v1.10.0.')
  })
})
