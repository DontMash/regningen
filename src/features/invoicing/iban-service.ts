import { isValidIBAN } from 'ibantools'
import type { IbanVerification } from './validation-contract'

export const ibanVerification: IbanVerification = { isValid: isValidIBAN }
