import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const vite = fileURLToPath(
  new URL('./bin/vite.js', import.meta.resolve('vite/package.json')),
)
const result = spawnSync(
  process.execPath,
  [vite, 'build', ...process.argv.slice(2)],
  { stdio: 'inherit' },
)

if (result.error) throw result.error
if (result.status !== 0) {
  process.exitCode = result.status ?? 1
} else {
  copyFileSync('LICENSE', '.output/LICENSE')
}
