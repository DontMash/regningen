import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isThemeMode,
  normalizeThemeMode,
} from './theme-policy'

function themeEnvironment(stored: string | null, prefersDark: boolean) {
  const attributes = new Map<string, string>()
  const root = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: { colorScheme: '' },
  }
  const environment = {
    window: {
      localStorage: {
        getItem(key: string) {
          expect(key).toBe('theme')
          return stored
        },
      },
      matchMedia(query: string) {
        expect(query).toBe('(prefers-color-scheme: dark)')
        return { matches: prefersDark }
      },
    },
    document: { documentElement: root },
  }
  return { environment, attributes, root }
}

describe('theme policy', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['auto', 'auto'],
    ['sepia', 'auto'],
    ['', 'auto'],
    [null, 'auto'],
    [undefined, 'auto'],
    [false, 'auto'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeThemeMode(value)).toBe(expected)
    expect(isThemeMode(value)).toBe(
      value === 'light' || value === 'dark' || value === 'auto',
    )
  })

  it('retains the persisted preference key', () => {
    expect(THEME_STORAGE_KEY).toBe('theme')
  })

  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['auto', false, 'light'],
    ['auto', true, 'dark'],
    ['invalid', false, 'light'],
    ['invalid', true, 'dark'],
    [null, false, 'light'],
    [null, true, 'dark'],
  ])('bootstraps %s with system dark=%s as %s', (stored, dark, expected) => {
    const { environment, attributes, root } = themeEnvironment(stored, dark)

    // A new realm deliberately supplies no imported policy helpers.
    runInNewContext(THEME_INIT_SCRIPT, environment)

    expect(attributes.get('data-theme')).toBe(expected)
    expect(root.style.colorScheme).toBe(expected)
  })

  it.each([false, true])(
    'uses system dark=%s on first paint when storage access is denied',
    (dark) => {
      const { environment, attributes, root } = themeEnvironment(null, dark)
      Object.defineProperty(environment.window, 'localStorage', {
        get() {
          throw new DOMException('Denied', 'SecurityError')
        },
      })

      runInNewContext(THEME_INIT_SCRIPT, environment)

      expect(attributes.get('data-theme')).toBe(dark ? 'dark' : 'light')
      expect(root.style.colorScheme).toBe(dark ? 'dark' : 'light')
    },
  )

  it('keeps startup available when the system-preference API fails', () => {
    const { environment, attributes } = themeEnvironment('dark', false)
    environment.window.matchMedia = () => {
      throw new Error('System preference unavailable')
    }

    expect(() => runInNewContext(THEME_INIT_SCRIPT, environment)).not.toThrow()
    expect(attributes.size).toBe(0)
  })

  it('keeps the generated bootstrap self-contained after production minification', async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: true,
        lib: {
          entry: fileURLToPath(new URL('./theme-policy.ts', import.meta.url)),
          formats: ['iife'],
          name: 'ThemePolicy',
        },
      },
    })
    const bundle = Array.isArray(output) ? output[0] : output
    if (!('output' in bundle)) {
      throw new Error('Expected a theme policy bundle')
    }
    const chunk = bundle.output.find((entry) => entry.type === 'chunk')
    if (!chunk) throw new Error('Missing theme policy bundle')

    // Evaluating the module needs no browser globals (SSR); executing its
    // generated script in another realm must need no module bindings either.
    const script: unknown = runInNewContext(
      `${chunk.code};ThemePolicy.THEME_INIT_SCRIPT`,
    )
    expect(typeof script).toBe('string')
    if (typeof script !== 'string') throw new Error('Missing bootstrap script')
    const { environment, attributes, root } = themeEnvironment('dark', false)
    runInNewContext(script, environment)
    expect(attributes.get('data-theme')).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
  })
})
