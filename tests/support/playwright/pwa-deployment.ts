import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectRoot = process.cwd()

type ReleaseName = 'a' | 'b'
type DeploymentEnvironment = {
  ORIGIN?: string | undefined
  TRUST_PROXY?: string | undefined
  HSTS_STAGE?: string | undefined
}
type CommandResult = {
  exitCode: number | null
  signal: NodeJS.Signals | null
  output: string
}
type ServerCommand = 'dev' | 'preview' | 'production'

export class PwaDeployment {
  private readonly temporaryDirectory: string
  private readonly releases: Partial<Record<ReleaseName, string>>
  private readonly versions: Record<ReleaseName, string>
  private server: ReturnType<typeof startCommand> | null = null
  private readonly port: number

  private constructor(
    temporaryDirectory: string,
    releases: Partial<Record<ReleaseName, string>>,
    versions: Record<ReleaseName, string>,
    port: number,
  ) {
    this.temporaryDirectory = temporaryDirectory
    this.releases = releases
    this.versions = versions
    this.port = port
  }

  static async create({
    updates = true,
    failedPage = false,
    updateKind = 'content',
    build = true,
    environment,
    environmentFiles = {},
    updateEnvironment = {},
  }: {
    updates?: boolean
    failedPage?: boolean
    updateKind?: 'content' | 'security-policy' | 'configuration'
    build?: boolean
    environment?: DeploymentEnvironment
    environmentFiles?: Record<string, string>
    updateEnvironment?: DeploymentEnvironment
  } = {}) {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'regningen-pwa-deployment-'),
    )
    try {
      const port = await findAvailablePort()
      // Build and runtime ORIGIN must agree for normal PWA tests: it contributes
      // to the cached SSR document revision, even when SemVer is unchanged.
      const buildEnvironment = commandEnvironment(
        environment ?? {
          ORIGIN: `http://127.0.0.1:${port}`,
          TRUST_PROXY: 'false',
          HSTS_STAGE: 'off',
        },
      )
      const releaseASource = join(temporaryDirectory, 'release-a-source')
      await createReleaseSource(releaseASource, failedPage)
      await replaceEnvironmentFiles(releaseASource, environmentFiles)
      const releaseA = join(temporaryDirectory, 'release-a')
      if (build) {
        requireSuccess(
          await buildRelease(releaseASource, releaseA, buildEnvironment),
        )
      }

      const packageManifest = JSON.parse(
        await readFile(join(projectRoot, 'package.json'), 'utf8'),
      ) as { version: string }
      const changelog = await readFile(
        join(projectRoot, 'CHANGELOG.md'),
        'utf8',
      )
      const versionB = packageManifest.version
      const releases: Partial<Record<ReleaseName, string>> = build
        ? { a: releaseA }
        : {}
      if (updates) {
        const releaseBSource = join(temporaryDirectory, 'release-b-source')
        if (updateKind === 'security-policy') {
          await createReleaseSource(releaseBSource, failedPage)
          const policyPath = join(releaseBSource, 'src/lib/security-policy.ts')
          const policy = await readFile(policyPath, 'utf8')
          const permissions = 'camera=(), microphone=(), geolocation=()'
          if (!policy.includes(permissions))
            throw new Error('Could not locate policy-only update fixture.')
          await writeFile(
            policyPath,
            policy.replace(permissions, `${permissions}, display-capture=()`),
          )
        } else if (updateKind === 'configuration') {
          await createReleaseSource(releaseBSource, failedPage)
        } else {
          await createReleaseBSource(
            releaseBSource,
            versionB,
            changelog,
            failedPage,
          )
        }
        await replaceEnvironmentFiles(releaseBSource, environmentFiles)
        if (build) {
          const releaseB = join(temporaryDirectory, 'release-b')
          requireSuccess(
            await buildRelease(
              releaseBSource,
              releaseB,
              commandEnvironment({ ...buildEnvironment, ...updateEnvironment }),
            ),
          )
          releases.b = releaseB
        }
      }

      return new PwaDeployment(
        temporaryDirectory,
        releases,
        { a: packageManifest.version, b: versionB },
        port,
      )
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true })
      throw error
    }
  }

  // Sources never inherit the checkout's .env files. Replacing the set makes
  // each command's file prerequisites explicit, including deliberate absence.
  async setEnvironmentFiles(
    files: Record<string, string>,
    target: 'source' | 'runtime' = 'source',
  ) {
    await replaceEnvironmentFiles(
      target === 'source'
        ? join(this.temporaryDirectory, 'release-a-source')
        : this.releaseDirectory('a'),
      files,
    )
  }

  async build(environment: DeploymentEnvironment = {}, mode?: string) {
    await this.stopServer()
    const source = join(this.temporaryDirectory, 'release-a-source')
    const artifact = join(this.temporaryDirectory, 'release-a')
    const result = await buildRelease(
      source,
      artifact,
      commandEnvironment(environment),
      mode,
    )
    if (result.exitCode === 0) this.releases.a = artifact
    return result
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.port}`
  }

  version(release: ReleaseName) {
    return this.versions[release]
  }

  artifactPath(release: ReleaseName, relativePath: string) {
    return join(this.releaseDirectory(release), relativePath)
  }

  async deploy(release: ReleaseName, overrides: DeploymentEnvironment = {}) {
    const result = await this.serve('production', {
      release,
      environment: {
        ORIGIN: this.baseUrl,
        TRUST_PROXY: 'false',
        HSTS_STAGE: 'off',
        ...overrides,
      },
    })
    if (!result.ready) {
      throw new Error(`Production server exited early:\n${result.output}`)
    }
  }

  async serve(
    command: ServerCommand,
    {
      release = 'a',
      environment = {},
      mode,
      envFile,
    }: {
      release?: ReleaseName
      environment?: DeploymentEnvironment
      mode?: string
      envFile?: string
    } = {},
  ) {
    await this.stopServer()
    const production = command === 'production'
    if (envFile && !production) {
      throw new Error('Explicit Node environment files require production.')
    }
    const directory = production
      ? this.releaseDirectory(release)
      : join(this.temporaryDirectory, `release-${release}-source`)
    const args = production
      ? [
          ...(envFile ? [`--env-file=${envFile}`] : []),
          join(directory, 'server', 'index.mjs'),
        ]
      : [
          command,
          '--host',
          '127.0.0.1',
          '--port',
          String(this.port),
          ...(command === 'dev'
            ? ['--strictPort', '--config', 'vite.environment.config.ts']
            : []),
          ...(mode ? ['--mode', mode] : []),
        ]
    this.server = startCommand(
      production ? process.execPath : 'pnpm',
      args,
      directory,
      {
        ...commandEnvironment(environment),
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(this.port),
      },
    )
    const server = this.server
    // Never render an application page to establish readiness: lazy validation
    // must not make an otherwise reachable static worker look like a failure.
    const readinessPath = command === 'dev' ? '/favicon.svg' : '/sw.js'
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.child.exitCode !== null || server.child.signalCode !== null) {
        return { ...(await server.completed), ready: false }
      }
      if (server.finished()) {
        return { ...(await server.completed), ready: false }
      }
      try {
        const response = await fetch(`${this.baseUrl}${readinessPath}`, {
          signal: AbortSignal.timeout(1000),
        })
        const body = await response.text()
        if (
          response.ok &&
          (command === 'dev' || body.includes('precacheAndRoute'))
        ) {
          return { ...server.result(), ready: true }
        }
      } catch {
        // Connection refusal is expected until the command opens its listener.
      }
      await delay(200)
    }
    await this.stopServer()
    throw new Error(
      `${command} server did not start:\n${server.result().output}`,
    )
  }

  async dispose() {
    await this.stopServer()
    await rm(this.temporaryDirectory, { recursive: true, force: true })
  }

  private releaseDirectory(release: ReleaseName) {
    const directory = this.releases[release]
    if (!directory) throw new Error(`Release ${release} was not built.`)
    return directory
  }

  private async stopServer() {
    const server = this.server
    this.server = null
    if (server) await stopCommand(server)
  }
}

async function createReleaseSource(directory: string, failedPage = false) {
  await mkdir(directory, { recursive: true })
  for (const entry of [
    'src',
    'public',
    'docs',
    'vite.config.ts',
    'pwa-assets.config.ts',
    'scripts',
    'tsconfig.json',
    'tsr.config.json',
    'components.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'package.json',
    'CHANGELOG.md',
  ]) {
    await cp(join(projectRoot, entry), join(directory, entry), {
      recursive: true,
    })
  }
  // Dev requests resolve symlinked packages outside the isolated source. Use
  // Vite's public configuration interface to permit just these dependencies;
  // do not rewrite application config source or weaken the real dev sandbox.
  await writeFile(
    join(directory, 'vite.environment.config.ts'),
    `import { defineConfig, mergeConfig } from 'vite'
import applicationConfig from './vite.config.ts'
export default defineConfig(async (environment) => {
  const config = await (typeof applicationConfig === 'function'
    ? applicationConfig(environment)
    : applicationConfig)
  return mergeConfig(config, {
    server: { fs: { allow: ${JSON.stringify([directory, join(projectRoot, 'node_modules')])} } },
  })
})
`,
  )
  if (failedPage) {
    // A native throwing loader exists only in the isolated test source. It uses
    // the real landing head to prove failed pages cannot retain eligibility.
    await writeFile(
      join(directory, 'src/routes/visibility-failure.tsx'),
      `import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '@/lib/page-head'
import { landingVisibility } from '@/features/landing/visibility'

export const Route = createFileRoute('/visibility-failure')({
  loader: () => { throw new Error('Deliberate delivered-page failure fixture') },
  head: ({ matches }) => pageHead(landingVisibility, matches),
  component: () => <p>The failed page must not render successfully.</p>,
})
`,
    )
  }
  await symlink(
    join(projectRoot, 'node_modules'),
    join(directory, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
}

async function createReleaseBSource(
  directory: string,
  version: string,
  previousChangelog: string,
  failedPage: boolean,
) {
  await createReleaseSource(directory, failedPage)
  const packageManifest = JSON.parse(
    await readFile(join(directory, 'package.json'), 'utf8'),
  ) as { version: string }
  packageManifest.version = version
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
  )
  await writeFile(join(directory, 'CHANGELOG.md'), previousChangelog)

  const invoicePagePath = join(
    directory,
    'src/features/invoicing/InvoicePage.tsx',
  )
  const invoicePage = await readFile(invoicePagePath, 'utf8')
  const invoiceHeading = '<h1 className="heading-1">Rechnung erstellen</h1>'
  if (!invoicePage.includes(invoiceHeading)) {
    throw new Error('Could not locate the Invoice route heading for release B.')
  }
  await writeFile(
    invoicePagePath,
    invoicePage.replace(
      invoiceHeading,
      `${invoiceHeading}\n            <p>Release B lazy asset fixture</p>`,
    ),
  )

  const landingVisibilityPath = join(
    directory,
    'src/features/landing/visibility.ts',
  )
  const landingVisibility = await readFile(landingVisibilityPath, 'utf8')
  const landingTitle =
    'regningen – Rechnungen erstellen und als PDF herunterladen'
  if (!landingVisibility.includes(landingTitle)) {
    throw new Error('Could not locate the landing title for release B.')
  }
  await writeFile(
    landingVisibilityPath,
    landingVisibility.replace(landingTitle, `${landingTitle} – Release B`),
  )

  const landingPagePath = join(directory, 'src/features/landing/HomePage.tsx')
  const landingPage = await readFile(landingPagePath, 'utf8')
  const landingCopy = 'Ohne Benutzerkonto.'
  if (!landingPage.includes(landingCopy)) {
    throw new Error('Could not locate the landing copy for release B.')
  }
  await writeFile(
    landingPagePath,
    landingPage.replace(
      landingCopy,
      `${landingCopy} Release B landing document fixture`,
    ),
  )
}

async function findAvailablePort() {
  const server = net.createServer()
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not reserve a local port for the PWA deployment.')
  }
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()))
  })
  return address.port
}

function commandEnvironment(overrides: DeploymentEnvironment) {
  const environment = { ...process.env }
  // The operator's shell must not configure an isolated deployment by accident.
  for (const name of ['ORIGIN', 'TRUST_PROXY', 'HSTS_STAGE']) {
    delete environment[name]
  }
  Object.assign(environment, overrides)
  for (const name of Object.keys(environment)) {
    if (environment[name] === undefined) delete environment[name]
  }
  return environment
}

async function replaceEnvironmentFiles(
  directory: string,
  files: Record<string, string>,
) {
  const isEnvironmentFile = (name: string) => /^\.env(?:\.[\w.-]+)?$/.test(name)
  for (const name of Object.keys(files)) {
    if (!isEnvironmentFile(name)) {
      throw new Error(`Expected a root .env filename, received ${name}.`)
    }
  }
  for (const name of await readdir(directory)) {
    if (isEnvironmentFile(name))
      await rm(join(directory, name), { force: true })
  }
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(directory, name), contents)
  }
}

function startCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let finished = false
  const result = (): CommandResult => ({
    exitCode: child.exitCode,
    signal: child.signalCode,
    output,
  })
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  child.once('error', (error) => {
    output += `\n${error.message}`
  })
  // close, unlike exit, waits until both output streams have been collected.
  const completed = new Promise<CommandResult>((resolveCommand) => {
    child.once('close', () => {
      finished = true
      resolveCommand(result())
    })
  })
  return { child, result, completed, finished: () => finished }
}

async function stopCommand(command: ReturnType<typeof startCommand>) {
  if (command.finished()) return
  const signal = (value: NodeJS.Signals) => {
    try {
      // pnpm launches descendants; terminating only pnpm leaves listeners alive.
      if (process.platform !== 'win32' && command.child.pid) {
        process.kill(-command.child.pid, value)
      } else {
        command.child.kill(value)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  const timeout = setTimeout(() => signal('SIGKILL'), 3000)
  try {
    signal('SIGTERM')
    await command.completed
  } finally {
    clearTimeout(timeout)
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  const running = startCommand(command, args, cwd, env)
  const timeout = setTimeout(() => void stopCommand(running), 120_000)
  try {
    return await running.completed
  } finally {
    clearTimeout(timeout)
  }
}

async function buildRelease(
  source: string,
  artifact: string,
  environment: NodeJS.ProcessEnv,
  mode?: string,
) {
  const result = await runCommand(
    'pnpm',
    ['build', ...(mode ? ['--mode', mode] : [])],
    source,
    environment,
  )
  if (result.exitCode === 0) {
    await rm(artifact, { recursive: true, force: true })
    await cp(join(source, '.output'), artifact, { recursive: true })
  }
  return result
}

function requireSuccess(result: CommandResult) {
  if (result.exitCode !== 0) {
    throw new Error(
      `Build failed with exit code ${result.exitCode}:\n${result.output.slice(-12000)}`,
    )
  }
}

function delay(milliseconds: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}
