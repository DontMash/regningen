import type { ValidationFailure } from './validation-contract'
import * as m from '@/paraglide/messages'

/** Presentation-only translation; business decisions belong to the domain. */
export function validationMessage(
  kind: 'profile' | 'invoice',
  failure: ValidationFailure,
): string {
  const field = failure.path[0]
  switch (failure.reason) {
    case 'too-long':
      return kind === 'profile'
        ? m.common_too_long({ maximum: String(failure.limit) })
        : m.invoice_maximum_characters({ limit: failure.limit ?? 0 })
    case 'invalid-iban':
      return m.profile_iban_invalid()
    case 'tax-identifier-required':
      return m.profile_tax_identifier_required()
    case 'invalid-vat-id':
      return m.profile_vat_id_invalid()
    case 'invalid-date':
      return m.invoice_date_invalid()
    case 'invalid-rate':
      return m.common_invalid()
    case 'recipient-required':
      return m.invoice_recipient_required()
    case 'position-required':
      return m.invoice_position_required()
    case 'position-limit':
      return m.invoice_position_limit()
    case 'invalid-amount':
      return m.invoice_amount_invalid()
    case 'required':
      if (kind === 'profile') {
        switch (field) {
          case 'businessName':
            return m.profile_business_name_required()
          case 'ownerName':
            return m.profile_owner_name_required()
          case 'street':
            return m.profile_street_required()
          case 'postalCode':
            return m.profile_postal_code_required()
          case 'town':
            return m.profile_town_required()
        }
      } else {
        switch (field) {
          case 'number':
            return m.invoice_number_required()
          case 'street':
            return m.invoice_street_required()
          case 'postalCode':
            return m.invoice_postal_code_required()
          case 'town':
            return m.invoice_town_required()
          case 'items':
            return m.invoice_description_required()
        }
      }
      return m.common_invalid()
  }
}
