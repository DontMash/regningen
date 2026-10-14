import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import type { RouteComponent } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { Toaster } from '@/components/ui/toast'

type TestPath = '/' | '/settings/profile' | '/settings' | '/invoice'

const disposeHistories: Array<() => void> = []

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function destinationPage(title: string) {
  return function DestinationPage() {
    return <h1>{title}</h1>
  }
}

export async function renderAtRoute(path: TestPath, page: RouteComponent) {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster />
      </QueryClientProvider>
    ),
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: path === '/' ? page : destinationPage('Startseite geöffnet'),
  })
  const profileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings/profile',
    component:
      path === '/settings/profile'
        ? page
        : destinationPage('Profilseite geöffnet'),
  })
  const invoiceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/invoice',
    component:
      path === '/invoice' ? page : destinationPage('Rechnungsseite geöffnet'),
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component:
      path === '/settings'
        ? page
        : destinationPage('Allgemeine Einstellungen geöffnet'),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      profileRoute,
      settingsRoute,
      invoiceRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  disposeHistories.push(() => router.history.destroy())

  await router.load()
  return render(<RouterProvider router={router} />)
}

export function disposeTestRouters() {
  disposeHistories.splice(0).forEach((dispose) => dispose())
}
