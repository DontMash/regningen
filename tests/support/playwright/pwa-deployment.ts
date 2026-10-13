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

export class PwaDeployment {
  private readonly temporaryDirectory: string
  private readonly releases: Record<ReleaseName, string>
  private readonly versions: Record<ReleaseName, string>
  private server: ChildProcess | null = null
  private serverOutput = ''
  private readonly port: number

  private constructor(
    temporaryDirectory: string,
    releases: Record<ReleaseName, string>,
    versions: Record<ReleaseName, string>,
    port: number,
  ) {
    this.temporaryDirectory = temporaryDirectory
    this.releases = releases
    this.versions = versions
    this.port = port
  }

  static async create() {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'regningen-pwa-deployment-'),
    )
    try {
      const releaseASource = join(temporaryDirectory, 'release-a-source')
      await createReleaseSource(releaseASource)
      await runCommand('pnpm', ['build'], releaseASource)
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
      const releaseBSource = join(temporaryDirectory, 'release-b-source')
      await createReleaseBSource(releaseBSource, versionB, changelog)
      await runCommand('pnpm', ['build'], releaseBSource)
      const releaseB = join(temporaryDirectory, 'release-b')
      await cp(join(releaseBSource, '.output'), releaseB, { recursive: true })

      return new PwaDeployment(
        temporaryDirectory,
        { a: releaseA, b: releaseB },
        { a: packageManifest.version, b: versionB },
        await findAvailablePort(),
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
    return join(this.releases[release], relativePath)
  }

  async deploy(release: ReleaseName) {
    await this.stopServer()
    const serverEntry = join(this.releases[release], 'server', 'index.mjs')
    this.serverOutput = ''
    this.server = spawn(process.execPath, [serverEntry], {
      cwd: this.releases[release],
      env: {
        ...process.env,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(this.port),
      },
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

async function createReleaseSource(directory: string) {
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
) {
  await createReleaseSource(directory)
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

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd,
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
