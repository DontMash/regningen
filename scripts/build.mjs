import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bootstrapNotices, produceNotices, targetModules } from './notices.mjs'
import {
  packagedModules,
  validateNoticeArtifacts,
} from '../src/lib/notices/build.ts'

// Discover the actual target first, then compile the one validated notices
// dataset into the real release. Discovery output is never a releasable fallback.
const vite = fileURLToPath(
  new URL('./bin/vite.js', import.meta.resolve('vite/package.json')),
)
async function build() {
  const child = spawn(
    process.execPath,
    [vite, 'build', ...process.argv.slice(2)],
    { stdio: 'inherit' },
  )
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0)
    throw new Error(`Vite build failed (${code ?? 'terminated'}).`)
}

try {
  rmSync('.notices/modules', { recursive: true, force: true })
  rmSync('.output', { recursive: true, force: true })
  bootstrapNotices()
  await build()
  const expected = produceNotices([
    ...targetModules(),
    ...packagedModules(process.cwd()),
  ])
  rmSync('.notices/modules', { recursive: true, force: true })
  rmSync('.output', { recursive: true, force: true })
  await build()
  await import('./finalize-pwa-output.mjs')
  validateNoticeArtifacts(process.cwd(), targetModules(), expected)
} catch (error) {
  rmSync('.output', { recursive: true, force: true })
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
