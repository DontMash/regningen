// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAtRoute, disposeTestRouters } from '../../tests/helpers/render'
import {
  completeBusinessProfile,
  saveBusinessProfile,
} from '../../tests/helpers/business-profile'
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
  it('shows its local loading state and routes a blank profile to settings', async () => {
    await renderAtRoute('/', Home)
    expect(
      screen.getByText('Unternehmensprofil wird lokal geladen …'),
    ).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'Profilseite geöffnet' }),
    ).toBeVisible()
  })

  it('routes a complete profile directly to invoice creation', async () => {
    saveBusinessProfile(completeBusinessProfile)
    await renderAtRoute('/', Home)

    expect(
      await screen.findByRole('heading', { name: 'Rechnungsseite geöffnet' }),
    ).toBeVisible()
  })

  it('blocks navigation when browser storage cannot load the profile', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    await renderAtRoute('/', Home)

    expect(
      await screen.findByRole('alertdialog', {
        name: 'Rechnungen sind gesperrt',
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Profilseite geöffnet' }),
    ).not.toBeInTheDocument()
  })
})
