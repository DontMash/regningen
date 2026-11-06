import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, connect } from 'node:net'
import { networkInterfaces } from 'node:os'

assert.notEqual(process.getuid(), 0, 'Offline processes must not run as root')
const status = readFileSync('/proc/self/status', 'utf8')
for (const capability of ['CapEff', 'CapPrm', 'CapBnd', 'CapAmb']) {
  assert.match(status, new RegExp(`${capability}:\\s+0+\\n`))
}
assert.match(status, /NoNewPrivs:\s+1\n/)
assert.deepEqual(Object.keys(networkInterfaces()), ['lo'])

function connection(host, port) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port })
    socket.setTimeout(3000, () => {
      socket.destroy(new Error(`Network probe timed out: ${host}`))
    })
    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('error', reject)
  })
}

for (const host of ['127.0.0.1', '::1']) {
  const server = createServer((socket) => socket.end())
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, host, resolve)
    })
    await connection(host, server.address().port)
    console.log(`Offline probe: loopback ${host} succeeds`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

for (const host of ['1.1.1.1', '2606:4700:4700::1111']) {
  await assert.rejects(connection(host, 443), (error) =>
    ['ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM'].includes(error.code),
  )
  console.log(`Offline probe: external ${host} denied`)
}

if (!process.argv.includes('--child')) {
  const child = spawnSync(process.execPath, [import.meta.filename, '--child'], {
    stdio: 'inherit',
  })
  if (child.error) throw child.error
  assert.equal(child.status, 0, 'Spawned child must inherit network isolation')
  console.log(
    'Offline probe: spawned child is equally isolated and unprivileged',
  )
}
