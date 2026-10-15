import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Environmental inspection only: never installs application prerequisites. */
export async function coldNavigation(page: Page, origin: string) {
  // Destroy the warm document (and its worker controller) but keep this tab's
  // real sessionStorage. No storage serialization is replayed into a new tab.
  await page.goto('about:blank')
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('ServiceWorker.enable')
    await cdp.send('ServiceWorker.stopAllWorkers')
    await cdp.send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: 'service_workers,cache_storage',
    })
    await expect
      .poll(async () => {
        const { targetInfos } = await cdp.send('Target.getTargets')
        return targetInfos.filter((target) => target.type === 'service_worker')
      })
      .toHaveLength(0)
    // Clear once more after worker shutdown so a finishing precache cannot race
    // the eviction. The blank tab cannot register a replacement worker.
    await cdp.send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: 'cache_storage',
    })
    await cdp.send('Network.enable')
    await cdp.send('Network.clearBrowserCache')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
    const { usageBreakdown } = await cdp.send('Storage.getUsageAndQuota', {
      origin,
    })
    const cacheBytes = usageBreakdown
      .filter((entry) =>
        ['service_workers', 'cache_storage'].includes(entry.storageType),
      )
      .reduce((sum, entry) => sum + entry.usage, 0)
    expect(cacheBytes).toBe(0)
    const controllingWorker = await page.evaluate(
      () =>
        'serviceWorker' in navigator && !!navigator.serviceWorker.controller,
    )
    expect(controllingWorker).toBe(false)
  } finally {
    await cdp.detach()
  }
}
