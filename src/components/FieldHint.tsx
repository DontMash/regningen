import { IconInfoCircle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import * as m from '@/paraglide/messages'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

export function FieldHint({
  label,
  id,
  children,
}: {
  label: string
  /** Stable description target for the field, available even while closed. */
  id?: string
  children: React.ReactNode
}) {
  return (
    <Popover>
      {id && (
        <span id={id} hidden>
          {children}
        </span>
      )}
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={m.shell_field_hint({ label })}
          />
        }
      >
        <IconInfoCircle aria-hidden="true" data-icon="inline-start" />
      </PopoverTrigger>
      <PopoverContent {...(id ? { 'aria-describedby': id } : {})}>
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        {/* The stable description supplies the announcement; this copy is visual only. */}
        {id ? (
          <p className="text-muted-foreground" aria-hidden="true">
            {children}
          </p>
        ) : (
          <PopoverDescription>{children}</PopoverDescription>
        )}
      </PopoverContent>
    </Popover>
  )
}
