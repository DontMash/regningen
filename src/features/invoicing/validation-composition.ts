import { ibanVerification } from './iban-service'
import { createBusinessValidation } from './validation-domain'
import type { BusinessValidation } from './validation-contract'

export const businessValidation: BusinessValidation =
  createBusinessValidation(ibanVerification)
