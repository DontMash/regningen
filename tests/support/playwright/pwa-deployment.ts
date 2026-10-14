import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'

const projectRoot = process.cwd()

type ReleaseName = 'a' | 'b'
type DeploymentEnvironment = {
  ORIGIN?: string | undefined
  TRUST_PROXY?: string | undefined
}

export class PwaDeployment {
  private readonly temporaryDirectory: string
  private readonly releases: Partial<Record<ReleaseName, string>>
  private readonly versions: Record<ReleaseName, string>
  private server: ChildProcess | null = null
  private serverOutput = ''
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
  }: { updates?: boolean; failedPage?: boolean } = {}) {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'regningen-pwa-deployment-'),
    )
    try {
      const port = await findAvailablePort()
      // Build and runtime ORIGIN must agree for normal PWA tests: it contributes
      // to the cached SSR document revision, even when SemVer is unchanged.
      const buildEnvironment = {
        ...process.env,
        ORIGIN: `http://127.0.0.1:${port}`,
        TRUST_PROXY: 'false',
      }
      const releaseASource = join(temporaryDirectory, 'release-a-source')
      await createReleaseSource(releaseASource, failedPage)
      await runCommand('pnpm', ['build'], releaseASource, buildEnvironment)
      const releaseA = join(temporaryDirectory, 'release-a')
      await cp(join(releaseASource, '.output'), releaseA, { recursive: true })

      const packageManifest = JSON.parse(
        await readFile(join(projectRoot, 'package.json'), 'utf8'),
      ) as { version: string }
      const changelog = await readFile(
        join(projectRoot, 'CHANGELOG.md'),
        'utf8',
      )
      const versionB = packageManifest.version
      const releases: Partial<Record<ReleaseName, string>> = { a: releaseA }
      if (updates) {
        const releaseBSource = join(temporaryDirectory, 'release-b-source')
        await createReleaseBSource(
          releaseBSource,
          versionB,
          changelog,
          failedPage,
        )
        await runCommand('pnpm', ['build'], releaseBSource, buildEnvironment)
        const releaseB = join(temporaryDirectory, 'release-b')
        await cp(join(releaseBSource, '.output'), releaseB, { recursive: true })
        releases.b = releaseB
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
    await this.stopServer()
    const directory = this.releaseDirectory(release)
    const serverEntry = join(directory, 'server', 'index.mjs')
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      ORIGIN: this.baseUrl,
      TRUST_PROXY: 'false',
      ...overrides,
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(this.port),
    }
    // Explicit undefined removes a value, including any inherited parent value.
    for (const name of Object.keys(environment)) {
      if (environment[name] === undefined) delete environment[name]
    }
    this.serverOutput = ''
    this.server = spawn(process.execPath, [serverEntry], {
      cwd: directory,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.server.stdout?.on('data', (chunk: Buffer) => {
      this.serverOutput += chunk.toString()
    })
    this.server.stderr?.on('data', (chunk: Buffer) => {
      this.serverOutput += chunk.toString()
    })

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (this.server.exitCode !== null) {
        throw new Error(`Production server exited early:\n${this.serverOutput}`)
      }
      try {
        const response = await fetch(`${this.baseUrl}/sw.js`, {
          signal: AbortSignal.timeout(1000),
        })
        const worker = response.ok ? await response.text() : ''
        if (response.ok && worker.includes('precacheAndRoute')) return
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('Expected release')
        ) {
          throw error
        }
      }
      await delay(200)
    }

    throw new Error(`Production server did not start:\n${this.serverOutput}`)
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
    if (!server || server.exitCode !== null) return

    await new Promise<void>((resolveExit) => {
      const timeout = setTimeout(() => {
        server.kill('SIGKILL')
      }, 3000)
      server.once('exit', () => {
        clearTimeout(timeout)
        resolveExit()
      })
      server.kill('SIGTERM')
    })
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

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  return new Promise<void>((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolveCommand()
      else {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed with exit code ${code}:\n${output.slice(-12000)}`,
          ),
        )
      }
    })
  })
}

function delay(milliseconds: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}
