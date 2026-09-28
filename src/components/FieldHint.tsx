import { IconInfoCircle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

export function FieldHint({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Hinweis zu ${label}`}
          />
        }
      >
        <IconInfoCircle aria-hidden="true" data-icon="inline-start" />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <PopoverDescription>{children}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
