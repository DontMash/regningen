import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { ReleaseNotesProvider } from '@/features/release-notes/ReleaseNotesProvider'
import { PwaProvider } from '@/features/pwa/PwaProvider'
import { Toaster } from '@/components/ui/toast'
import SettingsGuards from '@/features/settings/SettingsGuards'
import ApplicationResetListener from '@/features/settings/ApplicationResetListener'
import StoreDevtools from '../lib/theme-store-devtools'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'
import { pwaAssetsHead } from 'virtual:pwa-assets/head'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

// Keep this pre-hydration bootstrap aligned with the shared theme runtime.
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.setAttribute('data-theme',resolved);root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'regningen',
      },
      {
        name: 'theme-color',
        content: '#ec003f',
      },
      {
        name: 'application-name',
        content: 'regningen',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'regningen',
      },
    ],
    links: [
      {
        rel: 'manifest',
        href: '/manifest.webmanifest',
      },
      ...pwaAssetsHead.links,
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-12">
      <h1 className="heading-1">Seite nicht gefunden</h1>
      <Link
        to="/"
        className="paragraph text-primary underline underline-offset-4"
      >
        Zur Startseite
      </Link>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="relative min-h-screen antialiased">
        <PwaProvider>
          <ReleaseNotesProvider>
            <ApplicationResetListener />
            <SettingsGuards />
            <Header />
            <main id="hauptinhalt" tabIndex={-1} className="min-h-screen">
              {children}
            </main>
            <Footer />
            <Toaster />
            <TanStackDevtools
              config={{
                position: 'bottom-right',
              }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
                StoreDevtools,
                TanStackQueryDevtools,
              ]}
            />
            <Scripts />
          </ReleaseNotesProvider>
        </PwaProvider>
      </body>
    </html>
  )
}
