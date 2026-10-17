import type { CompilerOptions } from '@inlang/paraglide-js'

/** The public page contract also drives production offline preparation. */
export const localizedPages = [
  { internal: '/', de: '/de', en: '/en' },
  { internal: '/invoice', de: '/de/rechnung', en: '/en/invoice' },
  { internal: '/settings', de: '/de/einstellungen', en: '/en/settings' },
  {
    internal: '/settings/profile',
    de: '/de/einstellungen/profil',
    en: '/en/settings/profile',
  },
] as const

export const paraglideOptions = {
  project: './project.inlang',
  outdir: './src/paraglide',
  outputStructure: 'message-modules',
  emitTsDeclarations: true,
  trailingSlash: 'never',
  cookieName: 'regningen.locale',
  cookieSameSite: 'lax',
  cookieSecure: 'auto',
  routeStrategies: [
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/sw.js',
    '/manifest.webmanifest',
    '/manifest-:locale.webmanifest',
    '/assets/:path(.*)?',
    '/_serverFn/:path(.*)?',
    '/favicon.svg',
    '/social-preview:variant(.*).png',
  ].map((match) => ({ match, exclude: true })),
  strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
  urlPatterns: [
    ...localizedPages.map((page) => ({
      pattern: page.internal,
      localized: [
        ['de', page.de],
        ['en', page.en],
      ] as Array<['de' | 'en', string]>,
    })),
    {
      pattern: '/:path(.*)?',
      localized: [
        ['de', '/de/:path(.*)?'],
        ['en', '/en/:path(.*)?'],
      ],
    },
  ],
} satisfies CompilerOptions
