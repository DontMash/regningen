import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'production' },
    host: { type: 'string' },
    port: { type: 'string' },
  },
})

// Nitro's preview loader uses different files/precedence and overwrites empty
// shell values. Load through Vite, then run the same entry as production instead.
Object.assign(process.env, loadEnv(values.mode, process.cwd(), ''))
process.env.NITRO_HOST =
  values.host ?? process.env.NITRO_HOST ?? process.env.HOST ?? '127.0.0.1'
process.env.NITRO_PORT =
  values.port ?? process.env.NITRO_PORT ?? process.env.PORT ?? '4173'

// The built runtime validates application settings synchronously before listen.
// Unlike Vite's port fallback, Node fails if this port is already occupied.
await import(pathToFileURL(resolve('.output/server/index.mjs')).href)
