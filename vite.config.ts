import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { validateReleaseData } from './src/lib/release-data-validation.ts'
import { devtools } from '@tanstack/devtools-vite'

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

const config = defineConfig({
  envPrefix: ['VITE_', 'PUBLIC_'],
  resolve: { tsconfigPaths: true },
  plugins: [
    releaseDataValidation(),
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default config
