import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { generateNotices } from './generate'
import { validateNoticeArtifacts } from './build'

const directories: string[] = []
const mit =
  'Copyright (c) 2026 Fixture Authors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software.\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY.\n'
const notice =
  'This product includes a contribution by the Fixture Foundation.\n'
const digest = (text: string) => createHash('sha256').update(text).digest('hex')

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'regningen-notices-'))
  directories.push(directory)
  mkdirSync(join(directory, 'legal'))
  writeFileSync(join(directory, 'LICENSE'), 'Fixture project license\n')
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      version: '1.0.0',
      license: 'AGPL-3.0-only',
      dependencies: { alpha: '1.0.0' },
      devDependencies: { compiler: '1.0.0' },
    }),
  )
  const lock = {
    lockfileVersion: '9.0',
    importers: {
      '.': {
        dependencies: { alpha: { specifier: '1.0.0', version: '1.0.0' } },
        devDependencies: { compiler: { specifier: '1.0.0', version: '1.0.0' } },
      },
    },
    packages: { 'alpha@1.0.0': {}, 'child@2.0.0': {}, 'compiler@1.0.0': {} },
    snapshots: {
      'alpha@1.0.0': { dependencies: { child: '2.0.0' } },
      'child@2.0.0': {},
      'compiler@1.0.0': {},
    },
  }
  writeFileSync(join(directory, 'pnpm-lock.yaml'), stringify(lock))
  const inventory: Record<
    string,
    Array<{
      name: string
      versions: string[]
      paths: string[]
      license: string
    }>
  > = { MIT: [] }
  function pkg(
    name: string,
    version: string,
    texts: Record<string, string> = { LICENSE: mit },
    license = 'MIT',
    location = name,
  ) {
    const path = join(directory, 'node_modules', location)
    mkdirSync(path, { recursive: true })
    writeFileSync(
      join(path, 'package.json'),
      JSON.stringify({ name, version, license }),
    )
    for (const [file, text] of Object.entries(texts)) {
      mkdirSync(join(path, file, '..'), { recursive: true })
      writeFileSync(join(path, file), text)
    }
    inventory.MIT.push({ name, versions: [version], paths: [path], license })
    return path
  }
  const alpha = pkg('alpha', '1.0.0', { LICENSE: mit, NOTICE: notice })
  pkg('child', '2.0.0')
  pkg('compiler', '1.0.0')
  function policy(extra: object = {}) {
    const exceptionsPath = join(directory, 'legal/exceptions.json')
    const reviews = existsSync(exceptionsPath)
      ? (JSON.parse(readFileSync(exceptionsPath, 'utf8')) as Array<{
          id: string
          license?: string
          files?: string[]
          texts?: Array<{ text: string }>
          bundled?: Array<{
            name: string
            version: string
            license: string
            texts: Array<{ text: string }>
          }>
        }>)
      : []
    const evidenceSets = inventory.MIT.flatMap(({ paths }) =>
      paths.map((path) => {
        const manifest = JSON.parse(
          readFileSync(join(path, 'package.json'), 'utf8'),
        ) as { name: string; version: string; license: string }
        const review = reviews.find(
          (item) => item.id === `${manifest.name}@${manifest.version}`,
        )
        const files =
          review?.files ??
          readdirSync(path, { recursive: true, encoding: 'utf8' }).filter(
            (file) =>
              !file.includes('node_modules/') &&
              /(?:^|\/)(?:LICENSE|NOTICE|README\.md|EXCEPTION)$/.test(file),
          )
        return {
          name: manifest.name,
          version: manifest.version,
          license: review?.license ?? manifest.license,
          sha256: [
            ...files.map((file) =>
              digest(readFileSync(join(path, file), 'utf8')),
            ),
            ...(review?.texts ?? []).map(({ text }) => digest(text)),
          ],
        }
      }),
    )
    for (const review of reviews)
      for (const bundled of review.bundled ?? [])
        evidenceSets.push({
          name: bundled.name,
          version: bundled.version,
          license: bundled.license,
          sha256: bundled.texts.map(({ text }) => digest(text)),
        })
    const chosen = {
      evidenceSets,
      licenses: ['MIT', 'Apache-2.0'],
      approvedTexts: [digest(mit), digest(notice)],
      generated: [],
      ...extra,
    }
    writeFileSync(
      join(directory, 'legal/policy.json'),
      JSON.stringify({
        ...chosen,
        approvedTexts: chosen.approvedTexts.map((sha256) => ({
          sha256,
          licenses: chosen.licenses,
        })),
      }),
    )
  }
  policy()
  writeFileSync(join(directory, 'legal/exceptions.json'), '[]')
  writeFileSync(join(directory, 'legal/copied-source.json'), '[]')
  const run = (delivered = [alpha]) =>
    generateNotices({ directory, inventory, delivered })
  return { directory, inventory, run, pkg, policy, lock, alpha }
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('locked application notices', () => {
  it('associates complete legal texts with exact delivered versions and keeps tooling in a separate inventory', () => {
    const { run, pkg } = fixture()
    pkg('residual', '0.1.0')
    const result = run()
    expect(result.data.project).toEqual({
      name: 'fixture',
      version: '1.0.0',
      license: 'AGPL-3.0-only',
      copyright: 'Copyright (C) 2026 soren.codes',
      text: 'Fixture project license\n',
    })
    expect(result.data.entries).toEqual([
      {
        id: 'alpha@1.0.0',
        name: 'alpha',
        version: '1.0.0',
        license: 'MIT',
        kind: 'software',
        texts: [
          { file: 'LICENSE', text: mit },
          { file: 'NOTICE', text: notice },
        ],
      },
    ])
    expect(result.text).toContain('alpha@1.0.0 — MIT')
    expect(result.text).toContain(mit)
    expect(result.text).toContain(notice)
    expect(result.inventory).toContain('compiler@1.0.0')
    expect(result.inventory).toContain('child@2.0.0')
    expect(result.inventory).not.toContain('residual')
    expect(result.text).not.toContain('compiler')
    expect(result.text).not.toContain('/tmp/')
    expect(run()).toEqual(result)
  })

  it('fails instead of reusing old output when installed evidence, terms, or the lock become invalid', () => {
    const { directory, run, alpha } = fixture()
    const original = run()
    expect(original.text).toContain(mit)
    writeFileSync(
      join(alpha, 'LICENSE'),
      mit + 'Pay the author for every use.\n',
    )
    expect(() => run()).toThrow(
      /alpha@1.0.0: unreviewed or changed legal evidence LICENSE/,
    )
    rmSync(join(alpha, 'LICENSE'))
    rmSync(join(alpha, 'NOTICE'))
    expect(() => run()).toThrow(/alpha@1.0.0: missing required legal text/)
    writeFileSync(join(alpha, 'LICENSE'), mit)
    writeFileSync(
      join(alpha, 'package.json'),
      JSON.stringify({ name: 'alpha', version: '9.0.0', license: 'MIT' }),
    )
    expect(() => run()).toThrow(
      /alpha@1.0.0: installation\/lock mismatch: found alpha@9.0.0/,
    )
    rmSync(join(directory, 'node_modules/child'), { recursive: true })
    writeFileSync(
      join(alpha, 'package.json'),
      JSON.stringify({ name: 'alpha', version: '1.0.0', license: 'MIT' }),
    )
    expect(() => run()).toThrow(/child@2.0.0: missing installed package/)
  })

  it('includes a development-classified runtime contributor and separately attributes identical grants', () => {
    const { directory, run, alpha, policy } = fixture()
    const compiler = join(directory, 'node_modules/compiler')
    const compilerGrant = mit.replace('Fixture Authors', 'Compiler Authors')
    writeFileSync(join(compiler, 'LICENSE'), compilerGrant)
    policy({
      approvedTexts: [digest(mit), digest(notice), digest(compilerGrant)],
      generated: ['compiler'],
    })
    const result = run([alpha])
    expect(result.data.entries.map(({ id }) => id)).toEqual([
      'alpha@1.0.0',
      'compiler@1.0.0',
    ])
    expect(result.data.entries[1].kind).toBe('generated')
    expect(result.text).toContain('Copyright (c) 2026 Compiler Authors')
    expect(result.text).toContain('Copyright (c) 2026 Fixture Authors')
    expect(result.inventory).not.toContain('compiler@')
  })

  it('regenerates upgrades and removals without retaining obsolete notices', () => {
    const { directory, run, lock, alpha, policy } = fixture()
    const a = run([alpha, join(directory, 'node_modules/child')])
    expect(a.data.entries.map(({ id }) => id)).toEqual([
      'alpha@1.0.0',
      'child@2.0.0',
    ])
    const changed = mit.replace('Fixture Authors', 'New Authors')
    const upgradedLock = {
      ...lock,
      snapshots: {
        ...lock.snapshots,
        'alpha@1.0.0': { dependencies: { child: '3.0.0' } },
        'child@3.0.0': {},
      },
    }
    writeFileSync(join(directory, 'pnpm-lock.yaml'), stringify(upgradedLock))
    writeFileSync(
      join(directory, 'node_modules/child/package.json'),
      JSON.stringify({ name: 'child', version: '3.0.0', license: 'MIT' }),
    )
    writeFileSync(join(directory, 'node_modules/child/LICENSE'), changed)
    expect(() => run([alpha, join(directory, 'node_modules/child')])).toThrow(
      /child@3.0.0: unreviewed or changed/,
    )
    policy({ approvedTexts: [digest(mit), digest(changed), digest(notice)] })
    const b = run([alpha, join(directory, 'node_modules/child')])
    expect(b.data.entries.map(({ id }) => id)).toEqual([
      'alpha@1.0.0',
      'child@3.0.0',
    ])
    expect(b.text).not.toContain('child@2.0.0')
    expect(b.text).toContain('Copyright (c) 2026 New Authors')
    expect(b.data.entries[0]).toEqual(a.data.entries[0])
    expect(b.data.revision).not.toBe(a.data.revision)
    writeFileSync(
      join(directory, 'pnpm-lock.yaml'),
      stringify({
        ...upgradedLock,
        snapshots: { ...upgradedLock.snapshots, 'alpha@1.0.0': {} },
      }),
    )
    const removed = run([alpha])
    expect(removed.text).not.toContain('child@')
    expect(removed.inventory).not.toContain('child@')
    expect(run([alpha])).toEqual(removed)
  })

  it('retains two active transitive versions and relevant optional contributions', () => {
    const { directory, run, lock, pkg, alpha, policy } = fixture()
    const older = pkg(
      'child',
      '1.0.0',
      undefined,
      undefined,
      'compiler/node_modules/child',
    )
    const option = pkg('optional-runtime', '1.0.0')
    policy()
    writeFileSync(
      join(directory, 'pnpm-lock.yaml'),
      stringify({
        ...lock,
        packages: {
          ...lock.packages,
          'child@1.0.0': {},
          'optional-runtime@1.0.0': {
            os: [process.platform],
            cpu: [process.arch],
          },
          'foreign-native@1.0.0': { os: ['foreign-platform'] },
        },
        snapshots: {
          ...lock.snapshots,
          'compiler@1.0.0': {
            dependencies: { child: '1.0.0' },
            optionalDependencies: {
              'optional-runtime': '1.0.0',
              'foreign-native': '1.0.0',
            },
          },
          'child@1.0.0': {},
          'optional-runtime@1.0.0': {},
          'foreign-native@1.0.0': {},
        },
      }),
    )
    expect(
      run([
        alpha,
        older,
        join(directory, 'node_modules/child'),
        option,
      ]).data.entries.map(({ id }) => id),
    ).toEqual([
      'alpha@1.0.0',
      'child@1.0.0',
      'child@2.0.0',
      'optional-runtime@1.0.0',
    ])
    rmSync(option, { recursive: true })
    expect(() => run()).toThrow(
      /optional-runtime@1.0.0: missing installed package for this target/,
    )
  })

  it('retains copied-source provenance and complete exception-bearing grants, but rejects stale approvals', () => {
    const { directory, run, alpha, policy } = fixture()
    const source = 'export const copied = true\n'
    writeFileSync(join(directory, 'copied.ts'), source)
    writeFileSync(
      join(directory, 'legal/copied-source.json'),
      JSON.stringify([
        {
          id: 'copied-ui@revision-a',
          name: 'Copied UI',
          version: 'revision-a',
          license: 'MIT',
          kind: 'copied-source',
          reason: 'Imported UI source; retain original grant.',
          sources: [{ path: 'copied.ts', sha256: digest(source) }],
          texts: [{ file: 'upstream/LICENSE', text: mit }],
        },
      ]),
    )
    const exceptionText =
      'Fixture special exception: linking this library does not impose its license on the executable.\n'
    const pkgJson = JSON.stringify({
      name: 'alpha',
      version: '1.0.0',
      license: 'GPL-2.0-only WITH Classpath-exception-2.0',
    })
    writeFileSync(join(alpha, 'package.json'), pkgJson)
    writeFileSync(join(alpha, 'EXCEPTION'), exceptionText)
    writeFileSync(
      join(directory, 'legal/exceptions.json'),
      JSON.stringify([
        {
          id: 'alpha@1.0.0',
          reason: 'Preserve the explicit linking exception.',
          files: ['LICENSE', 'NOTICE', 'EXCEPTION'],
          evidence: [{ file: 'package.json', sha256: digest(pkgJson) }],
        },
      ]),
    )
    policy({
      licenses: ['MIT', 'GPL-2.0-only WITH Classpath-exception-2.0'],
      approvedTexts: [digest(mit), digest(notice), digest(exceptionText)],
    })
    const result = run()
    expect(result.text).toContain('GPL-2.0-only WITH Classpath-exception-2.0')
    expect(result.text).toContain(exceptionText)
    expect(
      result.data.entries.find(({ id }) => id === 'copied-ui@revision-a')
        ?.texts,
    ).toEqual([{ file: 'upstream/LICENSE', text: mit }])
    writeFileSync(join(directory, 'copied.ts'), source + 'changed\n')
    expect(() => run()).toThrow(
      /copied-ui@revision-a: invalidated copied-source evidence copied.ts/,
    )
    writeFileSync(join(directory, 'copied.ts'), source)
    writeFileSync(
      join(directory, 'legal/exceptions.json'),
      JSON.stringify([
        {
          id: 'removed@0.0.1',
          reason: 'Obsolete',
          evidence: [{ file: 'LICENSE', sha256: digest(mit) }],
        },
      ]),
    )
    expect(() => run()).toThrow(/removed@0.0.1: stale exception/)
  })

  it('detects unfamiliar emitted generators and associates approved virtual runtime code with its development producer', () => {
    const { run, policy, alpha, directory } = fixture()
    expect(() => run([alpha, '\0virtual:new-runtime'])).toThrow(
      /unreviewed generated runtime contribution/,
    )
    policy({
      contributions: [
        {
          match: '^\\u0000virtual:new-runtime$',
          package: 'compiler',
          reason: 'Compiler emits this delivered runtime helper.',
        },
      ],
    })
    const result = run([alpha, '\0virtual:new-runtime'])
    expect(
      result.data.entries.find(({ id }) => id === 'compiler@1.0.0')?.kind,
    ).toBe('generated')
    expect(() =>
      run([alpha, join(directory, 'node_modules/unlocked/index.js')]),
    ).toThrow(/outside the active locked installation/)
    expect(() => run([alpha, 'unlocked@1.0.0'])).toThrow(
      /outside the active locked installation/,
    )
  })

  it('makes stale development inventories detectable without requiring generated files from a previous checkout', () => {
    const { directory, run, inventory, alpha } = fixture()
    const options = {
      directory,
      inventory,
      delivered: [alpha],
      verifyInventory: true,
    }
    expect(() => generateNotices(options)).toThrow(
      /stale generated inventory; run pnpm notices:generate/,
    )
    const generated = run()
    mkdirSync(join(directory, 'docs'))
    writeFileSync(
      join(directory, 'docs/development-licenses.json'),
      generated.inventory,
    )
    expect(generateNotices(options).inventory).toBe(generated.inventory)
    writeFileSync(
      join(directory, 'docs/development-licenses.json'),
      'obsolete inventory\n',
    )
    expect(() => generateNotices(options)).toThrow(/stale generated inventory/)
  })

  it('does not reuse approval for a familiar label when the declared grant no longer matches reviewed evidence', () => {
    const { directory, run, alpha } = fixture()
    writeFileSync(
      join(directory, 'legal/policy.json'),
      JSON.stringify({
        evidenceSets: [
          {
            name: 'alpha',
            version: '1.0.0',
            license: 'MIT',
            sha256: [digest(mit), digest(notice)],
          },
        ],
        licenses: ['MIT', 'BSD-2-Clause'],
        approvedTexts: [
          { sha256: digest(mit), licenses: ['MIT'] },
          { sha256: digest(notice), licenses: ['MIT'] },
        ],
        generated: [],
      }),
    )
    expect(() => run()).not.toThrow()
    writeFileSync(
      join(alpha, 'package.json'),
      JSON.stringify({
        name: 'alpha',
        version: '1.0.0',
        license: 'BSD-2-Clause',
      }),
    )
    expect(() => run()).toThrow(
      /alpha@1.0.0: unreviewed or changed legal evidence LICENSE/,
    )
  })

  it('fails for untracked source in a known imported-source directory', () => {
    const { directory, run, policy } = fixture()
    mkdirSync(join(directory, 'imported-ui'))
    writeFileSync(
      join(directory, 'imported-ui/new.ts'),
      'export const imported = true\n',
    )
    policy({ copiedDirectories: ['imported-ui'] })
    expect(() => run()).toThrow(
      /imported-ui\/new.ts: unresolved copied-source provenance/,
    )
  })

  it('discovers delivered CSS and a development CSS plugin even when the bundler inlines their contribution', () => {
    const { directory, run, alpha } = fixture()
    const stylesheet = join(directory, 'styles.css')
    writeFileSync(
      stylesheet,
      '@import "alpha/theme.css";\n@plugin "compiler";\n',
    )
    const result = run([stylesheet])
    expect(result.data.entries.map(({ id }) => id)).toEqual([
      'alpha@1.0.0',
      'compiler@1.0.0',
    ])
    expect(result.data.entries[1].kind).toBe('generated')
    writeFileSync(stylesheet, '@import "alpha/theme.css";\n')
    expect(run([stylesheet]).data.entries.map(({ id }) => id)).toEqual([
      'alpha@1.0.0',
    ])
    expect(run([alpha]).inventory).toContain('compiler@1.0.0')
  })

  it('requires exact provenance for a delivered component vendored inside a package and attributes it independently', () => {
    const { directory, run, alpha, policy } = fixture()
    const relative = 'dist/node_modules/vendored/runtime.js'
    const source = 'export const runtime = 1\n'
    mkdirSync(join(alpha, relative, '..'), { recursive: true })
    writeFileSync(join(alpha, relative), source)
    const modules = [alpha, join(alpha, relative)]
    expect(() => run(modules)).toThrow(
      /alpha@1.0.0: unresolved bundled component/,
    )
    writeFileSync(
      join(directory, 'legal/exceptions.json'),
      JSON.stringify([
        {
          id: 'alpha@1.0.0',
          reason:
            'Exact upstream release runtime bytes match this vendored component.',
          evidence: [{ file: relative, sha256: digest(source) }],
          bundled: [
            {
              directory: 'dist/node_modules/vendored',
              id: 'vendored@2.0.0',
              name: 'vendored',
              version: '2.0.0',
              license: 'MIT',
              texts: [{ file: 'upstream/LICENSE', text: mit }],
            },
          ],
        },
      ]),
    )
    policy()
    expect(run(modules).data.entries.map(({ id }) => id)).toEqual([
      'alpha@1.0.0',
      'vendored@2.0.0',
    ])
    writeFileSync(join(alpha, relative), source + 'changed\n')
    expect(() => run(modules)).toThrow(/alpha@1.0.0: invalidated exception/)
  })

  it('resolves emitted asset provenance relative to the isolated build root', () => {
    const { directory, run } = fixture()
    const result = run([`../${basename(directory)}/node_modules/alpha/LICENSE`])
    expect(result.data.entries.map(({ id }) => id)).toEqual(['alpha@1.0.0'])
  })

  it('rejects an incomplete previously reviewed notice set even when the remaining attribution is approved', () => {
    const { directory, run, alpha } = fixture()
    const policyPath = join(directory, 'legal/policy.json')
    const reviewed = JSON.parse(readFileSync(policyPath, 'utf8'))
    writeFileSync(
      policyPath,
      JSON.stringify({
        ...reviewed,
        evidenceSets: [
          {
            name: 'alpha',
            version: '1.0.0',
            license: 'MIT',
            sha256: [digest(mit), digest(notice)],
          },
        ],
      }),
    )
    expect(run().text).toContain(mit)
    rmSync(join(alpha, 'LICENSE'))
    expect(() => run()).toThrow(
      /alpha@1.0.0: incomplete or changed reviewed evidence set/,
    )
    writeFileSync(join(alpha, 'LICENSE'), mit)
    rmSync(join(alpha, 'NOTICE'))
    expect(() => run()).toThrow(
      /alpha@1.0.0: incomplete or changed reviewed evidence set/,
    )
  })

  it('preserves distinct copyright notices from two installed peer contexts of the same identity', () => {
    const { directory, run, lock, pkg, policy, alpha } = fixture()
    const peerCopyright = mit.replace('Fixture Authors', 'Peer Context Authors')
    const peer = pkg(
      'alpha',
      '1.0.0',
      { LICENSE: peerCopyright, NOTICE: notice },
      'MIT',
      'compiler/node_modules/alpha',
    )
    writeFileSync(
      join(directory, 'pnpm-lock.yaml'),
      stringify({
        ...lock,
        snapshots: {
          ...lock.snapshots,
          'compiler@1.0.0': { dependencies: { alpha: '1.0.0' } },
        },
      }),
    )
    policy({
      approvedTexts: [digest(mit), digest(notice), digest(peerCopyright)],
    })
    const result = run([alpha, peer])
    expect(result.data.entries.map(({ id }) => id)).toEqual(['alpha@1.0.0'])
    expect(
      result.data.entries[0].texts
        .filter(({ file }) => file === 'LICENSE')
        .map(({ text }) => text),
    ).toEqual([mit, peerCopyright])
    expect(result.text).toContain('Copyright (c) 2026 Fixture Authors')
    expect(result.text).toContain('Copyright (c) 2026 Peer Context Authors')
  })

  it('prepares development from the last validated target without including tooling-only versions', () => {
    const { directory, inventory, run, pkg, lock, alpha } = fixture()
    const older = pkg(
      'child',
      '1.0.0',
      undefined,
      undefined,
      'compiler/node_modules/child',
    )
    writeFileSync(
      join(directory, 'pnpm-lock.yaml'),
      stringify({
        ...lock,
        packages: { ...lock.packages, 'child@1.0.0': {} },
        snapshots: {
          ...lock.snapshots,
          'compiler@1.0.0': { dependencies: { child: '1.0.0' } },
          'child@1.0.0': {},
        },
      }),
    )
    writeFileSync(
      join(directory, 'legal/runtime-scope.json'),
      JSON.stringify([
        { name: 'alpha', version: '1.0.0', kind: 'software' },
        { name: 'child', version: '1.0.0', kind: 'software' },
      ]),
    )
    const prepared = generateNotices({ directory, inventory })
    expect(prepared.data.entries.map(({ id }) => id)).toEqual([
      'alpha@1.0.0',
      'child@1.0.0',
    ])
    expect(prepared.inventory).toContain('child@2.0.0')
    expect(prepared).toEqual(run([alpha, older]))
    writeFileSync(
      join(directory, 'legal/runtime-scope.json'),
      JSON.stringify([{ name: 'alpha', version: '0.9.0', kind: 'generated' }]),
    )
    const upgraded = generateNotices({ directory, inventory })
    expect(upgraded.data.entries.map(({ id, kind }) => ({ id, kind }))).toEqual(
      [{ id: 'alpha@1.0.0', kind: 'generated' }],
    )
  })

  it('rejects invalid project grants and a missing installation rather than preparing incomplete notices', () => {
    const { directory, run, policy } = fixture()
    policy({ projectLicenseSha256: digest('Unmodified standard license') })
    expect(() => run()).toThrow(
      /project LICENSE differs from the complete standard AGPLv3 text/,
    )
    policy()
    const manifest = JSON.parse(
      readFileSync(join(directory, 'package.json'), 'utf8'),
    )
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ ...manifest, license: 'MIT' }),
    )
    expect(() => run()).toThrow(/project metadata must select AGPL-3.0-only/)
    expect(() => generateNotices({ directory, delivered: [] })).toThrow(
      /missing installation state/,
    )
  })

  it('validates and associates final target files with their notices, including generated workers and packaged server software', () => {
    const { directory, run, policy, alpha, inventory } = fixture()
    policy({
      generated: ['compiler'],
      contributions: [
        {
          match: '^generated:',
          package: 'compiler',
          reason: 'Fixture runtime producer.',
        },
      ],
    })
    const expected = run()
    const validate = (modules = [alpha]) =>
      validateNoticeArtifacts(directory, modules, expected, inventory)
    const publicDirectory = join(directory, '.output/public')
    const serverDirectory = join(directory, '.output/server')
    mkdirSync(publicDirectory, { recursive: true })
    mkdirSync(join(serverDirectory, 'node_modules/alpha'), { recursive: true })
    writeFileSync(
      join(serverDirectory, 'node_modules/alpha/package.json'),
      JSON.stringify({ name: 'alpha', version: '1.0.0' }),
    )
    writeFileSync(
      join(serverDirectory, 'index.mjs'),
      'export const application = true\n',
    )
    writeFileSync(
      join(serverDirectory, '_runtime.mjs'),
      '// rolldown/runtime.js\n',
    )
    writeFileSync(
      join(publicDirectory, 'workbox-fixture.js.map'),
      JSON.stringify({ sources: ['node_modules/alpha/LICENSE'] }),
    )
    writeFileSync(
      join(publicDirectory, 'third-party-notices.txt'),
      expected.text,
    )
    const worker =
      '// third-party-notices.txt /de/einstellungen/lizenzen /en/settings/licenses\n'
    writeFileSync(join(publicDirectory, 'sw.js'), worker)
    validate()
    expect(
      readFileSync(join(directory, '.output/THIRD-PARTY-NOTICES.txt'), 'utf8'),
    ).toBe(expected.text)
    expect(readFileSync(join(directory, '.output/LICENSE'), 'utf8')).toBe(
      'Fixture project license\n',
    )
    const report = JSON.parse(
      readFileSync(join(directory, '.output/licensing-artifacts.json'), 'utf8'),
    )
    expect(report.identities).toEqual(['alpha@1.0.0', 'compiler@1.0.0'])
    expect(report.artifacts).toContainEqual({
      path: 'server/index.mjs',
      sha256: digest('export const application = true\n'),
    })
    expect(
      JSON.parse(
        readFileSync(join(directory, 'legal/runtime-scope.json'), 'utf8'),
      ),
    ).toEqual([
      { name: 'alpha', version: '1.0.0', kind: 'software' },
      { name: 'compiler', version: '1.0.0', kind: 'generated' },
    ])
    writeFileSync(
      join(publicDirectory, 'third-party-notices.txt'),
      'Obsolete legal text',
    )
    expect(() => validate()).toThrow(/missing or stale plain-text notices/)
    writeFileSync(
      join(publicDirectory, 'third-party-notices.txt'),
      expected.text,
    )
    writeFileSync(join(publicDirectory, 'sw.js'), '// third-party-notices.txt')
    expect(() => validate()).toThrow(
      /does not prepare \/de\/einstellungen\/lizenzen/,
    )
    writeFileSync(join(publicDirectory, 'sw.js'), worker)
    expect(() =>
      validate([alpha, join(directory, 'node_modules/child')]),
    ).toThrow(/final release scope differs from discovery/)
    writeFileSync(join(serverDirectory, '_runtime.mjs'), '// unfamiliar helper')
    expect(() => validate()).toThrow(/unfamiliar final server runtime helper/)
    rmSync(join(serverDirectory, '_runtime.mjs'))
    rmSync(join(serverDirectory, 'node_modules'), { recursive: true })
    validate()
    const revalidated = JSON.parse(
      readFileSync(join(directory, '.output/licensing-artifacts.json'), 'utf8'),
    )
    expect(
      revalidated.artifacts.map((artifact: { path: string }) => artifact.path),
    ).not.toContain('licensing-artifacts.json')
    rmSync(join(publicDirectory, 'workbox-fixture.js.map'))
    expect(() => validate()).toThrow(
      /generated worker source provenance is missing/,
    )
  })

  it('requires a reviewed alternative and preserves cumulative grants, README evidence and bundled attribution', () => {
    const { directory, run, policy, alpha } = fixture()
    const readme = '# Alpha\n\n## License\n' + mit
    writeFileSync(
      join(alpha, 'package.json'),
      JSON.stringify({
        name: 'alpha',
        version: '1.0.0',
        license: 'MIT OR MPL-2.0',
      }),
    )
    rmSync(join(alpha, 'LICENSE'))
    writeFileSync(join(alpha, 'README.md'), readme)
    expect(() => run()).toThrow(
      /alpha@1.0.0: unfamiliar license expression MIT OR MPL-2.0/,
    )
    const zlib =
      'Copyright 2025 Fixture Compression Authors\nThis software is provided as-is. Altered versions must be plainly marked.\n'
    mkdirSync(join(alpha, 'vendor'))
    writeFileSync(join(alpha, 'vendor/LICENSE'), zlib)
    writeFileSync(
      join(directory, 'legal/exceptions.json'),
      JSON.stringify([
        {
          id: 'alpha@1.0.0',
          license: 'MIT AND Zlib',
          reason:
            'Choose MIT instead of MPL; bundled compression grant is cumulative.',
          files: ['README.md', 'NOTICE', 'vendor/LICENSE'],
          evidence: [
            {
              file: 'package.json',
              sha256: digest(
                JSON.stringify({
                  name: 'alpha',
                  version: '1.0.0',
                  license: 'MIT OR MPL-2.0',
                }),
              ),
            },
            { file: 'README.md', sha256: digest(readme) },
            { file: 'vendor/LICENSE', sha256: digest(zlib) },
          ],
        },
      ]),
    )
    policy({
      licenses: ['MIT', 'MIT AND Zlib'],
      approvedTexts: [
        digest(readme),
        digest(notice),
        digest(zlib),
        digest(mit),
      ],
    })
    const result = run()
    expect(result.data.entries[0].license).toBe('MIT AND Zlib')
    expect(result.text).toContain(readme)
    expect(result.text).toContain(zlib)
    expect(result.text).toContain(notice)
    writeFileSync(join(alpha, 'README.md'), readme + 'Changed terms!')
    expect(() => run()).toThrow(/alpha@1.0.0: invalidated exception.*README.md/)
  })
})
