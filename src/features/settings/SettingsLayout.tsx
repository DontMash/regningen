import * as m from '@/paraglide/messages'
import { Link, Outlet } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'

export default function SettingsLayout() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:py-14">
      <h1 className="heading-1">{m.settings_title()}</h1>
      <div className="grid min-w-0 gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
        <aside>
          <nav
            aria-label={m.settings_title()}
            className="sticky top-6 flex flex-wrap gap-2 md:flex-col"
          >
            <Link
              to="/settings"
              activeOptions={{ exact: true }}
              activeProps={{
                'aria-current': 'page',
                className: buttonVariants({ variant: 'secondary' }),
              }}
              inactiveProps={{
                className: buttonVariants({ variant: 'ghost' }),
              }}
              className="justify-start"
            >
              {m.settings_general()}
            </Link>
            <Link
              to="/settings/profile"
              activeProps={{
                'aria-current': 'page',
                className: buttonVariants({ variant: 'secondary' }),
              }}
              inactiveProps={{
                className: buttonVariants({ variant: 'ghost' }),
              }}
              className="justify-start"
            >
              {m.settings_profile()}
            </Link>
            <Link
              to="/settings/licenses"
              activeProps={{
                'aria-current': 'page',
                className: buttonVariants({ variant: 'secondary' }),
              }}
              inactiveProps={{
                className: buttonVariants({ variant: 'ghost' }),
              }}
              className="h-auto min-h-9 min-w-0 justify-start text-left whitespace-normal"
            >
              {m.licenses_title()}
            </Link>
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
