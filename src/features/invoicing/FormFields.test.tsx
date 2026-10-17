// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import { FormInput, RequiredAlternativeFields } from './FormFields'

const originalGetLocale = getLocale

afterEach(() => {
  cleanup()
  overwriteGetLocale(originalGetLocale)
})

it('explains the either/or requirement in English and associates feedback with both inputs', () => {
  overwriteGetLocale(() => 'en')
  render(
    <RequiredAlternativeFields
      id="tax-identifiers"
      label="VAT ID or tax number"
      error="Provide a VAT ID or tax number."
    >
      <FormInput id="vatId" label="VAT ID" value="" onChange={() => {}} />
      <FormInput
        id="taxNumber"
        label="Tax number"
        value=""
        onChange={() => {}}
      />
    </RequiredAlternativeFields>,
  )

  expect(
    screen.getByRole('group', {
      name: 'VAT ID or tax number — at least one value required',
    }),
  ).toBeVisible()
  for (const name of ['VAT ID', 'Tax number']) {
    const input = screen.getByRole('textbox', { name })
    expect(input).toHaveAccessibleDescription('Provide a VAT ID or tax number.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).not.toBeRequired()
  }
})
