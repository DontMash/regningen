import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const publicDirectory = resolve('.output/public')
const serverEntry = resolve('.output/server/index.mjs')
const publicAssetsMarker = 'var public_assets_data_default = '

const serverSource = await readFile(serverEntry, 'utf8')
const markerStart = serverSource.indexOf(publicAssetsMarker)
const objectStart = serverSource.indexOf('{', markerStart)
const objectEnd = serverSource.indexOf('\n};', objectStart) + 2
if (markerStart < 0 || objectStart < 0 || objectEnd < 2)
  throw new Error('Could not locate Nitro’s generated public asset metadata.')

const publicAssets = JSON.parse(serverSource.slice(objectStart, objectEnd))
const generatedRootAssets = (await readdir(publicDirectory)).filter(
  (name) =>
    name === 'sw.js' ||
    name === 'manifest.webmanifest' ||
    name.startsWith('workbox-') ||
    name.startsWith('pwa-') ||
    name.startsWith('maskable-icon-') ||
    name.startsWith('apple-touch-icon-') ||
    name.startsWith('favicon.'),
)
const renderedStyles = (await readdir(resolve(publicDirectory, 'assets')))
  .filter((name) => name.endsWith('.css'))
  .map((name) => `assets/${name}`)

for (const name of [...generatedRootAssets, ...renderedStyles]) {
  const path = resolve(publicDirectory, name)
  const [contents, fileStats] = await Promise.all([readFile(path), stat(path)])
  const asset = publicAssets[`/${name}`]
  if (!asset)
    throw new Error(`Nitro did not include generated PWA asset ${name}.`)

  // vite-plugin-pwa finishes its final worker generation after Nitro snapshots
  // static metadata. Refresh validators and lengths so Nitro serves the full file.
  asset.etag = `"${contents.length.toString(16)}-${createHash('sha1')
    .update(contents)
    .digest('base64')
    .replace(/=+$/, '')}"`
  asset.mtime = fileStats.mtime.toJSON()
  asset.size = fileStats.size
}

const updatedServerSource =
  serverSource.slice(0, objectStart) +
  JSON.stringify(publicAssets, null, 2) +
  serverSource.slice(objectEnd)
await writeFile(serverEntry, updatedServerSource)
