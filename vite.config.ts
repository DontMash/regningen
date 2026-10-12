import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { validateReleaseData } from './src/lib/release-data-validation.ts'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

function pwaReleaseAssets(): Plugin {
  let rootDirectory = process.cwd()

  return {
    name: 'generate-regningen-pwa-assets',
    apply: 'build',
    configResolved(config) {
      rootDirectory = config.root
    },
    generateBundle(outputOptions, bundle) {
      // The client output is the only bundle containing the app stylesheet.
      if (
        !outputOptions.dir ||
        !Object.keys(bundle).some((file) => file.endsWith('.css'))
      ) {
        return
      }

      const packageManifest = JSON.parse(
        readFileSync(resolve(rootDirectory, 'package.json'), 'utf8'),
      ) as { version: string }
      const releases = validateReleaseData(rootDirectory)
      const currentRelease = releases.find(
        (release) => release.version === packageManifest.version,
      )
      if (!currentRelease) {
        this.error('The current release changelog is unavailable for the PWA.')
      }

      const releaseInfo = {
        version: packageManifest.version,
        markdown: currentRelease.markdown,
      }
      const staticUrls = [
        ...Object.keys(bundle)
          .filter((file) =>
            /\.(?:js|mjs|css|woff2?|png|svg|webp|ico)$/.test(file),
          )
          .map((file) => `/${file}`),
        '/manifest.webmanifest',
        '/pwa-release.json',
        '/favicon.svg',
        '/favicon.png',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-192.png',
        '/icons/icon-maskable-512.png',
        '/icons/apple-touch-icon.png',
      ]
      const precacheUrls = [...new Set(staticUrls)]
      const template = readFileSync(
        resolve(rootDirectory, 'src/features/pwa/service-worker-template.js'),
        'utf8',
      )
      const revision = createHash('sha256')
        .update(JSON.stringify(releaseInfo))
        .update(template)
      for (const url of [...precacheUrls].sort()) {
        if (url === '/pwa-release.json') continue
        const asset = Object.hasOwn(bundle, url.slice(1))
          ? bundle[url.slice(1)]
          : undefined
        revision.update(url)
        revision.update(
          asset
            ? asset.type === 'chunk'
              ? asset.code
              : asset.source
            : readFileSync(resolve(rootDirectory, 'public', url.slice(1))),
        )
      }
      const worker = template
        .replace('__APP_VERSION__', () =>
          JSON.stringify(packageManifest.version),
        )
        .replace('__ASSET_REVISION__', () =>
          JSON.stringify(revision.digest('hex').slice(0, 16)),
        )
        .replace('__RELEASE_INFO__', () => JSON.stringify(releaseInfo))
        .replace('__PRECACHE_URLS__', () => JSON.stringify(precacheUrls))

      this.emitFile({
        type: 'asset',
        fileName: 'pwa-release.json',
        source: JSON.stringify(releaseInfo),
      })
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker })
    },
  }
}

function releaseDataValidation(): Plugin {
  let rootDirectory = process.cwd()

  return {
    name: 'validate-application-release-data',
    apply: 'build',
    configResolved(config) {
      rootDirectory = config.root
    },
    buildStart() {
      try {
        validateReleaseData(rootDirectory)
      } catch (error) {
        this.error(
          error instanceof Error
            ? error.message
            : 'Invalid application release data.',
        )
      }
    },
  }
}

const config = defineConfig({
  envPrefix: ['VITE_', 'PUBLIC_'],
  resolve: { tsconfigPaths: true },
  plugins: [
    releaseDataValidation(),
    pwaReleaseAssets(),
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      routeRules: {
        '/sw.js': {
          headers: { 'cache-control': 'no-cache, no-store, must-revalidate' },
        },
        '/pwa-release.json': {
          headers: { 'cache-control': 'no-cache' },
        },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default config
