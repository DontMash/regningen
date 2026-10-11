'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { IconX } from '@tabler/icons-react'
import { cn } from 'cn'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { buttonVariants } from '@/components/ui/button'

const DESKTOP_BREAKPOINT = '(min-width: 768px)'

interface AdaptiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  stickyHeader?: React.ReactNode
  children: React.ReactNode
}

function useDesktopViewport() {
  const [isDesktop, setIsDesktop] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT)
    const updateViewport = () => setIsDesktop(mediaQuery.matches)

    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  return isDesktop
}

function AdaptiveDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  stickyHeader,
  children,
}: AdaptiveDialogProps) {
  const isDesktop = useDesktopViewport()
  const content = (
    <div
      data-slot="adaptive-dialog-scroll-area"
      className="min-h-0 flex-1 overflow-y-auto"
    >
      {/* Extend the background over fractional-pixel sticky paint seams. */}
      {stickyHeader ? (
        <div className="sticky top-0 z-10 border-b bg-popover px-6 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-popover">
          {stickyHeader}
        </div>
      ) : null}
      <div className="px-6 py-5">{children}</div>
    </div>
  )

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            data-slot="dialog-backdrop"
            className="fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-xs data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-safe:transition-opacity motion-safe:duration-150"
          />
          <DialogPrimitive.Popup
            data-slot="dialog-popup"
            className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(88dvh,52rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-safe:transition-[scale,opacity] motion-safe:duration-150"
          >
            <div className="relative flex shrink-0 flex-col gap-1.5 border-b px-6 py-5 pr-16">
              <DialogPrimitive.Title className="text-lg font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
              <DialogPrimitive.Close
                aria-label="Schließen"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                  'absolute top-4 right-4',
                )}
              >
                <IconX aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            {content}
            {footer ? (
              <div className="flex shrink-0 justify-end border-t px-6 py-4">
                {footer}
              </div>
            ) : null}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection="down"
      showSwipeHandle
    >
      <DrawerContent className="max-h-[calc(100dvh-1rem)] gap-0 rounded-t-2xl border-t bg-popover p-0 text-popover-foreground shadow-xl">
        <DrawerHeader className="relative shrink-0 gap-1 border-b px-6 py-5 pr-16">
          <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription>{description}</DrawerDescription>
          ) : null}
          <DrawerClose
            aria-label="Schließen"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
              'absolute top-4 right-4',
            )}
          >
            <IconX aria-hidden="true" />
          </DrawerClose>
        </DrawerHeader>
        {content}
        {footer ? (
          <div className="flex shrink-0 justify-end border-t px-6 py-4">
            {footer}
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

export default AdaptiveDialog
