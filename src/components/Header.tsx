import { Link } from '@tanstack/react-router'
import { IconFile, IconSettings } from '@tabler/icons-react'
import {
  useBusinessProfile,
  useProfileStorageSync,
} from '@/features/invoicing/business-profile-query'
import ThemeToggle from './ThemeToggle'
import { buttonVariants } from './ui/button'

export default function Header() {
  const { data: profile } = useBusinessProfile()
  useProfileStorageSync()
  const businessName = profile?.businessName.trim()

  return (
    <header id="top" className="border-b bg-background">
      <nav
        aria-label="Hauptnavigation"
        className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="wordmark shrink-0 text-foreground no-underline"
          >
            regningen
          </Link>
          {businessName && (
            <span
              className="paragraph-small max-w-24 truncate text-muted-foreground sm:max-w-48"
              title={businessName}
            >
              {businessName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/invoice" className={buttonVariants()}>
            <IconFile data-icon="inline-start" />
            Rechnung
          </Link>
          <Link
            to="/settings"
            aria-label="Einstellungen"
            title="Einstellungen"
            className={buttonVariants({ variant: 'outline', size: 'icon' })}
          >
            <IconSettings aria-hidden="true" />
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
