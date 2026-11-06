import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  authorizeRelease,
  observeRelease,
  ordinaryValidationStages,
  prepareRelease,
  publishRelease,
  validationStages,
} from './release.ts'
import type { PublicationPorts } from './release.ts'

test('routine validation excludes browser tests while the release gate requires them', () => {
  expect(ordinaryValidationStages).toEqual([
    'format',
    'lint',
    'typecheck',
    'build',
    'test:coverage',
  ])
  expect(validationStages).toEqual([...ordinaryValidationStages, 'test:e2e'])
})

const identity = { version: '1.2.3', commit: 'a'.repeat(40) }
const digest = `sha256:${'b'.repeat(64)}`
function publisher(fail?: string, existing = false) {
  const effects: Array<string> = []
  const record = (effect: string) => {
    effects.push(effect)
    if (effect === fail) throw new Error(effect)
  }
  const ports: PublicationPorts = {
    validate: async (stage) => {
      record(stage)
    },
    versionedImage: async () => {
      record('versioned')
      return existing ? { ...identity, digest } : null
    },
    buildImage: async () => {
      record('assemble')
      return { ...identity, digest }
    },
    assertPublic: async () => {
      record('public')
    },
    ensureTag: async () => {
      record('tag')
    },
    ensureRelease: async () => {
      record('release')
    },
    promote: async () => {
      record('latest')
    },
    observe: async () => {
      record('health')
    },
  }
  return { ports, effects }
}
test('publication validates first and promotes the retained digest only after public image, tag and notes', async () => {
  const { ports, effects } = publisher()
  await publishRelease(identity, ports)
  expect(effects).toEqual([
    'format',
    'lint',
    'typecheck',
    'build',
    'test:coverage',
    'test:e2e',
    'versioned',
    'assemble',
    'public',
    'tag',
    'release',
    'latest',
    'health',
  ])
})
test.each([...validationStages, 'assemble', 'public', 'tag', 'release'])(
  'failure at %s cannot promote latest',
  async (stage) => {
    const { ports, effects } = publisher(stage)
    await expect(publishRelease(identity, ports)).rejects.toThrow(stage)
    expect(effects).not.toContain('latest')
    if (validationStages.includes(stage))
      expect(effects).not.toContain('versioned')
  },
)
test('partial release reruns reuse identity; conflicting artifacts fail rather than overwrite', async () => {
  const { ports, effects } = publisher(undefined, true)
  await publishRelease(identity, ports)
  expect(effects).not.toContain('assemble')
})
test('a versioned artifact for another commit is never promoted', async () => {
  const { ports, effects } = publisher(undefined, true)
  ports.versionedImage = async () => ({
    ...identity,
    commit: 'c'.repeat(40),
    digest,
  })
  await expect(publishRelease(identity, ports)).rejects.toThrow(/conflict/)
  expect(effects).not.toContain('latest')
})
test('failed health observation stays failed without deleting artifacts or rewinding latest', async () => {
  const { ports, effects } = publisher('health')
  await expect(publishRelease(identity, ports)).rejects.toThrow('health')
  expect(effects.slice(-4)).toEqual(['tag', 'release', 'latest', 'health'])
})
test('health accepts only exact identity, tolerates old/malformed/transport responses and stops at a finite bound', async () => {
  const replies = [
    new Response(JSON.stringify({ ...identity, commit: 'c'.repeat(40) })),
    new Response('invalid'),
    new Error('TLS failure'),
    Response.json(identity),
  ]
  let calls = 0
  await observeRelease('https://example.invalid', identity, {
    attempts: 4,
    pause: async () => {},
    request: async () => {
      const value = replies[calls++]
      if (value instanceof Error) throw value
      return value
    },
  })
  expect(calls).toBe(4)
  await expect(
    observeRelease('https://example.invalid', identity, {
      attempts: 2,
      pause: async () => {},
      request: async () => Response.json({ version: 'old' }),
    }),
  ).rejects.toThrow(/2 attempts.*identity/)
  await expect(
    observeRelease('http://example.invalid', identity),
  ).rejects.toThrow(/HTTPS/)
})

const directories: Array<string> = []
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
)
function repository() {
  const cwd = mkdtempSync(join(tmpdir(), 'release-policy-'))
  directories.push(cwd)
  const git = (...args: Array<string>) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Test Maintainer')
  git('config', 'user.email', 'maintainer@example.invalid')
  git('remote', 'add', 'origin', 'https://github.com/example/project.git')
  writeFileSync(
    join(cwd, 'package.json'),
    '{"name":"example","version":"1.0.0"}\n',
  )
  writeFileSync(
    join(cwd, 'CHANGELOG.md'),
    '# Changelog\n\n## v1.0.0\n\nInitial release.\n',
  )
  git('add', '.')
  git('commit', '-m', 'feat: initial release')
  git('tag', 'v1.0.0')
  writeFileSync(join(cwd, 'feature.txt'), 'feature')
  git('add', '.')
  git('commit', '-m', 'fix: correct output')
  return { cwd, git }
}

test('maintainer prepares native release metadata without reserving a tag', () => {
  const { cwd, git } = repository()
  const base = git('rev-parse', 'HEAD')
  const result = prepareRelease({
    cwd,
    base,
    mode: 'auto',
    changelogen: resolve('node_modules/changelogen/dist/cli.mjs'),
  })
  expect(result.version).toBe('1.0.1')
  expect(result.base).toBe(base)
  expect(result.head).not.toBe(base)
  expect(git('tag')).toBe('v1.0.0')
  expect(git('status', '--porcelain')).toBe('')
  expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toContain(
    'Correct output',
  )
})

test('refresh starts at unbumped main and native inference incorporates new features', () => {
  const { cwd, git } = repository()
  const base = git('rev-parse', 'HEAD')
  const first = prepareRelease({ cwd, base, mode: 'auto' })
  git('reset', '--hard', base)
  writeFileSync(join(cwd, 'feature.txt'), 'new feature')
  git('add', '.')
  git('commit', '-m', 'feat: export documents')
  const next = prepareRelease({
    cwd,
    base: git('rev-parse', 'HEAD'),
    mode: 'auto',
  })
  expect(first.version).toBe('1.0.1')
  expect(next.version).toBe('1.1.0')
  expect(git('tag')).toBe('v1.0.0')
})

test.each([
  ['major', undefined, '2.0.0'],
  ['minor', undefined, '1.1.0'],
  ['patch', undefined, '1.0.1'],
  ['version', '2.4.0', '2.4.0'],
])('native %s override is available', (mode, version, expected) => {
  const { cwd, git } = repository()
  expect(
    prepareRelease({ cwd, base: git('rev-parse', 'HEAD'), mode, version })
      .version,
  ).toBe(expected)
})

test('only provenance-bound generated metadata can authorize the exact squash-merged commit', () => {
  const { cwd, git } = repository()
  const base = git('rev-parse', 'HEAD')
  const prepared = prepareRelease({ cwd, base, mode: 'auto' })
  const pr = {
    author: 'release-app[bot]',
    repository: 'example/project',
    headRepository: 'example/project',
    branch: 'automation/release',
    baseBranch: 'main',
    head: prepared.head,
    merged: true,
  }
  git('reset', '--soft', base)
  git('commit', '-m', 'chore: merge approved release')
  const merged = git('rev-parse', 'HEAD')
  expect(merged).not.toBe(prepared.head)
  expect(
    authorizeRelease({
      cwd,
      pr,
      prepared,
      appLogin: 'release-app[bot]',
      repository: 'example/project',
      merged,
    }),
  ).toEqual({ version: '1.0.1', commit: merged })
  expect(() =>
    authorizeRelease({
      cwd,
      pr: { ...pr, author: 'human' },
      prepared,
      appLogin: 'release-app[bot]',
      repository: 'example/project',
      merged,
    }),
  ).toThrow(/provenance/)
  expect(() =>
    authorizeRelease({
      cwd,
      pr,
      prepared: { ...prepared, base: prepared.head },
      appLogin: 'release-app[bot]',
      repository: 'example/project',
      merged,
    }),
  ).toThrow()
  writeFileSync(join(cwd, 'feature.txt'), 'unauthorized source')
  git('add', '.')
  git('commit', '-m', 'fix: later main')
  expect(() =>
    authorizeRelease({
      cwd,
      pr,
      prepared,
      appLogin: 'release-app[bot]',
      repository: 'example/project',
      merged: git('rev-parse', 'HEAD'),
    }),
  ).toThrow()
})
