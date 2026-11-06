import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import {
  authorizeRelease,
  git,
  observeRelease,
  prepareRelease,
  publishRelease,
} from './release.ts'
import type { ImageIdentity, ReleaseIdentity } from './release.ts'

const cwd = process.cwd()
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required configuration: ${name}`)
  return value
}
function run(command: string, args: Array<string>): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim()
}
function gh(...args: Array<string>): string {
  return run('gh', args)
}
function api(path: string): unknown {
  return JSON.parse(gh('api', path))
}
const preparationSchema = z.object({
  base: z.string().regex(/^[a-f0-9]{40}$/),
  head: z.string().regex(/^[a-f0-9]{40}$/),
  version: z.string(),
  mode: z.string(),
})
const pullSchema = z.object({
  number: z.number(),
  body: z.string().nullable(),
  user: z.object({ login: z.string() }),
  merged: z.boolean(),
  merge_commit_sha: z.string().nullable(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
    repo: z.object({ full_name: z.string() }).nullable(),
  }),
  base: z.object({
    ref: z.string(),
    repo: z.object({ full_name: z.string() }),
  }),
})
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
async function candidate(merged: boolean): Promise<ReleaseIdentity> {
  const repository = required('GITHUB_REPOSITORY')
  const event = z
    .object({ pull_request: z.object({ number: z.number() }) })
    .parse(JSON.parse(readFileSync(required('GITHUB_EVENT_PATH'), 'utf8')))
  const pr = pullSchema.parse(
    api(`repos/${repository}/pulls/${event.pull_request.number}`),
  )
  const runId = pr.body?.match(/<!-- release-preparation:(\d+) -->/)?.[1]
  if (!runId) throw new Error('Missing trusted preparation run')
  for (let attempt = 0; attempt < 24; attempt++) {
    const proof = z
      .object({
        event: z.string(),
        path: z.string(),
        head_branch: z.string(),
        head_sha: z.string(),
        conclusion: z.string().nullable(),
        status: z.string(),
      })
      .parse(api(`repos/${repository}/actions/runs/${runId}`))
    if (
      proof.event !== 'workflow_dispatch' ||
      proof.path !== '.github/workflows/prepare-release.yml' ||
      proof.head_branch !== 'main'
    )
      throw new Error('Untrusted preparation workflow provenance')
    if (proof.status === 'completed') {
      if (proof.conclusion !== 'success')
        throw new Error('Preparation workflow did not succeed')
      const directory = mkdtempSync(join(tmpdir(), 'release-proof-'))
      try {
        gh(
          'run',
          'download',
          runId,
          '--repo',
          repository,
          '--name',
          'release-preparation',
          '--dir',
          directory,
        )
        const prepared = preparationSchema.parse(
          JSON.parse(readFileSync(join(directory, 'preparation.json'), 'utf8')),
        )
        if (proof.head_sha !== prepared.base)
          throw new Error('Preparation source differs from workflow source')
        git(cwd, 'fetch', 'origin', prepared.base, prepared.head)
        const identity = authorizeRelease({
          cwd,
          prepared,
          appLogin: required('RELEASE_APP_LOGIN'),
          repository,
          pr: {
            author: pr.user.login,
            repository: pr.base.repo.full_name,
            headRepository: pr.head.repo?.full_name ?? '',
            branch: pr.head.ref,
            baseBranch: pr.base.ref,
            head: pr.head.sha,
            merged: pr.merged,
          },
          ...(merged
            ? { merged: pr.merge_commit_sha ?? '' }
            : { currentMain: git(cwd, 'rev-parse', 'origin/main') }),
        })
        if (merged && git(cwd, 'rev-parse', 'HEAD') !== identity.commit)
          throw new Error('Checkout is not the exact authorized merged SHA')
        return identity
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
    await sleep(5000)
  }
  throw new Error(
    'Preparation proof not complete after 120 seconds; rerun validation',
  )
}

async function registryImage(
  image: string,
  tag: string,
  anonymous = false,
): Promise<ImageIdentity | null> {
  const authorization: Record<string, string> = anonymous
    ? {}
    : {
        Authorization: `Basic ${Buffer.from(`${required('GITHUB_ACTOR')}:${required('GH_TOKEN')}`).toString('base64')}`,
      }
  const tokenResponse = await fetch(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${image}:pull`,
    { headers: authorization },
  )
  if (!tokenResponse.ok)
    throw new Error(`GHCR token failed: HTTP ${tokenResponse.status}`)
  const { token } = z
    .object({ token: z.string() })
    .parse(await tokenResponse.json())
  const response = await fetch(`https://ghcr.io/v2/${image}/manifests/${tag}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:
        'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    },
  })
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`GHCR manifest failed: HTTP ${response.status}`)
  const manifest = z
    .object({ config: z.object({ digest: z.string() }) })
    .parse(await response.json())
  const configResponse = await fetch(
    `https://ghcr.io/v2/${image}/blobs/${manifest.config.digest}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!configResponse.ok)
    throw new Error(
      `GHCR image configuration failed: HTTP ${configResponse.status}`,
    )
  const { config } = z
    .object({ config: z.object({ Labels: z.record(z.string(), z.string()) }) })
    .parse(await configResponse.json())
  const digest = response.headers.get('docker-content-digest')
  if (!digest) throw new Error('Registry did not supply image digest')
  for (const [label, value] of Object.entries({
    'io.regningen.origin': required('PRODUCTION_ORIGIN'),
    'io.regningen.trust-proxy': required('TRUST_PROXY'),
    'io.regningen.hsts-stage': required('HSTS_STAGE'),
  })) {
    if (config.Labels[label] !== value)
      throw new Error(`Existing image configuration conflict: ${label}`)
  }
  return {
    digest,
    version: config.Labels['org.opencontainers.image.version'],
    commit: config.Labels['org.opencontainers.image.revision'],
  }
}
async function publish(identity: ReleaseIdentity) {
  const origin = required('PRODUCTION_ORIGIN')
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.origin !== origin)
    throw new Error('PRODUCTION_ORIGIN must be a normalized bare HTTPS origin')
  const repository = required('GITHUB_REPOSITORY')
  const image = repository.toLowerCase()
  const reference = `ghcr.io/${image}:${identity.version}`
  const tag = `v${identity.version}`
  await publishRelease(identity, {
    validate: async (stage) => {
      const jobs = z
        .object({
          jobs: z.array(
            z.object({
              name: z.string(),
              conclusion: z.string().nullable(),
              steps: z.array(
                z.object({
                  name: z.string(),
                  conclusion: z.string().nullable(),
                }),
              ),
            }),
          ),
        })
        .parse(
          api(
            `repos/${repository}/actions/runs/${required('GITHUB_RUN_ID')}/attempts/${required('GITHUB_RUN_ATTEMPT')}/jobs?per_page=100`,
          ),
        )
      const validation = jobs.jobs.find(
        (job) => job.name === 'Release validation',
      )
      if (
        validation?.conclusion !== 'success' ||
        !validation.steps.some(
          (step) => step.name === stage && step.conclusion === 'success',
        )
      )
        throw new Error(
          `Required exact-commit validation did not succeed: ${stage}`,
        )
    },
    versionedImage: () => registryImage(image, identity.version),
    buildImage: async () => {
      run('docker', [
        'buildx',
        'build',
        '--platform',
        'linux/amd64',
        '--provenance=false',
        '--sbom=false',
        '--push',
        '--tag',
        reference,
        '--build-arg',
        `SOURCE=https://github.com/${repository}`,
        '--build-arg',
        `VERSION=${identity.version}`,
        '--build-arg',
        `COMMIT=${identity.commit}`,
        '--build-arg',
        `ORIGIN=${origin}`,
        '--build-arg',
        `TRUST_PROXY=${required('TRUST_PROXY')}`,
        '--build-arg',
        `HSTS_STAGE=${required('HSTS_STAGE')}`,
        '.',
      ])
      const artifact = await registryImage(image, identity.version)
      if (!artifact) throw new Error('Published image is missing')
      return artifact
    },
    assertPublic: async (artifact) => {
      try {
        const publicImage = await registryImage(image, identity.version, true)
        if (publicImage?.digest !== artifact.digest)
          throw new Error('Anonymous image digest does not match')
      } catch (cause) {
        throw new Error(
          `Versioned image is not publicly pullable. Make GHCR package public, then rerun this same workflow before latest promotion. ${String(cause)}`,
        )
      }
    },
    ensureTag: async () => {
      const refs = z
        .array(
          z.object({ ref: z.string(), object: z.object({ sha: z.string() }) }),
        )
        .parse(api(`repos/${repository}/git/matching-refs/tags/${tag}`))
      const existing = refs.find((ref) => ref.ref === `refs/tags/${tag}`)
      if (existing) {
        git(cwd, 'fetch', 'origin', `refs/tags/${tag}`)
        if (git(cwd, 'rev-parse', 'FETCH_HEAD^{commit}') !== identity.commit)
          throw new Error('Permanent Git tag conflict')
      } else
        gh(
          'api',
          `repos/${repository}/git/refs`,
          '-f',
          `ref=refs/tags/${tag}`,
          '-f',
          `sha=${identity.commit}`,
        )
    },
    ensureRelease: async (artifact) => {
      const changelog = readFileSync('CHANGELOG.md', 'utf8')
      const notes = changelog.slice(changelog.search(/^## /m)).split(/\n## /)[0]
      const body = `${notes}\n\nVersion: ${identity.version}\nCommit: ${identity.commit}\nImage: ${reference}\nDigest: ${artifact.digest}\n`
      const releases = z
        .array(
          z.object({
            tag_name: z.string(),
            body: z.string().nullable(),
            draft: z.boolean(),
            prerelease: z.boolean(),
          }),
        )
        .parse(
          JSON.parse(
            gh(
              'api',
              '--paginate',
              '--slurp',
              `repos/${repository}/releases?per_page=100`,
            ),
          ).flat(),
        )
      const existing = releases.find((release) => release.tag_name === tag)
      if (existing) {
        if (existing.body !== body || existing.draft || existing.prerelease)
          throw new Error('Existing GitHub Release identity/notes conflict')
      } else
        gh(
          'api',
          `repos/${repository}/releases`,
          '-f',
          `tag_name=${tag}`,
          '-f',
          `target_commitish=${identity.commit}`,
          '-f',
          `name=${tag}`,
          '-f',
          `body=${body}`,
        )
    },
    promote: async (artifact) => {
      run('docker', [
        'buildx',
        'imagetools',
        'create',
        '--prefer-index=false',
        '--tag',
        `ghcr.io/${image}:latest`,
        `ghcr.io/${image}@${artifact.digest}`,
      ])
      if ((await registryImage(image, 'latest'))?.digest !== artifact.digest)
        throw new Error('latest digest differs from retained release')
    },
    observe: () => observeRelease(origin, identity),
  })
}
async function main() {
  const operation = process.argv[2]
  if (operation === 'prepare') {
    if (required('GITHUB_REF') !== 'refs/heads/main')
      throw new Error('Prepare Release must run on main')
    git(cwd, 'fetch', 'origin', 'main', '--tags')
    const base = git(cwd, 'rev-parse', 'origin/main')
    if (base !== required('GITHUB_SHA'))
      throw new Error('main advanced; start a new preparation run')
    git(cwd, 'checkout', '-B', 'automation/release', base)
    const prepared = prepareRelease({
      cwd,
      base,
      mode: required('RELEASE_MODE'),
      version: process.env.RELEASE_VERSION,
    })
    git(cwd, 'push', '--force', 'origin', 'HEAD:refs/heads/automation/release')
    writeFileSync(
      join(required('RUNNER_TEMP'), 'preparation.json'),
      JSON.stringify(prepared),
    )
  } else if (operation === 'propose') {
    const prepared = preparationSchema.parse(
      JSON.parse(
        readFileSync(join(required('RUNNER_TEMP'), 'preparation.json'), 'utf8'),
      ),
    )
    const body = `Prepared from ${prepared.base}\nVersion: ${prepared.version}\nMode: ${prepared.mode}\n\n<!-- release-preparation:${required('GITHUB_RUN_ID')} -->\n\nReview generated notes. Merge authorizes publication; regenerate manually if main advances.`
    const open = z
      .array(
        z.object({
          number: z.number(),
          author: z.object({ login: z.string() }),
        }),
      )
      .parse(
        JSON.parse(
          gh(
            'pr',
            'list',
            '--head',
            'automation/release',
            '--base',
            'main',
            '--state',
            'open',
            '--json',
            'number,author',
          ),
        ),
      )
    if (open.length > 1)
      throw new Error('Multiple open release PRs require manual cleanup')
    const title = `Release v${prepared.version}`
    if (open.length) {
      if (open[0].author.login !== required('RELEASE_APP_LOGIN'))
        throw new Error('Release PR is not owned by the configured App')
      gh('pr', 'edit', String(open[0].number), '--title', title, '--body', body)
    } else
      gh(
        'pr',
        'create',
        '--base',
        'main',
        '--head',
        'automation/release',
        '--title',
        title,
        '--body',
        body,
      )
  } else if (operation === 'check') {
    const event = JSON.parse(
      readFileSync(required('GITHUB_EVENT_PATH'), 'utf8'),
    )
    if (event.pull_request?.head?.ref !== 'automation/release') return
    git(cwd, 'fetch', 'origin', 'main')
    await candidate(false)
  } else if (operation === 'authorize') {
    const identity = await candidate(true)
    writeFileSync(
      required('GITHUB_OUTPUT'),
      `commit=${identity.commit}\nversion=${identity.version}\n`,
      { flag: 'a' },
    )
  } else if (operation === 'publish') {
    await publish(await candidate(true))
  } else throw new Error('Expected prepare, propose, check, or publish')
}
await main()
