'use client'

import { IconShare3 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { usePwa } from './PwaProvider'

export function InstallButton() {
  const { installed, requestInstallation } = usePwa()
  if (installed) return null

  return (
    <Button
      type="button"
      variant="outline"
      aria-label="Installieren"
      onClick={() => void requestInstallation()}
    >
      <IconShare3 aria-hidden="true" data-icon="inline-start" />
      <span>Installieren</span>
    </Button>
  )
}

export function NotificationControl() {
  const { notificationStatus, enableNotifications, disableNotifications } =
    usePwa()

  const unavailableDescription =
    notificationStatus === 'unavailable'
      ? 'Dieser Browser unterstützt keine lokalen Benachrichtigungen.'
      : notificationStatus === 'install-required'
        ? 'Installiere regningen zum Home-Bildschirm, um Benachrichtigungen zu aktivieren.'
        : notificationStatus === 'denied'
          ? 'Die Berechtigung wurde blockiert. Ändere sie in den Browser-Einstellungen.'
          : null

  const label =
    notificationStatus === 'enabled'
      ? 'Benachrichtigungen deaktivieren'
      : notificationStatus === 'unavailable'
        ? 'Benachrichtigungen nicht verfügbar'
        : notificationStatus === 'install-required'
          ? 'Installation für Benachrichtigungen erforderlich'
          : notificationStatus === 'denied'
            ? 'Benachrichtigungen blockiert'
            : 'Benachrichtigungen aktivieren'

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
