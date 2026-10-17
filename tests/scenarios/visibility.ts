// Independently authored expectations, never imported from application declarations.
export const landingVisibilityExample = {
  path: '/de',
  language: 'de',
  title: 'regningen – Rechnungen erstellen und als PDF herunterladen',
  description:
    'Rechnungen erstellen und als PDF herunterladen. Direkt im Browser, ohne Benutzerkonto.',
}

export const englishLandingVisibilityExample = {
  path: '/en',
  language: 'en',
  title: 'regningen – Create invoices and download PDFs',
  description:
    'Create invoices and download PDFs. Directly in your browser, without an account.',
}

export const landingVisibilityExamples = [
  landingVisibilityExample,
  englishLandingVisibilityExample,
]

export const applicationVisibilityExamples = [
  {
    path: '/de/rechnung',
    language: 'de',
    title: 'Rechnung erstellen – regningen',
    description:
      'Empfänger und Rechnungspositionen erfassen und eine Rechnung als PDF herunterladen.',
  },
  {
    path: '/de/einstellungen',
    language: 'de',
    title: 'Einstellungen – regningen',
    description:
      'Sprache, Darstellung, Installation und Benachrichtigungen für regningen verwalten.',
  },
  {
    path: '/de/einstellungen/profil',
    language: 'de',
    title: 'Unternehmensprofil – regningen',
    description:
      'Unternehmensdaten in diesem Browser speichern sowie das gespeicherte Profil exportieren und importieren.',
  },
  {
    path: '/en/invoice',
    language: 'en',
    title: 'Create invoice – regningen',
    description:
      'Enter recipient details and invoice positions, then download an invoice as a PDF.',
  },
  {
    path: '/en/settings',
    language: 'en',
    title: 'Settings – regningen',
    description:
      'Manage language, appearance, installation and notifications for regningen.',
  },
  {
    path: '/en/settings/profile',
    language: 'en',
    title: 'Business profile – regningen',
    description:
      'Save business details in this browser and export or import your saved profile.',
  },
]
