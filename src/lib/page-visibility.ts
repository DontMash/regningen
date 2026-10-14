import { landingVisibility } from '@/features/landing/visibility'
import { invoiceVisibility } from '@/features/invoicing/invoice-visibility'
import { profileVisibility } from '@/features/invoicing/profile-visibility'
import { settingsVisibility } from '@/features/settings/visibility'
import { createVisibility } from './visibility'
import type { DeploymentPolicy } from './visibility'

// Lightweight declarations only: discovery never imports route rendering or UI.
export const pageDeclarations = [
  landingVisibility,
  invoiceVisibility,
  settingsVisibility,
  profileVisibility,
]

export function pageVisibility(policy: DeploymentPolicy) {
  return createVisibility(policy, pageDeclarations)
}
