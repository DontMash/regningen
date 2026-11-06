import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'

export type Preparation = {
  base: string
  head: string
  version: string
  mode: string
}
export type ReleaseIdentity = { version: string; commit: string }
export type ImageIdentity = ReleaseIdentity & { digest: string }
export const ordinaryValidationStages = [
  'format',
  'lint',
  'typecheck',
  'build',
  'test:coverage',
]
export const validationStages = [...ordinaryValidationStages, 'test:e2e']
export type PublicationPorts = {
  validate: (stage: string) => Promise<void>
  versionedImage: () => Promise<ImageIdentity | null>
  buildImage: () => Promise<ImageIdentity>
  assertPublic: (image: ImageIdentity) => Promise<void>
  ensureTag: () => Promise<void>
  ensureRelease: (image: ImageIdentity) => Promise<void>
  promote: (image: ImageIdentity) => Promise<void>
  observe: () => Promise<void>
}
export async function publishRelease(
  expected: ReleaseIdentity,
  ports: PublicationPorts,
): Promise<void> {
  for (const stage of validationStages) await ports.validate(stage)
  const image = (await ports.versionedImage()) ?? (await ports.buildImage())
  if (
    image.commit !== expected.commit ||
    image.version !== expected.version ||
    !/^sha256:[a-f0-9]{64}$/.test(image.digest)
  )
    throw new Error('Versioned image identity conflict')
  await ports.assertPublic(image)
  await ports.ensureTag()
  await ports.ensureRelease(image)
  await ports.promote(image)
  await ports.observe()
}
export async function observeRelease(
  origin: string,
  expected: ReleaseIdentity,
  {
    attempts = 60,
    request = fetch,
    pause = () => new Promise<void>((done) => setTimeout(done, 10_000)),
  }: {
    attempts?: number
    request?: typeof fetch
    pause?: () => Promise<void>
  } = {},
): Promise<void> {
  const target = new URL(origin)
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('Production origin must be a bare HTTPS origin')
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60)
    throw new Error('Health attempts must be between 1 and 60')
  let detail = 'No response'
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(new URL('/healthz', target), {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body: unknown = await response.json()
      if (
        body &&
        typeof body === 'object' &&
        'version' in body &&
        'commit' in body &&
        body.version === expected.version &&
        body.commit === expected.commit
      )
        return
      detail = 'Response identity does not match expected version and commit'
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error)
    }
    if (attempt + 1 < attempts) await pause()
  }
  throw new Error(
    `Health observation failed after ${attempts} attempts: ${detail}`,
  )
}
export type ReleasePullRequest = {
  author: string
  repository: string
  headRepository: string
  branch: string
  baseBranch: string
  head: string
  merged: boolean
}
export function authorizeRelease({
  cwd,
  pr,
  prepared,
  appLogin,
  repository,
  merged,
  currentMain,
}: {
  cwd: string
  pr: ReleasePullRequest
  prepared: Preparation
  appLogin: string
  repository: string
  merged?: string
  currentMain?: string
}): ReleaseIdentity {
  if (
    !appLogin.endsWith('[bot]') ||
    pr.author !== appLogin ||
    pr.repository !== repository ||
    pr.headRepository !== repository ||
    pr.branch !== 'automation/release' ||
    pr.baseBranch !== 'main' ||
    pr.head !== prepared.head ||
    !sha.test(prepared.base) ||
    !sha.test(prepared.head) ||
    !stableVersion.test(prepared.version)
  )
    throw new Error('Release provenance does not match the preparation')
  if (git(cwd, 'rev-parse', `${prepared.head}^`) !== prepared.base)
    throw new Error('Preparation must contain exactly one generated commit')
  const changes = git(cwd, 'diff', '--name-only', prepared.base, prepared.head)
    .split('\n')
    .sort()
  if (changes.join(',') !== 'CHANGELOG.md,package.json')
    throw new Error('Release PR may only change generated release metadata')
  const packageManifest = z.record(z.string(), z.unknown())
  const before = packageManifest.parse(
    JSON.parse(git(cwd, 'show', `${prepared.base}:package.json`)),
  )
  const after = packageManifest.parse(
    JSON.parse(git(cwd, 'show', `${prepared.head}:package.json`)),
  )
  const afterVersion = z.string().parse(after.version)
  const beforeVersion = z.string().parse(before.version)
  if (
    afterVersion !== prepared.version ||
    JSON.stringify({ ...after, version: beforeVersion }) !==
      JSON.stringify({ ...before, version: beforeVersion })
  )
    throw new Error('Unexpected package metadata changes')
  const oldNotes = git(cwd, 'show', `${prepared.base}:CHANGELOG.md`)
  const newNotes = git(cwd, 'show', `${prepared.head}:CHANGELOG.md`)
  const oldEntries = oldNotes.slice(oldNotes.search(/^###?\s/m))
  if (
    !newNotes.endsWith(oldEntries) ||
    !newNotes.includes(`v${prepared.version}`)
  )
    throw new Error('Release notes must preserve established history')
  if (!merged) {
    if (pr.merged || currentMain !== prepared.base)
      throw new Error(
        'Release candidate is stale; manually regenerate from main',
      )
    return { version: prepared.version, commit: prepared.head }
  }
  if (
    !pr.merged ||
    !sha.test(merged) ||
    git(cwd, 'rev-parse', `${merged}^1`) !== prepared.base
  )
    throw new Error('Merged release is stale; regeneration was required')
  if (git(cwd, 'diff', '--name-only', prepared.head, merged))
    throw new Error('Merged source differs from the approved preparation')
  return { version: prepared.version, commit: merged }
}

export function git(cwd: string, ...args: Array<string>): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}
const sha = /^[a-f0-9]{40}$/
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export function prepareRelease({
  cwd,
  base,
  mode,
  version,
  changelogen = resolve('node_modules/changelogen/dist/cli.mjs'),
}: {
  cwd: string
  base: string
  mode: string
  version?: string
  changelogen?: string
}): Preparation {
  if (!sha.test(base) || git(cwd, 'rev-parse', 'HEAD') !== base)
    throw new Error('Preparation requires current main')
  const overrides =
    mode === 'auto'
      ? []
      : ['major', 'minor', 'patch'].includes(mode)
        ? [`--${mode}`]
        : mode === 'version' && version && stableVersion.test(version)
          ? ['-r', version]
          : null
  if (!overrides) throw new Error('Invalid release version override')
  execFileSync(
    process.execPath,
    [
      changelogen,
      '--release',
      '--clean',
      '--no-tag',
      '--no-github',
      ...overrides,
    ],
    { cwd, stdio: 'pipe' },
  )
  const manifest: { version: string } = JSON.parse(
    readFileSync(join(cwd, 'package.json'), 'utf8'),
  )
  if (!stableVersion.test(manifest.version))
    throw new Error('Only stable SemVer releases are supported')
  return {
    base,
    head: git(cwd, 'rev-parse', 'HEAD'),
    version: manifest.version,
    mode,
  }
}
