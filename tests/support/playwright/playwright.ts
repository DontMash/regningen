import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AppShellRobot } from '../../robots/playwright/app-shell'
import { BusinessProfileRobot } from '../../robots/playwright/business-profile'
import { FooterRobot } from '../../robots/playwright/footer'
import { InvoiceRobot } from '../../robots/playwright/invoice'
import { LanguageRobot } from '../../robots/playwright/language'
import { PwaRobot } from '../../robots/playwright/pwa'
import { ReleaseNotesRobot } from '../../robots/playwright/release-notes'
import { ThemeRobot } from '../../robots/playwright/theme'
import { ArtifactSupport } from './artifacts'
import { BrowserControls } from './browser'
import { LayoutMeasurements } from './layout'
import { RequestObserver } from './requests'
import { StorageFaults } from './storage-faults'

export type PlaywrightRobots = {
  appShell: AppShellRobot
  businessProfile: BusinessProfileRobot
  footer: FooterRobot
  invoice: InvoiceRobot
  language: LanguageRobot
  releaseNotes: ReleaseNotesRobot
  pwa: PwaRobot
  theme: ThemeRobot
}

export type TestFixtures = PlaywrightRobots & {
  harness: BrowserControls
  artifacts: ArtifactSupport
  layout: LayoutMeasurements
  requests: RequestObserver
  storageFaults: StorageFaults
  robotsForPage: (page: Page) => PlaywrightRobots
}

export const test = base.extend<TestFixtures>({
  appShell: async ({ page }, use) => {
    await use(new AppShellRobot(page))
  },
  businessProfile: async ({ page }, use) => {
    await use(new BusinessProfileRobot(page))
  },
  footer: async ({ page }, use) => {
    await use(new FooterRobot(page))
  },
  invoice: async ({ page }, use) => {
    await use(new InvoiceRobot(page))
  },
  language: async ({ page }, use) => {
    await use(new LanguageRobot(page))
  },
  pwa: async ({ page }, use) => {
    await use(new PwaRobot(page))
  },
  releaseNotes: async ({ page }, use) => {
    await use(new ReleaseNotesRobot(page))
  },
  theme: async ({ page }, use) => {
    await use(new ThemeRobot(page))
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
      appShell: new AppShellRobot(robotPage),
      businessProfile: new BusinessProfileRobot(robotPage),
      footer: new FooterRobot(robotPage),
      invoice: new InvoiceRobot(robotPage),
      language: new LanguageRobot(robotPage),
      pwa: new PwaRobot(robotPage),
      releaseNotes: new ReleaseNotesRobot(robotPage),
      theme: new ThemeRobot(robotPage),
    }))
  },
})

export { expect }
