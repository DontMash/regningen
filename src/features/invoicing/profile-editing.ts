import { Store } from '@tanstack/store'
import type { BusinessProfileDraft } from './validation-contract'

/** The form owns working values; this collaboration never keeps a second copy. */
export interface ProfileEditorForm {
  getValues: () => BusinessProfileDraft
  subscribe: (changed: () => void) => () => void
  restore: (baseline: BusinessProfileDraft) => void
  invalidateImport: () => void
}

type Confirmation = { answer: (allowed: boolean) => void }
export const profileEditingStore = new Store<{
  dirty: boolean
  confirmation: Confirmation | null
}>({ dirty: false, confirmation: null })

type Editor = {
  form: ProfileEditorForm
  baseline: BusinessProfileDraft
  unsubscribe: () => void
  waiting: Array<(allowed: boolean) => void>
}
let active: Editor | undefined

function isDirty(editor: Editor) {
  const values = editor.form.getValues()
  // Baselines come from the structurally decoded profile or the typed form,
  // both of which contain only BusinessProfileDraft fields.
  return (
    Object.keys(editor.baseline) as Array<keyof BusinessProfileDraft>
  ).some((field) => values[field] !== editor.baseline[field])
}

function publish(editor: Editor) {
  if (active !== editor) return
  profileEditingStore.setState((state) => ({
    ...state,
    dirty: isDirty(editor),
  }))
}

function settle(editor: Editor, allowed: boolean) {
  const waiting = editor.waiting
  editor.waiting = []
  waiting.forEach((resolve) => resolve(allowed))
}

function retire(editor: Editor) {
  if (active !== editor) return
  active = undefined
  editor.unsubscribe()
  editor.form.invalidateImport()
  profileEditingStore.setState(() => ({ dirty: false, confirmation: null }))
  settle(editor, false)
}

/**
 * One active editor owns comparison and permission requests. Replacement and
 * disposal deny old requests, invalidate reads and release subscriptions without
 * restoring departed values. Old publications and session operations are inert.
 */
export function attachProfileEditor(
  baseline: BusinessProfileDraft,
  form: ProfileEditorForm,
) {
  if (active) retire(active)
  const editor: Editor = {
    form,
    baseline: { ...baseline },
    unsubscribe: () => {},
    waiting: [],
  }
  active = editor
  editor.unsubscribe = form.subscribe(() => publish(editor))
  publish(editor)
  return {
    /** Call only after successful persistence, with the raw submitted values. */
    saved: (values: BusinessProfileDraft) => {
      if (active !== editor) return
      editor.baseline = { ...values }
      publish(editor)
    },
    dispose: () => retire(editor),
  }
}

export function hasUnsavedProfileChanges() {
  return profileEditingStore.state.dirty
}

/** All current callers share one answer; restoration finishes before permission. */
export function confirmDiscardProfileChanges(): Promise<boolean> {
  const editor = active
  if (!editor || !hasUnsavedProfileChanges()) return Promise.resolve(true)
  const result = new Promise<boolean>((resolve) => editor.waiting.push(resolve))
  if (!profileEditingStore.state.confirmation) {
    const confirmation: Confirmation = {
      answer: (allowed) => {
        if (
          active !== editor ||
          profileEditingStore.state.confirmation !== confirmation
        )
          return
        try {
          if (allowed) {
            editor.form.invalidateImport()
            editor.form.restore({ ...editor.baseline })
          }
        } catch (error) {
          // A programming defect in restoration must not authorize departure.
          profileEditingStore.setState(() => ({
            dirty: isDirty(editor),
            confirmation: null,
          }))
          settle(editor, false)
          throw error
        }
        profileEditingStore.setState(() => ({
          dirty: isDirty(editor),
          confirmation: null,
        }))
        settle(editor, allowed)
      },
    }
    profileEditingStore.setState((state) => ({ ...state, confirmation }))
  }
  return result
}

/** Reset supersedes old intents: deny them before restoring obsolete work. */
export function invalidateUnsavedProfileChanges() {
  const editor = active
  if (!editor) return
  profileEditingStore.setState((state) => ({ ...state, confirmation: null }))
  settle(editor, false)
  try {
    editor.form.invalidateImport()
    editor.form.restore({ ...editor.baseline })
  } finally {
    retire(editor)
  }
}
