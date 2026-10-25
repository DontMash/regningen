import type { BrowserContext, Page } from '@playwright/test'

type NotificationObservation = {
  permissionRequests: number
  permission: NotificationPermission
  failDelivery: boolean
  notifications: Array<{ title: string; body: string }>
}

type CapabilityWindow = Window &
  typeof globalThis & {
    pwaNotificationObservation: NotificationObservation
  }

// Observes local notification dispatch, not actual OS presentation or delivery.
export class PwaBrowserCapabilities {
  constructor(private readonly context: BrowserContext) {}

  async observeNotifications(
    origin: string,
    permission: NotificationPermission = 'granted',
  ) {
    await this.context.addInitScript(
      ({ expectedOrigin, initialPermission }) => {
        if (
          location.origin !== expectedOrigin ||
          typeof Notification === 'undefined'
        )
          return
        const observation: NotificationObservation = {
          permissionRequests: 0,
          permission: initialPermission,
          failDelivery: false,
          notifications: [],
        }
        ;(window as CapabilityWindow).pwaNotificationObservation = observation
        Object.defineProperty(Notification, 'permission', {
          get: () => observation.permission,
        })
        Notification.requestPermission = async () => {
          observation.permissionRequests += 1
          observation.permission = 'granted'
          return 'granted'
        }
        ServiceWorkerRegistration.prototype.showNotification = async (
          title,
          options,
        ) => {
          observation.notifications.push({ title, body: options?.body ?? '' })
          if (observation.failDelivery)
            throw new Error('OS notification unavailable')
        }
      },
      { expectedOrigin: origin, initialPermission: permission },
    )
  }

  async setNotificationPermission(
    page: Page,
    permission: NotificationPermission,
  ) {
    await page.evaluate((value) => {
      ;(window as CapabilityWindow).pwaNotificationObservation.permission =
        value
      window.dispatchEvent(new Event('focus'))
    }, permission)
  }

  async failNotificationDelivery(page: Page) {
    await page.evaluate(() => {
      ;(window as CapabilityWindow).pwaNotificationObservation.failDelivery =
        true
    })
  }

  async notificationObservation(page: Page) {
    return page.evaluate(() => ({
      ...(window as CapabilityWindow).pwaNotificationObservation,
      permission: Notification.permission,
    }))
  }
}
