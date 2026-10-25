import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  IconDeviceLaptop,
  IconFileTypePdf,
  IconReceipt,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useBusinessProfile } from '@/features/invoicing/business-profile-query'
import * as m from '@/paraglide/messages'
import { formatDate, formatEuro } from '@/lib/i18n'

function IllustrativeInvoice() {
  return (
    <figure
      aria-labelledby="landing-invoice-caption"
      className="mx-auto flex w-full max-w-lg min-w-0 flex-col gap-4"
    >
      <div className="rounded-xl bg-muted p-4 sm:p-7">
        <div className="flex min-w-0 flex-col gap-7 border bg-card p-5 text-card-foreground shadow-sm sm:gap-9 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-serif text-xl font-semibold">
                {m.landing_sample_business()}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {m.landing_sample_street()}
                <br />
                {m.landing_sample_town()}
              </p>
            </div>
            <IconReceipt
              aria-hidden="true"
              className="size-8 shrink-0 text-primary"
            />
          </div>
          <Separator />
          <div className="grid grid-cols-1 gap-5 min-[400px]:grid-cols-2">
            <div className="flex flex-col gap-1 text-sm">
              <p className="text-xs text-muted-foreground">
                {m.landing_recipient()}
              </p>
              <p>{m.landing_sample_recipient()}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {m.landing_sample_recipient_street()}
                <br />
                {m.landing_sample_town()}
              </p>
            </div>
            <div className="flex flex-col gap-2 min-[400px]:items-end">
              <p className="font-serif text-2xl font-semibold">
                {m.landing_invoice()}
              </p>
              <dl className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {m.landing_number()}
                  </dt>
                  <dd className="font-mono">B-2026-01</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{m.landing_date()}</dt>
                  <dd className="font-mono">{formatDate('2026-06-12')}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4 text-xs text-muted-foreground">
              <p>{m.landing_description()}</p>
              <p>{m.landing_gross_amount()}</p>
            </div>
            <Separator />
            <dl className="flex flex-col gap-4">
              <div className="flex justify-between gap-4">
                <dt>{m.landing_sample_flyer()}</dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  {formatEuro(59500)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>{m.landing_sample_print()}</dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  {formatEuro(11900)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-col gap-4">
            <Separator />
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {m.landing_net_total()}
                </dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  {formatEuro(60000)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {m.landing_vat_rate({ rate: 19 })}
                </dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  {formatEuro(11400)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 bg-muted px-3 py-4">
                <dt className="font-medium">{m.landing_total()}</dt>
                <dd className="shrink-0 font-mono text-lg font-semibold tabular-nums">
                  {formatEuro(71400)}
                </dd>
              </div>
            </dl>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {m.landing_thank_you()}
          </p>
        </div>
      </div>
      <figcaption
        id="landing-invoice-caption"
        className="text-center text-xs leading-relaxed text-muted-foreground"
      >
        {m.landing_invoice_caption()}
      </figcaption>
    </figure>
  )
}

export default function HomePage() {
  const profileQuery = useBusinessProfile()
  const navigate = useNavigate()
  const [isEntering, setIsEntering] = useState(false)

  async function enterApplication() {
    setIsEntering(true)
    try {
      const destination = await profileQuery.entryDestination()
      if (destination) await navigate({ to: destination })
    } finally {
      setIsEntering(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="grid min-w-0 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <div className="flex min-w-0 max-w-xl flex-col items-start gap-7">
          <h1 className="font-serif text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {m.landing_headline()}
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            {m.landing_intro()}
          </p>
          <div className="flex flex-col items-start gap-3">
            <Button
              size="lg"
              disabled={isEntering}
              onClick={() => void enterApplication()}
            >
              {m.landing_create_invoice()}
            </Button>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {m.landing_local_processing()}
            </p>
            <p role="status" className="text-sm text-muted-foreground">
              {isEntering ? m.landing_checking_profile() : null}
            </p>
          </div>
          {profileQuery.isError && (
            <Alert
              variant="destructive"
              aria-labelledby="landing-entry-error-title"
            >
              <AlertTitle id="landing-entry-error-title">
                {m.landing_entry_error_title()}
              </AlertTitle>
              <AlertDescription>
                <p>
                  {profileQuery.failureKind === 'storage'
                    ? m.landing_entry_error_description()
                    : m.profile_error_unexpected()}
                </p>
                <Button
                  variant="outline"
                  disabled={isEntering}
                  onClick={() => void enterApplication()}
                >
                  {m.landing_retry()}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
        <IllustrativeInvoice />
      </div>

      <Separator />

      <section
        aria-labelledby="landing-profile"
        className="grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-2 lg:gap-24"
      >
        <div className="flex max-w-lg flex-col gap-5">
          <h2
            id="landing-profile"
            className="font-serif text-3xl leading-snug font-semibold"
          >
            {m.landing_profile_title()}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {m.landing_profile_description()}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_profile_local()}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5 border-l-2 border-primary pl-6 sm:pl-8">
          <p className="font-serif text-2xl font-semibold">
            {m.landing_sample_business()}
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-4 text-sm">
            <dt className="text-muted-foreground">{m.landing_address()}</dt>
            <dd>
              {m.landing_sample_street()}
              <br />
              {m.landing_sample_town()}
            </dd>
            <dt className="text-muted-foreground">{m.landing_contact()}</dt>
            <dd className="wrap-anywhere">{m.landing_sample_email()}</dd>
            <dt className="text-muted-foreground">{m.landing_payment()}</dt>
            <dd>{m.landing_sample_bank()}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            {m.landing_profile_caption()}
          </p>
        </div>
      </section>

      <Separator />

      <section
        aria-labelledby="landing-positions"
        className="grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-2 lg:gap-24"
      >
        <div className="flex max-w-lg flex-col gap-5">
          <h2
            id="landing-positions"
            className="font-serif text-3xl leading-snug font-semibold"
          >
            {m.landing_positions_title()}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {m.landing_positions_description({ limit: 16 })}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_positions_limits()}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5 bg-muted p-5 sm:p-8 lg:order-first">
          <p className="text-sm text-muted-foreground">
            {m.landing_position_caption()}
          </p>
          <dl className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-between gap-3">
              <dt>{m.landing_sample_flyer()}</dt>
              <dd className="font-mono text-sm tabular-nums">
                {formatEuro(59500)}
              </dd>
            </div>
          </dl>
          <Separator />
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{m.landing_net()}</dt>
              <dd className="shrink-0 font-mono tabular-nums">
                {formatEuro(50000)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                {m.landing_vat_rate({ rate: 19 })}
              </dt>
              <dd className="shrink-0 font-mono tabular-nums">
                {formatEuro(9500)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <Separator />

      <section
        aria-labelledby="landing-pdf"
        className="grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-2 lg:gap-24"
      >
        <div className="flex max-w-lg flex-col gap-5">
          <h2
            id="landing-pdf"
            className="font-serif text-3xl leading-snug font-semibold"
          >
            {m.landing_pdf_title()}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {m.landing_pdf_description()}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_pdf_limits()}
          </p>
        </div>
        <div className="flex min-w-0 items-center justify-center gap-6 sm:gap-10">
          <div
            aria-hidden="true"
            className="flex aspect-[210/297] w-32 shrink-0 flex-col items-center justify-center gap-4 border bg-card text-card-foreground shadow-sm sm:w-40"
          >
            <IconFileTypePdf className="size-10 text-muted-foreground" />
            <p className="font-serif text-lg">{m.landing_invoice()}</p>
          </div>
          <dl className="flex min-w-0 flex-col gap-5 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{m.landing_file()}</dt>
              <dd className="wrap-anywhere">{m.landing_sample_filename()}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{m.landing_format()}</dt>
              <dd>{m.landing_pdf_format()}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{m.landing_output()}</dt>
              <dd>{m.landing_on_device()}</dd>
            </div>
          </dl>
        </div>
      </section>

      <Separator />

      <section
        aria-labelledby="landing-draft"
        className="grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-2 lg:gap-24"
      >
        <div className="flex max-w-lg flex-col gap-5">
          <h2
            id="landing-draft"
            className="font-serif text-3xl leading-snug font-semibold"
          >
            {m.landing_draft_title()}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {m.landing_draft_description()}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_draft_limits()}
          </p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-lg border lg:order-first">
          <div className="flex items-center gap-2 bg-muted px-5 py-3 text-sm">
            <IconReceipt aria-hidden="true" className="size-4" />
            <p>{m.landing_current_tab()}</p>
          </div>
          <Separator />
          <div className="flex flex-col gap-5 p-5 sm:p-8">
            <p className="font-serif text-xl font-semibold">
              {m.landing_invoice_draft()}
            </p>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">
                  {m.landing_recipient()}
                </dt>
                <dd>{m.landing_sample_recipient()}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">
                  {m.landing_position()}
                </dt>
                <dd>{m.landing_sample_flyer()}</dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {m.landing_draft_caption()}
            </p>
          </div>
        </div>
      </section>

      <Separator />

      <section
        aria-labelledby="landing-backup"
        className="grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-2 lg:gap-24"
      >
        <div className="flex max-w-lg flex-col gap-5">
          <h2
            id="landing-backup"
            className="font-serif text-3xl leading-snug font-semibold"
          >
            {m.landing_backup_title()}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {m.landing_backup_description()}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_backup_security()}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_backup_limits()}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            {m.landing_backup_contents()}
          </p>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            <li className="bg-muted px-4 py-3">{m.landing_business()}</li>
            <li className="bg-muted px-4 py-3">{m.landing_contact()}</li>
            <li className="bg-muted px-4 py-3">{m.landing_tax_details()}</li>
            <li className="bg-muted px-4 py-3">
              {m.landing_payment_details()}
            </li>
          </ul>
          <Separator />
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_backup_steps()}
          </p>
        </div>
      </section>

      <Separator />

      <section
        aria-labelledby="landing-offline"
        className="grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-2 lg:gap-24"
      >
        <div className="flex max-w-lg flex-col gap-5">
          <h2
            id="landing-offline"
            className="font-serif text-3xl leading-snug font-semibold"
          >
            {m.landing_offline_title()}
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {m.landing_offline_description()}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.landing_offline_limits()}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-6 lg:order-first">
          <IconDeviceLaptop
            aria-hidden="true"
            className="size-16 text-muted-foreground"
          />
          <ol className="flex flex-col gap-5 border-l border-border pl-6 text-sm leading-relaxed">
            <li>{m.landing_offline_step_open()}</li>
            <li>{m.landing_offline_step_wait()}</li>
            <li>{m.landing_offline_step_work()}</li>
          </ol>
        </div>
      </section>

      <Separator />

      <section
        aria-labelledby="landing-start"
        className="flex flex-col items-start gap-6 py-16 sm:py-24"
      >
        <h2
          id="landing-start"
          className="max-w-2xl font-serif text-3xl leading-tight font-semibold sm:text-4xl"
        >
          {m.landing_start_title()}
        </h2>
        <p className="max-w-xl leading-relaxed text-muted-foreground">
          {m.landing_start_description()}
        </p>
        <Button
          size="lg"
          disabled={isEntering}
          onClick={() => void enterApplication()}
        >
          {m.landing_create_invoice()}
        </Button>
      </section>
    </div>
  )
}
