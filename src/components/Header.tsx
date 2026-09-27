import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="border-b bg-background">
      <nav
        aria-label="Hauptnavigation"
        className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4"
      >
        <Link
          to="/"
          className="font-serif text-lg font-semibold text-foreground no-underline"
        >
          regningen
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/invoice"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Rechnung
          </Link>
          <Link
            to="/business-profile"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Unternehmensprofil
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
