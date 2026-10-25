import { useEffect } from 'react'
import { baseLocale, cookieName, getLocale, locales } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'
import { initializeInvoiceLanguagePreference } from '@/lib/invoice-language'
import { THEME_INIT_SCRIPT } from '@/lib/theme-policy'
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { CSPProvider } from '@base-ui/react/csp-provider'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { ReleaseNotesComposition as ReleaseNotesProvider } from '@/features/release-notes/ReleaseNotesComposition'
import { PwaProvider } from '@/features/pwa/PwaProvider'
import { Toaster } from '@/components/ui/toast'
import SettingsGuards from '@/features/settings/SettingsGuards'
import ApplicationResetListener from '@/features/settings/ApplicationResetListener'
import StoreDevtools from '../lib/theme-store-devtools'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'
import { pwaAssetsHead } from 'virtual:pwa-assets/head'

import type { QueryClient } from '@tanstack/react-query'
import type { DeploymentContext } from '@/lib/deployment-policy'
import { requireDeploymentPolicy } from '@/lib/deployment-policy'

interface MyRouterContext extends DeploymentContext {
  queryClient: QueryClient
}

// The worker's cached unprefixed entry cannot negotiate a cookie on the server.
// Canonicalize cached slash variants before parsing content; only '/' needs
// language negotiation. Explicit locale URLs retain their chosen language.
const LANGUAGE_ENTRY_SCRIPT = `(function(){var path=location.pathname;while(path.length>1&&path.endsWith('/'))path=path.slice(0,-1);if(path!==location.pathname){location.replace(path+location.search+location.hash);return}if(path!=='/')return;var supported=${JSON.stringify(locales)},fallback=${JSON.stringify(baseLocale)},name=${JSON.stringify(cookieName)}+'=';var saved=document.cookie.split(';').map(function(v){return v.trim()}).find(function(v){return v.indexOf(name)===0});var locale=saved?saved.slice(name.length):'';if(supported.indexOf(locale)<0){locale=(navigator.languages||[navigator.language]).map(function(v){return v.toLowerCase().split('-')[0]}).find(function(v){return supported.indexOf(v)>=0})||fallback}location.replace('/'+locale+location.search+location.hash)})();`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: ({ serverContext, context }) => ({
    // SSR uses request middleware; hydrated and offline navigation use the
    // serialized policy. Missing hydration/middleware is a contract error.
    visibilityPolicy: requireDeploymentPolicy(serverContext ?? context),
  }),
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
        title: m.common_unavailable_title(),
      },
      {
        name: 'robots',
        content: 'noindex, follow',
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
        href: `/manifest-${getLocale()}.webmanifest`,
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
  notFoundComponent: () => <UnavailablePage title={m.common_not_found()} />,
  errorComponent: () => <UnavailablePage title={m.common_unavailable()} />,
})

function UnavailablePage({ title }: { title: string }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-12">
      <h1 className="heading-1">{title}</h1>
      <Link
        to="/"
        className="paragraph text-primary underline underline-offset-4"
      >
        {m.common_home()}
      </Link>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const nonce = useRouter().options.ssr?.nonce
  useEffect(initializeInvoiceLanguagePreference, [])
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: LANGUAGE_ENTRY_SCRIPT }}
        />
        {/* This executes from SSR HTML only. Function serialization can differ
            between Vite's server/client transforms (for example, an inserted
            semicolon); hydration must retain the already-executed server text. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <HeadContent />
      </head>
      <body className="relative min-h-screen antialiased">
        <CSPProvider nonce={nonce}>
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
        </CSPProvider>
      </body>
    </html>
  )
}
