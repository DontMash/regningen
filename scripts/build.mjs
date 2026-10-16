import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Forward options to Vite, not to the finalizer after a shell `&&` expression.
const vite = fileURLToPath(
  new URL('./bin/vite.js', import.meta.resolve('vite/package.json')),
)
const child = spawn(
  process.execPath,
  [vite, 'build', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  },
)
const code = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', resolve)
})
if (code === 0) await import('./finalize-pwa-output.mjs')
else process.exitCode = code ?? 1
