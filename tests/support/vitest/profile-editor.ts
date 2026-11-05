import { attachProfileEditor } from '../../../src/features/invoicing/profile-editing'
import { createBusinessProfileScenario } from '../../scenarios/business-profile'

/** In-memory form adapter for callers that do not render the real editor. */
export function createProfileEditor() {
  let values = createBusinessProfileScenario()
  let changed = () => {}
  const restored: Array<typeof values> = []
  const lifetime = attachProfileEditor(values, {
    getValues: () => values,
    subscribe: (listener) => {
      changed = listener
      return () => {
        changed = () => {}
      }
    },
    restore: (baseline) => {
      values = { ...baseline }
      restored.push(values)
      changed()
    },
    invalidateImport: () => {},
  })
  return {
    ...lifetime,
    edit: (businessName: string) => {
      values = { ...values, businessName }
      changed()
    },
    values: () => values,
    restored,
  }
}
