import type { PageVisibility } from '@/lib/visibility'

export const landingVisibility: PageVisibility = {
  canonicalPath: '/',
  title: 'regningen – Rechnungen erstellen und als PDF herunterladen',
  description:
    'Rechnungen erstellen und als PDF herunterladen. Direkt im Browser, ohne Benutzerkonto.',
  translationGroup: 'introduction',
  fallback: true,
  agentTitle: 'Startseite',
  agentSummary:
    'Features, local storage, PDF export, and offline-use requirements.',
  structuredData: {
    features: [
      'Unternehmensprofil in diesem Browser wiederverwenden',
      'Bis zu 16 Positionen mit positiven Bruttobeträgen in Euro; ein Umsatzsteuersatz von 7 % oder 19 % pro Rechnung',
      'PDF im Browser erstellen und herunterladen; eine A4-Seite mit begrenztem Platz',
      'Temporären Rechnungsentwurf für die Sitzung in diesem Tab behalten; kein Rechnungsarchiv',
      'Gespeichertes Unternehmensprofil als unverschlüsselte JSON-Datei exportieren und importieren; nach Import speichern',
      'Optional installieren und nach erster Online-Vorbereitung und „Offline bereit“ offline nutzen',
    ],
  },
}
