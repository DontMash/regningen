'use client'

import { IconShare3 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { usePwa } from './PwaProvider'
import * as m from '@/paraglide/messages'

export function InstallButton() {
  const { installed, requestInstallation } = usePwa()
  if (installed) return null

  return (
    <Button
      type="button"
      variant="outline"
      aria-label={m.pwa_install()}
      onClick={() => void requestInstallation()}
    >
      <IconShare3 aria-hidden="true" data-icon="inline-start" />
      <span>{m.pwa_install()}</span>
    </Button>
  )
}

export function NotificationControl() {
  const { notificationStatus, enableNotifications, disableNotifications } =
    usePwa()

  const unavailableDescription =
    notificationStatus === 'unavailable'
      ? m.pwa_notifications_unavailable_description()
      : notificationStatus === 'install-required'
        ? m.pwa_notifications_install_description()
        : notificationStatus === 'denied'
          ? m.pwa_notifications_denied_description()
          : null

  const label =
    notificationStatus === 'enabled'
      ? m.pwa_notifications_disable()
      : notificationStatus === 'unavailable'
        ? m.pwa_notifications_unavailable()
        : notificationStatus === 'install-required'
          ? m.pwa_notifications_install_required()
          : notificationStatus === 'denied'
            ? m.pwa_notifications_denied()
            : m.pwa_notifications_enable()

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={
          notificationStatus === 'unavailable' ||
          notificationStatus === 'install-required' ||
          notificationStatus === 'denied'
        }
        onClick={() => {
          if (notificationStatus === 'enabled') disableNotifications()
          else void enableNotifications()
        }}
      >
        {label}
      </Button>
      {unavailableDescription ? (
        <p
          className="paragraph-small max-w-64 text-muted-foreground"
          role="status"
        >
          {unavailableDescription}
        </p>
      ) : null}
    </div>
  )
}
