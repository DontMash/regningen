import { IconArrowUp, IconHeartFilled } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useReleaseNotes } from '@/features/release-notes/ReleaseNotesProvider'

export default function Footer() {
  const { applicationVersion, openReleaseNotes } = useReleaseNotes()
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-80 flex-col gap-3">
            <Link
              to="/"
              className="inline-flex w-fit items-center gap-3 text-foreground no-underline"
            >
              <img src="/favicon.svg" alt="" className="size-8" />
              <span className="wordmark">regningen</span>
            </Link>
            <p className="paragraph-small text-muted-foreground">
              Rechnungen erstellen und als PDF herunterladen. Direkt im Browser.
            </p>
          </div>

          <nav aria-label="Funktionsnavigation">
            <ul className="flex flex-col gap-2 text-right">
              <li>
                <Link
                  to="/invoice"
                  className="paragraph-small text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Rechnung
                </Link>
              </li>
              <li>
                <Link
                  to="/business-profile"
                  className="paragraph-small text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Profile
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <Separator aria-hidden="true" className="mt-8" />
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="paragraph-small flex flex-wrap items-center gap-1 text-muted-foreground">
              Made with{' '}
              <IconHeartFilled
                aria-hidden="true"
                className="size-4 text-primary"
              />
              <span className="sr-only">love </span>
              by{' '}
              <a
                href="https://www.soren.codes/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
              >
                soren
              </a>
            </p>
            <button
              type="button"
              aria-label={`Versionshinweise zu Version v${applicationVersion} anzeigen`}
              onClick={openReleaseNotes}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'text-muted-foreground',
              )}
            >
              v{applicationVersion}
            </button>
          </div>
          <a
            href="#top"
            aria-label="Nach oben"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'icon-lg' }),
              'rounded-full',
            )}
          >
            <IconArrowUp aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  )
}
