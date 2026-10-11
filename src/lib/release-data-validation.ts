import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createReleaseCatalog } from './release-catalog.ts'

export function validateReleaseData(directory: string) {
  const manifest = JSON.parse(
    readFileSync(resolve(directory, 'package.json'), 'utf8'),
  ) as { version?: unknown }
  if (typeof manifest.version !== 'string') {
    throw new Error('package.json must contain a valid SemVer version.')
  }

  const changelog = readFileSync(resolve(directory, 'CHANGELOG.md'), 'utf8')
  return createReleaseCatalog(changelog, manifest.version)
}
