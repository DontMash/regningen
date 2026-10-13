import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { validateReleaseData } from './src/lib/release-data-validation.ts'
import { devtools } from '@tanstack/devtools-vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { ResolvedVitePWAOptions } from 'vite-plugin-pwa'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

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

function outputFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory()
      ? outputFiles(path)
      : entry.isFile()
        ? [path]
        : []
  })
}

function applicationBuildOutputRevision(rootDirectory: string) {
  const outputDirectories = [
    resolve(rootDirectory, '.output/public/assets'),
    resolve(rootDirectory, '.nitro/vite/services/ssr/assets'),
  ]
  const files = outputDirectories.flatMap(outputFiles).sort()
  if (files.length === 0) {
    throw new Error('Application build assets are unavailable for PWA caching.')
  }

  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.slice(rootDirectory.length))
    hash.update(readFileSync(file))
  }
  return hash.digest('hex').slice(0, 20)
}

const ssrDocumentPaths = [
  '/',
  '/invoice',
  '/invoice/',
  '/business-profile',
  '/business-profile/',
]
function preparePwaWorker(options: ResolvedVitePWAOptions) {
  copyServerRenderedStyles()
  const revision = applicationBuildOutputRevision(process.cwd())
  const generatedEntries = (
    options.workbox.additionalManifestEntries ?? []
  ).filter(
    (entry) =>
      !ssrDocumentPaths.includes(typeof entry === 'string' ? entry : entry.url),
  )
  options.workbox.additionalManifestEntries = [
    ...generatedEntries,
    ...ssrDocumentPaths.map((url) => ({ url, revision })),
  ]
}

function copyServerRenderedStyles() {
  const serverAssetsDirectory = resolve(
    process.cwd(),
    '.nitro/vite/services/ssr/assets',
  )
  if (!existsSync(serverAssetsDirectory)) return

  const publicAssetsDirectory = resolve(process.cwd(), '.output/public/assets')
  mkdirSync(publicAssetsDirectory, { recursive: true })
  for (const filename of readdirSync(serverAssetsDirectory)) {
    if (!filename.endsWith('.css')) continue
    copyFileSync(
      resolve(serverAssetsDirectory, filename),
      resolve(publicAssetsDirectory, filename),
    )
  }
}

const config = defineConfig({
  envPrefix: ['VITE_', 'PUBLIC_'],
  resolve: { tsconfigPaths: true },
  plugins: [
    releaseDataValidation(),
    VitePWA({
      strategies: 'generateSW',
      outDir: '.output/public',
      registerType: 'prompt',
      injectRegister: false,
      scope: '/',
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['favicon.svg'],
      includeManifestIcons: true,
      manifest: {
        name: 'regningen',
        short_name: 'regningen',
        description: 'Rechnungen erstellen und als PDF herunterladen.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ec003f',
      },
      pwaAssets: {
        config: './pwa-assets.config.ts',
        overrideManifestIcons: true,
        includeHtmlHeadLinks: true,
        injectThemeColor: false,
        integration: {
          publicDir: resolve(process.cwd(), 'public'),
          outDir: resolve(process.cwd(), '.output/public'),
        },
      },
      integration: {
        beforeBuildServiceWorker: preparePwaWorker,
      },
      workbox: {
        navigateFallback: null,
        globPatterns: [
          '**/*.{js,mjs,css,html,ico,png,svg,webp,woff,woff2,ttf,eot}',
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
    devtools(),
    nitro({
      buildDir: resolve(process.cwd(), '.nitro'),
      rollupConfig: { external: [/^@sentry\//] },
      routeRules: {
        '/sw.js': {
          headers: { 'cache-control': 'no-cache, no-store, must-revalidate' },
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
