import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { generateNotices } from '../src/lib/notices/generate.ts'

const directory = process.cwd()
const read = (path) => JSON.parse(readFileSync(join(directory, path), 'utf8'))
const write = (path, text) => {
  mkdirSync(join(directory, path, '..'), { recursive: true })
  writeFileSync(join(directory, path), text)
}

export function bootstrapNotices() {
  const manifest = read('package.json')
  write(
    'src/generated/notices.json',
    JSON.stringify({
      revision: 'discovery-only-not-for-distribution',
      project: {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license,
        copyright: 'Copyright (C) 2026 soren.codes',
        text: readFileSync('LICENSE', 'utf8'),
      },
      entries: [],
    }),
  )
}

export function targetModules() {
  if (!existsSync('.notices/modules'))
    throw new Error('Licensing: target bundler evidence is missing.')
  return readdirSync('.notices/modules').flatMap((file) =>
    read(`.notices/modules/${file}`),
  )
}

export function produceNotices(delivered, { check = false } = {}) {
  const result = generateNotices({
    directory,
    delivered,
    verifyInventory: check,
  })
  const outputs = {
    'src/generated/notices.json': JSON.stringify(result.data, null, 2) + '\n',
    'public/third-party-notices.txt': result.text,
    'docs/development-licenses.json': result.inventory,
  }
  for (const [path, contents] of Object.entries(outputs)) {
    if (!check || path !== 'docs/development-licenses.json')
      write(path, contents)
  }
  return result
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  produceNotices(undefined, { check: process.argv.includes('--check') })
}
