import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from 'cn'
import generatedNotices from '@/generated/notices.json'
import type { NoticeData } from '@/lib/notices/data'
import * as m from '@/paraglide/messages'

const notices = generatedNotices as NoticeData

export default function LicensesSettingsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h2 className="font-serif text-2xl font-semibold">
        {m.licenses_title()}
      </h2>
      <p className="paragraph text-muted-foreground">
        {m.licenses_description()}
      </p>
      <a
        href="/third-party-notices.txt"
        download
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'h-auto min-h-9 max-w-full self-start text-left whitespace-normal',
        )}
      >
        {m.licenses_download()}
      </a>
      <section
        aria-labelledby="project-license"
        className="flex min-w-0 flex-col gap-4"
      >
        <h3 id="project-license" className="font-serif text-xl font-semibold">
          {m.licenses_project()}
        </h3>
        <p className="paragraph">{m.licenses_project_scope()}</p>
        <p className="paragraph">{m.licenses_data_scope()}</p>
        <Card>
          <CardHeader>
            <CardTitle>
              <h4 className="wrap-anywhere">
                {notices.project.name} {notices.project.version}
              </h4>
            </CardTitle>
            <CardDescription>{notices.project.license}</CardDescription>
          </CardHeader>
          <CardContent>
            <p>{notices.project.copyright}</p>
            <details>
              <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                {m.licenses_project_text()}
              </summary>
              <pre className="mt-4 font-mono text-sm whitespace-pre-wrap wrap-anywhere">
                {notices.project.text}
              </pre>
            </details>
          </CardContent>
        </Card>
      </section>
      <section
        aria-labelledby="third-party-notices"
        className="flex min-w-0 flex-col gap-4"
      >
        <h3
          id="third-party-notices"
          className="font-serif text-xl font-semibold"
        >
          {m.licenses_third_party()}
        </h3>
        <p className="paragraph text-muted-foreground">
          {m.licenses_third_party_description()}
        </p>
        {notices.entries.map((entry) => (
          <article key={entry.id} aria-labelledby={`notice-${entry.id}`}>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h4 id={`notice-${entry.id}`} className="wrap-anywhere">
                    {entry.name} {entry.version}
                  </h4>
                </CardTitle>
                <CardDescription className="wrap-anywhere">
                  {entry.license}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {entry.kind === 'font' && (
                  <p className="font-medium text-muted-foreground">
                    {m.licenses_font()}
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    {m.licenses_full_text()}
                  </summary>
                  <div className="mt-4 flex min-w-0 flex-col gap-4">
                    {entry.texts.map((text, index) => (
                      <div key={`${text.file}-${index}`} className="min-w-0">
                        <h5 className="mb-2 font-medium wrap-anywhere">
                          {text.file}
                        </h5>
                        <pre className="font-mono text-sm whitespace-pre-wrap wrap-anywhere">
                          {text.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              </CardContent>
            </Card>
          </article>
        ))}
      </section>
    </div>
  )
}
