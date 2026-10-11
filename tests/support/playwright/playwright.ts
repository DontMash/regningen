import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ApplicationShellRobot } from '../../robots/playwright/application-shell'
import { ArtifactSupport } from './artifacts'
import { BusinessProfileRobot } from '../../robots/playwright/business-profile'
import { InvoiceRobot } from '../../robots/playwright/invoice'
import { BrowserControls } from './browser'
import { LayoutMeasurements } from './layout'
import { RequestObserver } from './requests'
import { StorageFaults } from './storage-faults'

export type PlaywrightRobots = {
  application: ApplicationShellRobot
  businessProfile: BusinessProfileRobot
  invoice: InvoiceRobot
}

export type TestFixtures = {
  application: ApplicationShellRobot
  businessProfile: BusinessProfileRobot
  invoice: InvoiceRobot
  harness: BrowserControls
  artifacts: ArtifactSupport
  layout: LayoutMeasurements
  requests: RequestObserver
  storageFaults: StorageFaults
  robotsForPage: (page: Page) => PlaywrightRobots
}

export const test = base.extend<TestFixtures>({
  application: async ({ page }, use) => {
    await use(new ApplicationShellRobot(page))
  },
  businessProfile: async ({ page }, use) => {
    await use(new BusinessProfileRobot(page))
  },
  invoice: async ({ page }, use) => {
    await use(new InvoiceRobot(page))
  },
  harness: async ({ page, context }, use) => {
    await use(new BrowserControls(page, context))
  },
  artifacts: async ({ page }, use) => {
    await use(new ArtifactSupport(page))
  },
  layout: async ({ page }, use) => {
    await use(new LayoutMeasurements(page))
  },
  requests: async ({ page }, use) => {
    await use(new RequestObserver(page))
  },
  storageFaults: async ({ page }, use) => {
    await use(new StorageFaults(page))
  },
  robotsForPage: async ({ page }, use) => {
    await use((robotPage = page) => ({
      application: new ApplicationShellRobot(robotPage),
      businessProfile: new BusinessProfileRobot(robotPage),
      invoice: new InvoiceRobot(robotPage),
    }))
  },
})

export { expect }
