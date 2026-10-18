import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { generateNotices } from './generate.ts'

/** Applied to both Vite environments and Nitro's final bundler. Retain the whole
 * traversed graph, not just tree-shaken chunk modules, and asset provenance. */
export function noticeEvidence(target?: string) {
  return {
    name: 'application-notice-evidence',
    apply: 'build' as const,
    generateBundle(
      this: {
        getModuleIds: () => IterableIterator<string>
        environment?: { name: string }
      },
      _options: unknown,
      bundle: Record<string, { type: string; originalFileNames?: string[] }>,
    ) {
      const modules = [...this.getModuleIds()]
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset')
          modules.push(...(asset.originalFileNames ?? []))
      }
      mkdirSync('.notices/modules', { recursive: true })
      const environment = target ?? this.environment?.name ?? 'application'
      writeFileSync(
        `.notices/modules/${environment}.json`,
        JSON.stringify(modules.sort()),
      )
    },
  }
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.isFile()
        ? [join(directory, entry.name)]
        : [],
  )
}

export function packagedModules(directory: string) {
  const server = join(directory, '.output/server/node_modules')
  const packaged = existsSync(server)
    ? files(server)
        .filter((file) => file.endsWith('/package.json'))
        .flatMap((file) => {
          const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
            name?: string
            version?: string
          }
          return pkg.name && pkg.version ? [`${pkg.name}@${pkg.version}`] : []
        })
    : []
  const publicDirectory = join(directory, '.output/public')
  const maps = readdirSync(publicDirectory).filter((name) =>
    /^workbox-.*\.js\.map$/.test(name),
  )
  if (!maps.length)
    throw new Error('Licensing: generated worker source provenance is missing.')
  for (const map of maps) {
    const source = JSON.parse(
      readFileSync(join(publicDirectory, map), 'utf8'),
    ) as { sources: string[] }
    packaged.push(...source.sources, 'generated:workbox-worker')
  }
  const helper = join(directory, '.output/server/_runtime.mjs')
  if (existsSync(helper)) {
    if (!readFileSync(helper, 'utf8').includes('rolldown/runtime'))
      throw new Error(
        'Licensing: unfamiliar final server runtime helper; review its provenance.',
      )
    packaged.push('generated:nitro-runtime-helper')
  }
  return packaged
}

/** This runs only after the second, real release build and worker finalization. */
export function validateNoticeArtifacts(
  directory: string,
  modules: string[],
  expected: ReturnType<typeof generateNotices>,
  inventory?: Parameters<typeof generateNotices>[0]['inventory'],
) {
  const actual = generateNotices({
    directory,
    inventory,
    delivered: [...modules, ...packagedModules(directory)],
  })
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      'Licensing: final release scope differs from discovery; no release may be shipped. Review emitted module/asset provenance and rebuild.',
    )
  const textPath = join(directory, '.output/public/third-party-notices.txt')
  if (!existsSync(textPath) || readFileSync(textPath, 'utf8') !== actual.text)
    throw new Error(
      'Licensing: final release has missing or stale plain-text notices.',
    )
  const worker = readFileSync(join(directory, '.output/public/sw.js'), 'utf8')
  for (const path of [
    'third-party-notices.txt',
    '/de/einstellungen/lizenzen',
    '/en/settings/licenses',
  ]) {
    if (!worker.includes(path))
      throw new Error(`Licensing: final worker does not prepare ${path}.`)
  }
  copyFileSync(join(directory, 'LICENSE'), join(directory, '.output/LICENSE'))
  writeFileSync(join(directory, '.output/THIRD-PARTY-NOTICES.txt'), actual.text)
  const artifacts = files(join(directory, '.output'))
    .filter(
      (file) => file !== join(directory, '.output/licensing-artifacts.json'),
    )
    .sort()
    .map((file) => ({
      path: relative(join(directory, '.output'), file),
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    }))
  writeFileSync(
    join(directory, '.output/licensing-artifacts.json'),
    JSON.stringify(
      {
        revision: actual.data.revision,
        identities: actual.data.entries.map(({ id }) => id),
        artifacts,
      },
      null,
      2,
    ) + '\n',
  )
  writeFileSync(
    join(directory, 'legal/runtime-scope.json'),
    JSON.stringify(
      actual.data.entries
        .filter(({ kind }) => kind !== 'copied-source')
        .map(({ name, version, kind }) => ({ name, version, kind })),
      null,
      2,
    ) + '\n',
  )
}
