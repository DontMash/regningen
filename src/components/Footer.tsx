import { Fragment } from 'react'
import { IconArrowUp, IconCup, IconHeartFilled } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useReleaseNotes } from '@/features/release-notes/ReleaseNotesProvider'
import { useOptionalPwa } from '@/features/pwa/PwaProvider'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'

export default function Footer() {
  const { applicationVersion, openReleaseNotes } = useReleaseNotes()
  const pwa = useOptionalPwa()
  const english = getLocale() === 'en'
  // Keep rich placeholders inside one complete, reorderable translated message.
  const credit = m.shell_credit({ heart: '{heart}', author: '{author}' })
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
              {m.shell_description()}
            </p>
          </div>

          <nav aria-label={m.shell_footer_navigation()}>
            <ul className="flex flex-col gap-2 text-right">
              <li>
                <Link
                  to="/invoice"
                  className="paragraph-small text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {m.shell_invoice()}
                </Link>
              </li>
              <li>
                <a
                  href={
                    english
                      ? 'https://www.soren.codes/en/imprint'
                      : 'https://www.soren.codes/de/impressum'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="paragraph-small text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {m.shell_imprint()}
                </a>
              </li>
              <li>
                <a
                  href={
                    english
                      ? 'https://www.soren.codes/en/privacy'
                      : 'https://www.soren.codes/de/datenschutz'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="paragraph-small text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {m.shell_privacy()}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <Separator aria-hidden="true" className="mt-8" />
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="paragraph-small flex flex-wrap items-center gap-1 text-muted-foreground">
              {credit.split(/(\{heart\}|\{author\})/).map((part, index) => (
                <Fragment key={index}>
                  {part === '{heart}' ? (
                    <>
                      <IconHeartFilled
                        aria-hidden="true"
                        className="size-4 text-primary"
                      />
                      <span className="sr-only">{m.shell_love()}</span>
                    </>
                  ) : part === '{author}' ? (
                    <a
                      href="https://www.soren.codes/?utm_source=regningen&utm_medium=referral"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      soren
                    </a>
                  ) : (
                    part
                  )}
                </Fragment>
              ))}
            </p>
            <a
              href="https://kofi.soren.codes"
              target="_blank"
              rel="noopener noreferrer"
              className="paragraph-small inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
            >
              <IconCup aria-hidden="true" className="size-4 shrink-0" />
              {m.shell_support()}
            </a>
            {pwa?.offlineReady ? (
              <span
                className="paragraph-small text-muted-foreground"
                role="status"
              >
                {m.shell_offline_ready()}
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label={m.shell_release_notes({
                  version: applicationVersion,
                })}
                onClick={openReleaseNotes}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'text-muted-foreground',
                )}
              >
                v{applicationVersion}
              </button>
              {pwa?.updateAvailable ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={pwa.openUpdatePrompt}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'text-primary',
                  )}
                >
                  {m.shell_update_available()}
                </button>
              ) : null}
            </div>
          </div>
          <a
            href="#top"
            aria-label={m.shell_back_to_top()}
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
