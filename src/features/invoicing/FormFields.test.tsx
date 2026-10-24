// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { FormInput, RequiredAlternativeFields } from './FormFields'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'

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

it('keeps guidance and field, group, and caller feedback associated while opening and dismissing a hint', async () => {
  overwriteGetLocale(() => 'en')
  const user = userEvent.setup()
  render(
    <RequiredAlternativeFields
      id="tax"
      label="Tax identifier"
      error="Supply one identifier."
    >
      <span id="external">Use your business details.</span>
      <FormInput
        id="vat"
        label="VAT ID"
        value="invalid"
        onChange={() => {}}
        hint="Use a registered VAT ID."
        error="Invalid VAT ID."
        aria-describedby="external"
      />
    </RequiredAlternativeFields>,
  )
  const input = screen.getByRole('textbox', { name: 'VAT ID' })
  const description =
    'Use a registered VAT ID. Invalid VAT ID. Supply one identifier. Use your business details.'
  expect(input).toHaveAccessibleDescription(description)
  expect(input).toHaveAttribute('aria-invalid', 'true')
  await user.tab()
  const trigger = screen.getByRole('button', { name: 'Hint for VAT ID' })
  expect(trigger).toHaveFocus()
  await user.keyboard(' ')
  const popup = await screen.findByRole('dialog', { name: 'VAT ID' })
  expect(popup).toHaveAccessibleDescription('Use a registered VAT ID.')
  expect(input).toHaveAccessibleDescription(description)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(trigger).toHaveFocus())
  await user.tab()
  expect(input).toHaveFocus()
  expect(input).toHaveAccessibleDescription(description)
})
