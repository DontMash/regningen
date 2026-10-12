import type { BrowserContext, Page } from '@playwright/test'

type NotificationObservation = {
  permissionRequests: number
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

  async observeNotifications(origin: string) {
    await this.context.addInitScript((expectedOrigin) => {
      if (
        location.origin !== expectedOrigin ||
        typeof Notification === 'undefined'
      )
        return
      const observation: NotificationObservation = {
        permissionRequests: 0,
        failDelivery: false,
        notifications: [],
      }
      ;(window as CapabilityWindow).pwaNotificationObservation = observation
      Object.defineProperty(Notification, 'permission', {
        get: () => 'granted',
      })
      Notification.requestPermission = async () => {
        observation.permissionRequests += 1
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
    }, origin)
  }

  async failNotificationDelivery(page: Page) {
    await page.evaluate(() => {
      ;(window as CapabilityWindow).pwaNotificationObservation.failDelivery =
        true
    })
  }

  async notificationObservation(page: Page) {
    return page.evaluate(
      () => (window as CapabilityWindow).pwaNotificationObservation,
    )
  }
}
