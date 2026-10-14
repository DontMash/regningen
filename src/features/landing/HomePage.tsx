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
import { businessProfileSchema } from '@/features/invoicing/business-profile'

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
                Studio Beispiel
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Beispielweg 8<br />
                12345 Musterstadt
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
              <p className="text-xs text-muted-foreground">Empfänger</p>
              <p>Musterprojekt e. V.</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Musterweg 3<br />
                12345 Musterstadt
              </p>
            </div>
            <div className="flex flex-col gap-2 min-[400px]:items-end">
              <p className="font-serif text-2xl font-semibold">Rechnung</p>
              <dl className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Nummer</dt>
                  <dd className="font-mono">B-2026-01</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Datum</dt>
                  <dd className="font-mono">12.06.2026</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4 text-xs text-muted-foreground">
              <p>Beschreibung</p>
              <p>Bruttobetrag</p>
            </div>
            <Separator />
            <dl className="flex flex-col gap-4">
              <div className="flex justify-between gap-4">
                <dt>Gestaltung eines Flyers</dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  595,00 €
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Druckvorbereitung</dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  119,00 €
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-col gap-4">
            <Separator />
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Nettosumme</dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  600,00 €
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Umsatzsteuer 19 %</dt>
                <dd className="shrink-0 font-mono text-xs tabular-nums">
                  114,00 €
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 bg-muted px-3 py-4">
                <dt className="font-medium">Gesamtbetrag</dt>
                <dd className="shrink-0 font-mono text-lg font-semibold tabular-nums">
                  714,00 €
                </dd>
              </div>
            </dl>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Vielen Dank für die Zusammenarbeit.
          </p>
        </div>
      </div>
      <figcaption
        id="landing-invoice-caption"
        className="text-center text-xs leading-relaxed text-muted-foreground"
      >
        Illustrative Rechnung mit fiktiven Beispieldaten
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
      const result = await profileQuery.refetch()
      if (!result.isSuccess) return
      const complete =
        result.data !== null &&
        businessProfileSchema.safeParse(result.data).success
      await navigate({ to: complete ? '/invoice' : '/settings/profile' })
    } finally {
      setIsEntering(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="grid min-w-0 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <div className="flex min-w-0 max-w-xl flex-col items-start gap-7">
          <h1 className="font-serif text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Rechnungen erstellen. Direkt im Browser.
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            Mit regningen erstellst du Rechnungen und lädst sie als PDF
            herunter. Ohne Benutzerkonto.
          </p>
          <div className="flex flex-col items-start gap-3">
            <Button
              size="lg"
              disabled={isEntering}
              onClick={() => void enterApplication()}
            >
              Rechnung erstellen
            </Button>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Dein Profil und deine Rechnung werden lokal in deinem Browser
              verarbeitet.
            </p>
            <p role="status" className="text-sm text-muted-foreground">
              {isEntering ? 'Unternehmensprofil wird geprüft …' : null}
            </p>
          </div>
          {profileQuery.isError && (
            <Alert
              variant="destructive"
              aria-labelledby="landing-entry-error-title"
            >
              <AlertTitle id="landing-entry-error-title">
                Unternehmensprofil nicht verfügbar
              </AlertTitle>
              <AlertDescription>
                <p>
                  Das Unternehmensprofil konnte nicht aus diesem Browser geladen
                  werden. Prüfe die Speichereinstellungen deines Browsers und
                  versuche es erneut. Erst nach erfolgreichem Laden kannst du
                  eine Rechnung starten.
                </p>
                <Button
                  variant="outline"
                  disabled={isEntering}
                  onClick={() => void enterApplication()}
                >
                  Erneut versuchen
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
            Unternehmensprofil wiederverwenden
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Hinterlege einmal die Angaben zu deinem Unternehmen: Name,
            Anschrift, Kontakt, Steuer- und Zahlungsdaten. Das gespeicherte
            Profil wird für deine Rechnungen wiederverwendet.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Dein Unternehmensprofil bleibt in diesem Browser. Es ist kein
            Online-Konto und wird nicht zwischen Geräten synchronisiert.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5 border-l-2 border-primary pl-6 sm:pl-8">
          <p className="font-serif text-2xl font-semibold">Studio Beispiel</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-4 text-sm">
            <dt className="text-muted-foreground">Anschrift</dt>
            <dd>
              Beispielweg 8<br />
              12345 Musterstadt
            </dd>
            <dt className="text-muted-foreground">Kontakt</dt>
            <dd className="wrap-anywhere">post@studio.example</dd>
            <dt className="text-muted-foreground">Zahlung</dt>
            <dd>Deine Bankverbindung</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            Beispiel für ein wiederverwendbares Profil
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
            Positionen und Summen erfassen
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Erfasse den Empfänger und bis zu 16 Rechnungspositionen mit
            Beschreibung. Du gibst positive Bruttobeträge in Euro ein;
            Nettosumme, Umsatzsteuer und Bruttosumme werden automatisch
            berechnet.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Für die gesamte Rechnung wählst du einen Umsatzsteuersatz: 7 % oder
            19 %. Mengen, Stückpreise und gemischte Steuersätze sind nicht
            vorgesehen.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5 bg-muted p-5 sm:p-8 lg:order-first">
          <p className="text-sm text-muted-foreground">
            Eine Position, ein Bruttobetrag
          </p>
          <dl className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-between gap-3">
              <dt>Gestaltung eines Flyers</dt>
              <dd className="font-mono text-sm tabular-nums">595,00 €</dd>
            </div>
          </dl>
          <Separator />
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Netto</dt>
              <dd className="shrink-0 font-mono tabular-nums">500,00 €</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Umsatzsteuer 19 %</dt>
              <dd className="shrink-0 font-mono tabular-nums">95,00 €</dd>
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
            PDF direkt herunterladen
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Aus deinen Angaben entsteht die Rechnung als PDF. Sie wird lokal im
            Browser erstellt und direkt auf dein Gerät heruntergeladen.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Das PDF umfasst derzeit eine A4-Seite mit begrenztem Platz. Halte
            Beschreibungen und Angaben so kurz, dass sie auf die Seite passen.
          </p>
        </div>
        <div className="flex min-w-0 items-center justify-center gap-6 sm:gap-10">
          <div
            aria-hidden="true"
            className="flex aspect-[210/297] w-32 shrink-0 flex-col items-center justify-center gap-4 border bg-card text-card-foreground shadow-sm sm:w-40"
          >
            <IconFileTypePdf className="size-10 text-muted-foreground" />
            <p className="font-serif text-lg">Rechnung</p>
          </div>
          <dl className="flex min-w-0 flex-col gap-5 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Datei</dt>
              <dd className="wrap-anywhere">rechnung-beispiel.pdf</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Format</dt>
              <dd>A4, eine Seite</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Ausgabe</dt>
              <dd>Auf deinem Gerät</dd>
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
            Entwurf während der Sitzung behalten
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Deine Eingaben bleiben für die Sitzung des aktuellen Tabs erhalten,
            auch nach dem Neuladen. So kannst du an deinem Rechnungsentwurf
            weiterarbeiten.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Das ist ein temporärer Entwurf, kein Archiv ausgestellter
            Rechnungen. Er wird nicht synchronisiert und ist keine dauerhafte
            Sicherung. Bewahre heruntergeladene PDFs selbst auf.
          </p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-lg border lg:order-first">
          <div className="flex items-center gap-2 bg-muted px-5 py-3 text-sm">
            <IconReceipt aria-hidden="true" className="size-4" />
            <p>Dein aktueller Tab</p>
          </div>
          <Separator />
          <div className="flex flex-col gap-5 p-5 sm:p-8">
            <p className="font-serif text-xl font-semibold">Rechnungsentwurf</p>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">Empfänger</dt>
                <dd>Musterprojekt e. V.</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">Position</dt>
                <dd>Gestaltung eines Flyers</dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Beispiel für einen Arbeitsstand, nicht für eine Rechnungshistorie
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
            Unternehmensprofil sichern
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Exportiere das zuletzt gespeicherte Unternehmensprofil als
            JSON-Datei. Damit kannst du es sichern oder in einen anderen Browser
            übertragen. Speichere das Profil nach dem Import im geöffneten
            Formular.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Die Datei ist unverschlüsselt und enthält sensible Unternehmens-,
            Kontakt-, Steuer- und Zahlungsdaten. Bewahre sie entsprechend sicher
            auf.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Die Sicherung enthält keine ungespeicherten Änderungen und keine
            Entwürfe, PDFs oder Einstellungen.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            In der Profilsicherung
          </p>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            <li className="bg-muted px-4 py-3">Unternehmen</li>
            <li className="bg-muted px-4 py-3">Kontakt</li>
            <li className="bg-muted px-4 py-3">Steuerdaten</li>
            <li className="bg-muted px-4 py-3">Zahlungsdaten</li>
          </ul>
          <Separator />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Gespeichertes Profil exportieren. Datei im anderen Browser
            importieren. Übernommene Angaben prüfen und speichern.
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
            Installieren und offline nutzen
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Nach der ersten Online-Vorbereitung kannst du Rechnungen auch
            offline erstellen und als PDF herunterladen. Öffne regningen
            zunächst online und warte auf die Meldung „Offline bereit“.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Die Installation ist optional und hängt von deinem Browser ab. Auch
            ohne Installation kannst du regningen im Browser verwenden. Die
            Offline-Vorbereitung ist keine Garantie für dauerhafte
            Verfügbarkeit: Der Browser kann lokale Daten wieder entfernen.
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-6 lg:order-first">
          <IconDeviceLaptop
            aria-hidden="true"
            className="size-16 text-muted-foreground"
          />
          <ol className="flex flex-col gap-5 border-l border-border pl-6 text-sm leading-relaxed">
            <li>regningen einmal online öffnen.</li>
            <li>Warten, bis die Offline-Vorbereitung abgeschlossen ist.</li>
            <li>
              Im vorbereiteten Browser auch ohne Verbindung weiterarbeiten.
            </li>
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
          Deine nächste Rechnung beginnt hier.
        </h2>
        <p className="max-w-xl leading-relaxed text-muted-foreground">
          Starte mit deinem Unternehmensprofil. Ist es schon vollständig
          gespeichert, geht es direkt zur Rechnung.
        </p>
        <Button
          size="lg"
          disabled={isEntering}
          onClick={() => void enterApplication()}
        >
          Rechnung erstellen
        </Button>
      </section>
    </div>
  )
}
