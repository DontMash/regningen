import { useId, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import projectLicense from '../../../LICENSE?raw'
import * as m from '@/paraglide/messages'

export default function LicensesSettingsPage() {
  const disclosureId = useId()
  // A native summary can be activated before hydration, for example after a
  // language change. Adopt its live state rather than undoing that interaction.
  const [licenseOpen, setLicenseOpen] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.getElementById(disclosureId)?.hasAttribute('open') === true,
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h2 className="font-serif text-2xl font-semibold">
        {m.licenses_title()}
      </h2>
      <p className="paragraph text-muted-foreground">
        {m.licenses_description()}
      </p>
      <section
        aria-labelledby="project-license"
        className="flex min-w-0 flex-col gap-4"
      >
        <h3 id="project-license" className="font-serif text-xl font-semibold">
          {m.licenses_project()}
        </h3>
        <p className="paragraph">{m.licenses_project_scope()}</p>
        <p className="paragraph">{m.licenses_data_scope()}</p>
        <p className="paragraph">
          <a
            href="https://github.com/DontMash/regningen"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
          >
            {m.licenses_source()}
          </a>
        </p>
        <Card>
          <CardHeader>
            <CardTitle>AGPL-3.0-only</CardTitle>
            <CardDescription>Copyright (C) 2026 soren.codes</CardDescription>
          </CardHeader>
          <CardContent>
            <details
              id={disclosureId}
              open={licenseOpen}
              onToggle={(event) => setLicenseOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                {m.licenses_project_text()}
              </summary>
              <pre className="mt-4 font-mono text-sm whitespace-pre-wrap wrap-anywhere">
                {projectLicense}
              </pre>
            </details>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
