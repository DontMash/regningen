import { createContext, useContext } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { FieldHint } from '@/components/FieldHint'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function RequiredMark() {
  return <span aria-hidden="true"> *</span>
}

export function FormErrorSlot({ id, error }: { id: string; error?: string }) {
  return (
    <div className='min-h-5'>
      {error && <FieldError id={id}>{error}</FieldError>}
    </div>
  )
}

const AlternativeErrorContext = createContext<{
  id: string
  error?: string
} | null>(null)

export function RequiredAlternativeFields({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  const errorId = `${id}-error`
  return (
    <FieldSet
      className="min-w-0 gap-3 md:col-span-2"
      aria-describedby={error ? errorId : undefined}
    >
      <FieldLegend variant="label">
        {label}
        <RequiredMark /> — mindestens eine Angabe
      </FieldLegend>
      <AlternativeErrorContext.Provider value={{ id: errorId, error }}>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {children}
        </FieldGroup>
      </AlternativeErrorContext.Provider>
      <FormErrorSlot id={errorId} error={error} />
    </FieldSet>
  )
}

export function FormInput({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  hideLabel = false,
  required = false,
  ...inputProps
}: Omit<ComponentProps<'input'>, 'id' | 'value' | 'onChange'> & {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  hideLabel?: boolean
}) {
  const alternative = useContext(AlternativeErrorContext)
  const invalid = Boolean(error || alternative?.error)
  const describedBy =
    [
      error ? `${id}-error` : undefined,
      alternative?.error ? alternative.id : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <Field data-invalid={invalid}>
      {hideLabel ? (
        <FieldLabel htmlFor={id} className="sr-only">
          {label}
        </FieldLabel>
      ) : (
        <div className="flex min-h-6 items-center gap-1">
          <FieldLabel htmlFor={id}>
            {label}
            {required && <RequiredMark />}
          </FieldLabel>
          {hint && <FieldHint label={label}>{hint}</FieldHint>}
        </div>
      )}
      <Input
        {...inputProps}
        id={id}
        name={id}
        value={value}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <FormErrorSlot id={`${id}-error`} error={error} />
    </Field>
  )
}
