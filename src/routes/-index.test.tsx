// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  renderAtRoute,
  disposeTestRouters,
} from '../../tests/support/vitest/render'
import { saveBusinessProfile } from '../../tests/support/vitest/business-profile'
import { createBusinessProfileScenario } from '../../tests/scenarios/business-profile'
import { businessProfileStorageStatus } from '@/features/invoicing/business-profile-storage-status'
import { Route } from './index'

const Home = Route.options.component!

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.localStorage.clear()
  businessProfileStorageStatus.setState(() => ({ error: null }))
})

afterEach(() => {
  cleanup()
  disposeTestRouters()
  vi.restoreAllMocks()
})

describe('home route', () => {
  it('keeps its public introduction visible for a returning visitor instead of redirecting', async () => {
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/', Home)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Rechnungen erstellen. Direkt im Browser.',
      }),
    ).toBeVisible()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText(/Ohne Benutzerkonto\./)).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Nordlicht Catering')).not.toBeInTheDocument()
  })

  it('opens profile setup only after the visitor chooses to create an invoice without a saved profile', async () => {
    const user = userEvent.setup()
    await renderAtRoute('/', Home)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Rechnungen erstellen. Direkt im Browser.',
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Profilseite geöffnet' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getAllByRole('button', { name: 'Rechnung erstellen' })[0],
    )

    expect(
      await screen.findByRole('heading', { name: 'Profilseite geöffnet' }),
    ).toBeVisible()
  })

  it('selects the invoice editor after an explicit action with a complete saved profile', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(createBusinessProfileScenario())
    await renderAtRoute('/', Home)

    expect(
      screen.queryByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getAllByRole('button', { name: 'Rechnung erstellen' })[0],
    )

    expect(
      await screen.findByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).toBeVisible()
  })

  it('uses the final create action to open profile setup when the saved profile is incomplete', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(createBusinessProfileScenario({ businessName: '' }))
    await renderAtRoute('/', Home)

    const actions = screen.getAllByRole('button', {
      name: 'Rechnung erstellen',
    })
    expect(actions).toHaveLength(2)
    expect(
      screen.queryByRole('heading', { name: 'Profilseite geöffnet' }),
    ).not.toBeInTheDocument()

    await user.click(actions[1])

    expect(
      await screen.findByRole('heading', { name: 'Profilseite geöffnet' }),
    ).toBeVisible()
  })

  it('keeps the introduction readable and explains entry retries while browser storage is unavailable', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/', Home)

    await user.click(
      screen.getAllByRole('button', { name: 'Rechnung erstellen' })[0],
    )

    expect(
      await screen.findByRole('alert', {
        name: 'Unternehmensprofil nicht verfügbar',
      }),
    ).toBeVisible()
    expect(screen.getByText(/Prüfe die Speichereinstellungen/)).toBeVisible()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Rechnungen erstellen. Direkt im Browser.',
      }),
    ).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(
      screen.getByRole('alert', { name: 'Unternehmensprofil nicht verfügbar' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Profilseite geöffnet' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).not.toBeInTheDocument()
  })

  it('retries profile loading and selects the invoice editor once storage becomes readable again', async () => {
    const user = userEvent.setup()
    saveBusinessProfile(createBusinessProfileScenario())
    const storageFault = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage unavailable')
      })
    await renderAtRoute('/', Home)

    expect(
      await screen.findByRole('alert', {
        name: 'Unternehmensprofil nicht verfügbar',
      }),
    ).toBeVisible()
    storageFault.mockRestore()
    expect(
      screen.queryByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(
      await screen.findByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).toBeVisible()
  })

  it('explains the six actual capabilities and their limits with a clearly fictional invoice', async () => {
    await renderAtRoute('/', Home)

    const profile = screen.getByRole('region', {
      name: 'Unternehmensprofil wiederverwenden',
    })
    expect(within(profile).getByText(/in diesem Browser/)).toBeVisible()

    const positions = screen.getByRole('region', {
      name: 'Positionen und Summen erfassen',
    })
    expect(within(positions).getByText(/bis zu 16/)).toBeVisible()
    expect(
      within(positions).getByText(/positive Bruttobeträge in Euro/),
    ).toBeVisible()
    expect(within(positions).getByText(/7 % oder 19 %/)).toBeVisible()

    const pdf = screen.getByRole('region', { name: 'PDF direkt herunterladen' })
    expect(within(pdf).getByText(/eine A4-Seite/)).toBeVisible()
    expect(within(pdf).getByText(/begrenztem Platz/)).toBeVisible()

    const draft = screen.getByRole('region', {
      name: 'Entwurf während der Sitzung behalten',
    })
    expect(within(draft).getByText(/aktuellen Tabs/)).toBeVisible()
    expect(within(draft).getByText(/kein Archiv/)).toBeVisible()

    const backup = screen.getByRole('region', {
      name: 'Unternehmensprofil sichern',
    })
    expect(within(backup).getByText(/zuletzt gespeicherte/)).toBeVisible()
    expect(within(backup).getByText(/unverschlüsselt/)).toBeVisible()
    expect(
      within(backup).getByText(/keine Entwürfe, PDFs oder Einstellungen/),
    ).toBeVisible()
    expect(within(backup).getByText(/nach dem Import/)).toBeVisible()

    const offline = screen.getByRole('region', {
      name: 'Installieren und offline nutzen',
    })
    expect(within(offline).getByText(/Online-Vorbereitung/)).toBeVisible()
    expect(within(offline).getByText(/„Offline bereit“/)).toBeVisible()
    expect(within(offline).getByText(/optional/)).toBeVisible()
    expect(
      within(offline).getByText(/hängt von deinem Browser ab/),
    ).toBeVisible()

    const sample = screen.getByRole('figure', {
      name: 'Illustrative Rechnung mit fiktiven Beispieldaten',
    })
    expect(within(sample).getByText('600,00 €')).toBeVisible()
    expect(within(sample).getByText('114,00 €')).toBeVisible()
    expect(within(sample).getByText('714,00 €')).toBeVisible()
  })
})
