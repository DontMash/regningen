import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parse } from 'yaml'
import type { NoticeEntry } from './data.ts'

type LicenseInventory = Record<
  string,
  Array<{ name: string; versions: string[]; paths: string[]; license: string }>
>
type Manifest = {
  name: string
  version: string
  license: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}
type LockedRoot = { specifier: string; version: string }
type Edges = {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}
type Lock = {
  importers: Record<
    string,
    {
      dependencies?: Record<string, LockedRoot>
      devDependencies?: Record<string, LockedRoot>
      optionalDependencies?: Record<string, LockedRoot>
    }
  >
  snapshots: Record<string, Edges | undefined>
  packages: Record<
    string,
    { os?: string[]; cpu?: string[]; libc?: string[] } | undefined
  >
}
type Policy = {
  projectLicenseSha256?: string
  licenses: string[]
  approvedTexts: Array<{ sha256: string; licenses: string[] }>
  evidenceSets: Array<{
    name: string
    version: string
    license: string
    sha256: string[]
  }>
  generated: string[]
  contributions?: Array<{ match: string; package: string; reason: string }>
  copiedDirectories?: string[]
}
type Text = { file: string; text: string }
type Bundled = Omit<NoticeEntry, 'kind'> & {
  directory: string
  kind?: NoticeEntry['kind']
}
type Exception = {
  id: string
  license?: string
  reason: string
  files?: string[]
  evidence: Array<{ file: string; sha256: string }>
  texts?: Text[]
  bundled?: Bundled[]
  decisions?: string[]
  runtimeFiles?: string[]
}
type Copied = Entry & {
  reason: string
  sources: Array<{ path: string; sha256: string }>
}
type Entry = NoticeEntry
type Installed = { id: string; path: string; manifest: Manifest }

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function sha(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function fail(identity: string, problem: string): never {
  throw new Error(
    `Licensing: ${identity}: ${problem}. See docs/licensing.md for evidence review and regeneration.`,
  )
}

function packageDirectory(name: string, parent: string) {
  const lookup =
    createRequire(join(parent, 'package.json')).resolve.paths(`${name}/`) ?? []
  const file = lookup
    .map((path) => join(path, name, 'package.json'))
    .find(existsSync)
  return file ? realpathSync(dirname(file)) : undefined
}

function packageManagerInventory(directory: string): LicenseInventory {
  const installationPath = join(directory, 'node_modules/.modules.yaml')
  if (!existsSync(installationPath))
    fail(
      'pnpm installation',
      'missing installation state; run pnpm install --frozen-lockfile',
    )
  const installation = parse(readFileSync(installationPath, 'utf8')) as {
    storeDir?: string
  }
  if (!installation.storeDir)
    fail(
      'pnpm installation',
      'missing installed package-store location; reinstall locked dependencies',
    )
  // pnpm chooses its default store by filesystem. A build on /tmp may share an
  // installation on /home, so use that installation's actual store, not cwd's.
  const store = /[\\/]v\d+$/.test(installation.storeDir)
    ? dirname(installation.storeDir)
    : installation.storeDir
  try {
    return JSON.parse(
      execFileSync(
        'pnpm',
        ['licenses', 'list', '--json', `--config.store-dir=${store}`],
        { cwd: directory, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      ),
    ) as LicenseInventory
  } catch (error) {
    const output =
      error && typeof error === 'object' && 'stdout' in error
        ? String(error.stdout)
        : String(error)
    fail(
      'pnpm license inventory',
      `scan failed: ${output.trim()}; reinstall locked dependencies rather than reusing stale notices`,
    )
  }
}

function installedGraph(directory: string, inventory: LicenseInventory) {
  const manifest = json<Manifest>(join(directory, 'package.json'))
  const lock = parse(
    readFileSync(join(directory, 'pnpm-lock.yaml'), 'utf8'),
  ) as Lock
  const root = lock.importers['.']
  const installed = new Map<string, Installed>()
  const visited = new Set<string>()
  const inventoried = new Set(
    Object.values(inventory).flatMap((group) =>
      group.flatMap((item) =>
        item.paths.filter(existsSync).map((path) => realpathSync(path)),
      ),
    ),
  )
  const rootEdges: Record<string, string> = {}
  const libc = (
    process.report.getReport() as { header: { glibcVersionRuntime?: string } }
  ).header.glibcVersionRuntime
    ? 'glibc'
    : 'musl'
  for (const group of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ] as const) {
    for (const [name, declaration] of Object.entries(manifest[group] ?? {})) {
      const locked = root[group]?.[name]
      if (!locked || locked.specifier !== declaration)
        fail(
          name,
          'package.json and pnpm-lock.yaml disagree; run pnpm install --frozen-lockfile',
        )
      rootEdges[name] = locked.version
    }
    for (const name of Object.keys(root[group] ?? {})) {
      if (!manifest[group]?.[name])
        fail(name, 'stale lockfile importer; reinstall locked dependencies')
    }
  }
  function visit(
    name: string,
    version: string,
    parent: string,
    optional = false,
  ) {
    const alias = /^(@[^/()]+\/[^@()]+|[^@()]+)@(.+)$/.exec(version)
    const packageName = alias?.[1] ?? name
    const lockedVersion = alias?.[2] ?? version
    const snapshot = `${packageName}@${lockedVersion}`
    const bare = `${packageName}@${lockedVersion.split('(')[0]}`
    const target = lock.packages[bare]
    const matches = (values: string[] | undefined, value: string) =>
      !values ||
      ((!values.some((item) => !item.startsWith('!')) ||
        values.includes(value)) &&
        !values.includes(`!${value}`))
    if (
      optional &&
      target &&
      (!matches(target.os, process.platform) ||
        !matches(target.cpu, process.arch) ||
        !matches(target.libc, libc))
    )
      return
    const path = packageDirectory(name, parent)
    if (!path)
      fail(
        bare,
        'missing installed package for this target; run pnpm install --frozen-lockfile',
      )
    const pkg = json<Manifest>(join(path, 'package.json'))
    if (pkg.name !== packageName || pkg.version !== lockedVersion.split('(')[0])
      fail(bare, `installation/lock mismatch: found ${pkg.name}@${pkg.version}`)
    if (!inventoried.has(path))
      fail(
        bare,
        'installed package absent from package-manager license inventory',
      )
    const edges = lock.snapshots[snapshot]
    if (!edges) fail(bare, 'missing lock snapshot')
    const visitKey = `${path}\0${snapshot}`
    if (visited.has(visitKey)) return
    visited.add(visitKey)
    installed.set(path, { id: bare, path, manifest: pkg })
    for (const [child, childVersion] of Object.entries(
      edges.dependencies ?? {},
    ))
      visit(child, childVersion, path)
    for (const [child, childVersion] of Object.entries(
      edges.optionalDependencies ?? {},
    ))
      visit(child, childVersion, path, true)
  }
  for (const [name, version] of Object.entries(rootEdges))
    visit(name, version, directory, !!root.optionalDependencies?.[name])
  return { manifest, installed: [...installed.values()] }
}

function localText(directory: string, file: string): Text {
  const path = resolve(directory, file)
  if (!path.startsWith(`${resolve(directory)}/`) || !existsSync(path))
    fail(file, 'missing or unsafe local evidence path')
  const bytes = readFileSync(path)
  return {
    file,
    text: (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'),
  }
}

function legalFiles(directory: string, recursive = false, prefix = ''): Text[] {
  return readdirSync(join(directory, prefix), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap((entry): Text[] => {
      const file = prefix ? `${prefix}/${entry.name}` : entry.name
      if (
        recursive &&
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        !entry.name.startsWith('.')
      )
        return legalFiles(directory, true, file)
      if (
        entry.isFile() &&
        /(?:^|[.-]|thirdparty)(?:licen[cs]es?|copying|copyright(?:notice)?|notice(?:text)?s?|authors)(?:[.-].*)?$/i.test(
          entry.name,
        )
      )
        return [localText(directory, file)]
      return []
    })
}

/** One producer for release notices, their local text rendering and the tooling inventory.
 * `delivered` contains absolute module paths from the target bundlers, never manifest classifications.
 * Fixture callers may supply the package-manager inventory; ordinary callers use pnpm's inventory.
 */
export function generateNotices({
  directory,
  delivered,
  inventory,
  verifyInventory = false,
}: {
  directory: string
  delivered?: string[]
  inventory?: LicenseInventory
  verifyInventory?: boolean
}) {
  directory = resolve(directory)
  inventory ??= packageManagerInventory(directory)
  const { manifest, installed } = installedGraph(directory, inventory)
  const policy = json<Policy>(join(directory, 'legal/policy.json'))
  if (
    !Object.hasOwn(policy, 'evidenceSets') ||
    !Array.isArray(policy.evidenceSets)
  )
    fail(
      'legal/policy.json',
      'missing complete reviewed evidence sets; review and restore the licensing policy',
    )
  if (manifest.license !== 'AGPL-3.0-only')
    fail(manifest.name, 'project metadata must select AGPL-3.0-only')
  if (
    policy.projectLicenseSha256 &&
    sha(readFileSync(join(directory, 'LICENSE'), 'utf8')) !==
      policy.projectLicenseSha256
  )
    fail(
      manifest.name,
      'project LICENSE differs from the complete standard AGPLv3 text',
    )
  const exceptions = json<Exception[]>(join(directory, 'legal/exceptions.json'))
  for (const exception of exceptions) {
    const packages = installed.filter((pkg) => pkg.id === exception.id)
    if (!packages.length)
      fail(
        exception.id,
        'stale exception; remove or re-review the obsolete record',
      )
    if (!exception.reason.trim() || !exception.evidence.length)
      fail(exception.id, 'exception requires reason and precise evidence')
    for (const pkg of packages)
      for (const evidence of exception.evidence) {
        if (sha(localText(pkg.path, evidence.file).text) !== evidence.sha256)
          fail(
            pkg.id,
            `invalidated exception: changed ${evidence.file}; re-review the new evidence`,
          )
      }
  }
  const selected = new Set<string>()
  const generated = new Set<string>()
  const selectedBundled = new Map<string, NoticeEntry>()
  function selectBundled(component: Bundled) {
    const { id, name, version, license, kind, texts } = component
    selectedBundled.set(id, {
      id,
      name,
      version,
      license,
      kind: kind ?? 'software',
      texts,
    })
    if (installed.some((pkg) => pkg.id === id)) selected.add(id)
  }
  const developmentScope = delivered
    ? undefined
    : json<Array<{ name: string; version: string; kind: NoticeEntry['kind'] }>>(
        join(directory, 'legal/runtime-scope.json'),
      )
  if (developmentScope) {
    const candidates = developmentScope.flatMap((item) => {
      const versions = installed.filter(
        (pkg) => pkg.manifest.name === item.name,
      )
      const exact = versions.filter(
        (pkg) => pkg.manifest.version === item.version,
      )
      return exact.length ? exact : versions
    })
    delivered = candidates.map((pkg) => pkg.path)
    for (const pkg of candidates)
      if (
        developmentScope.some(
          (item) =>
            item.name === pkg.manifest.name && item.kind === 'generated',
        )
      )
        generated.add(pkg.id)
  }
  for (const id of delivered ?? []) {
    const identity = installed.find((pkg) => pkg.id === id)
    if (identity) {
      selected.add(identity.id)
      continue
    }
    const contributions =
      policy.contributions?.filter((rule) => new RegExp(rule.match).test(id)) ??
      []
    for (const contribution of contributions) {
      const producers = installed.filter(
        (pkg) => pkg.manifest.name === contribution.package,
      )
      if (!producers.length)
        fail(contribution.package, 'unresolved generated runtime producer')
      for (const pkg of producers) {
        selected.add(pkg.id)
        generated.add(pkg.id)
      }
    }
    if (
      !contributions.length &&
      (id.startsWith('\0') ||
        id.startsWith('virtual:') ||
        id.startsWith('generated:')) &&
      !id.includes('/node_modules/')
    )
      fail(
        id.replace(/\0/g, ''),
        'unreviewed generated runtime contribution; record its producer and evidence',
      )
    let path = id.replace(/^\0/, '').split('?')[0]
    const resolved = resolve(directory, path)
    if (existsSync(resolved)) path = realpathSync(resolved)
    else if (path.startsWith('node_modules/'))
      fail(path, 'missing emitted asset source')
    if (path.endsWith('.css') && existsSync(path)) {
      const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const match of css.matchAll(
        /@(import|plugin)\s+['"]([^'"]+)['"]/g,
      )) {
        const specifier = match[2]
        if (specifier.startsWith('.') || specifier.startsWith('/')) continue
        const name = specifier
          .split('/')
          .slice(0, specifier.startsWith('@') ? 2 : 1)
          .join('/')
        const imported = packageDirectory(name, dirname(path))
        const pkg = installed.find((candidate) => candidate.path === imported)
        if (!pkg) fail(name, 'unresolved delivered stylesheet or CSS plugin')
        selected.add(pkg.id)
        if (match[1] === 'plugin') generated.add(pkg.id)
      }
    }
    const owner = installed
      .filter((pkg) => path === pkg.path || path.startsWith(`${pkg.path}/`))
      .sort((a, b) => b.path.length - a.path.length)
      .at(0)
    if (owner) {
      selected.add(owner.id)
      const relativePath = path.slice(owner.path.length + 1)
      const scopeReview = exceptions.find((item) => item.id === owner.id)
      if (
        relativePath &&
        scopeReview?.runtimeFiles &&
        !scopeReview.runtimeFiles.includes(relativePath)
      )
        fail(
          owner.id,
          `unreviewed delivered material ${relativePath}; this mixed bundle was approved for a different target scope`,
        )
      if (
        relativePath.includes('/node_modules/') ||
        relativePath.startsWith('node_modules/')
      ) {
        const review = exceptions.find((item) => item.id === owner.id)
        const bundled = review?.bundled?.find((component) =>
          relativePath.startsWith(`${component.directory}/`),
        )
        if (
          !bundled ||
          !review?.evidence.some((item) => item.file === relativePath)
        )
          fail(
            owner.id,
            `unresolved bundled component ${relativePath}; record exact source and legal evidence`,
          )
        selectBundled(bundled)
      }
    } else if (path.includes('/node_modules/') || /^@?[\w/.-]+@[\d]/.test(path))
      fail(
        path.split('/node_modules/').at(-1) ?? path,
        'emitted component is outside the active locked installation',
      )
  }
  for (const name of policy.generated) {
    const packages = installed.filter((pkg) => pkg.manifest.name === name)
    if (!packages.length)
      fail(name, 'stale generated-runtime contribution record')
    for (const pkg of packages) {
      selected.add(pkg.id)
      generated.add(pkg.id)
    }
  }
  if (developmentScope)
    for (const review of exceptions.filter((item) => selected.has(item.id)))
      for (const bundled of review.bundled ?? []) {
        if (
          !developmentScope.some(
            (item) =>
              item.name === bundled.name && item.version === bundled.version,
          )
        )
          continue
        selectBundled(bundled)
      }
  function validateTexts(id: string, license: string, texts: Text[]) {
    if (!policy.licenses.includes(license) || /\bOR\b/i.test(license))
      fail(
        id,
        `unfamiliar license expression ${license}; record a reviewed license choice or policy`,
      )
    if (!texts.length)
      fail(id, 'missing required legal text; record reviewed local evidence')
    for (const text of texts) {
      if (
        !text.text.trim() ||
        !policy.approvedTexts.some(
          (approval) =>
            approval.sha256 === sha(text.text) &&
            approval.licenses.includes(license),
        )
      )
        fail(
          id,
          `unreviewed or changed legal evidence ${text.file} (sha256 ${sha(text.text)}); review actual terms before approving`,
        )
    }
    const identity = id.lastIndexOf('@')
    const name = id.slice(0, identity)
    const version = id.slice(identity + 1)
    const family = policy.evidenceSets.filter(
      (review) => review.name === name && review.license === license,
    )
    const exact = family.filter((review) => review.version === version)
    const candidates = exact.length ? exact : family
    const fingerprints = [...new Set(texts.map(({ text }) => sha(text)))].sort()
    if (
      !candidates.some(
        (review) =>
          JSON.stringify([...new Set(review.sha256)].sort()) ===
          JSON.stringify(fingerprints),
      )
    )
      fail(
        id,
        'incomplete or changed reviewed evidence set; restore all required grants and attributions, or review the complete new set',
      )
  }
  const entries = new Map<string, Entry>()
  for (const bundled of selectedBundled.values()) {
    validateTexts(bundled.id, bundled.license, bundled.texts)
    entries.set(bundled.id, bundled)
  }
  const tools = new Map<string, object>()
  for (const pkg of installed) {
    const exception = exceptions.find((item) => item.id === pkg.id)
    const texts = exception?.files
      ? exception.files.map((file) => localText(pkg.path, file))
      : legalFiles(pkg.path, selected.has(pkg.id))
    texts.push(...(exception?.texts ?? []))
    const license = exception?.license ?? pkg.manifest.license
    if (!selected.has(pkg.id)) {
      tools.set(pkg.id, {
        id: pkg.id,
        license: pkg.manifest.license,
        evidence: texts.map(({ file, text }) => ({ file, sha256: sha(text) })),
        limitation: texts.length
          ? 'Declared terms and local evidence; not a redistribution/source-compliance audit.'
          : 'No conventional standalone legal text; review before redistribution.',
      })
      continue
    }
    validateTexts(pkg.id, license, texts)
    const previous = entries.get(pkg.id)
    if (previous && previous.license !== license)
      fail(pkg.id, 'inconsistent grants across installed peer contexts')
    if (exception?.decisions?.length)
      texts.push({
        file: 'Reviewed license selections and scope',
        text: exception.decisions.join('\n') + '\n',
      })
    const combined = [...(previous?.texts ?? []), ...texts]
    const unique = combined
      .filter(
        (text, index) =>
          combined.findIndex(
            (item) => item.file === text.file && item.text === text.text,
          ) === index,
      )
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file, 'en') ||
          a.text.localeCompare(b.text, 'en'),
      )
    entries.set(pkg.id, {
      id: pkg.id,
      name: pkg.manifest.name,
      version: pkg.manifest.version,
      license,
      kind: pkg.manifest.name.startsWith('@fontsource')
        ? 'font'
        : generated.has(pkg.id) ||
            policy.contributions?.some(
              (rule) => rule.package === pkg.manifest.name,
            )
          ? 'generated'
          : 'software',
      texts: unique,
    })
  }
  const copiedSources = json<Copied[]>(
    join(directory, 'legal/copied-source.json'),
  )
  for (const importedDirectory of policy.copiedDirectories ?? []) {
    for (const file of readdirSync(join(directory, importedDirectory), {
      recursive: true,
      encoding: 'utf8',
    }).filter((candidate) => /\.(?:[cm]?[jt]sx?|css)$/.test(candidate))) {
      const path = `${importedDirectory}/${file}`
      if (
        !copiedSources.some((copied) =>
          copied.sources.some((source) => source.path === path),
        )
      )
        fail(
          path,
          'unresolved copied-source provenance; add reviewed attribution before shipping',
        )
    }
  }
  for (const copied of copiedSources) {
    if (
      !copied.reason.trim() ||
      !copied.sources.length ||
      !copied.texts.length ||
      !policy.licenses.includes(copied.license)
    )
      fail(
        copied.id,
        `unresolved copied-source provenance or unreviewed license ${copied.license}`,
      )
    for (const source of copied.sources) {
      if (sha(localText(directory, source.path).text) !== source.sha256)
        fail(
          copied.id,
          `invalidated copied-source evidence ${source.path}; review provenance after edits`,
        )
    }
    const { id, name, version, license, kind, texts } = copied
    entries.set(id, { id, name, version, license, kind, texts })
  }
  const project = {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license,
    copyright: 'Copyright (C) 2026 soren.codes',
    text: readFileSync(join(directory, 'LICENSE'), 'utf8'),
  }
  const content = {
    project,
    entries: [...entries.values()].sort((a, b) =>
      a.id.localeCompare(b.id, 'en'),
    ),
  }
  const data = { revision: sha(JSON.stringify(content)), ...content }
  const text =
    [
      `${project.name} ${project.version}\n${project.copyright}\n${project.license}\n\n${project.text}`,
      'THIRD-PARTY LICENSES AND NOTICES',
      ...data.entries.map(
        (entry) =>
          `${entry.id} — ${entry.license}\n${entry.texts.map((item) => `--- ${item.file} ---\n${item.text}`).join('\n')}`,
      ),
    ].join('\n\n') + '\n'
  const inventoryText =
    JSON.stringify(
      {
        limitations:
          'Development-only inventory for the locked target. Declarations and evidence are not clearance for redistributing toolchains, native libraries, or containers.',
        packages: [...tools.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'en'))
          .map(([, value]) => value),
      },
      null,
      2,
    ) + '\n'
  if (verifyInventory) {
    const path = join(directory, 'docs/development-licenses.json')
    if (!existsSync(path) || readFileSync(path, 'utf8') !== inventoryText)
      fail(
        'docs/development-licenses.json',
        'stale generated inventory; run pnpm notices:generate and review its diff',
      )
  }
  return { data, text, inventory: inventoryText }
}
