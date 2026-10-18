import { landingVisibility } from '@/features/landing/visibility'
import { invoiceVisibility } from '@/features/invoicing/invoice-visibility'
import { profileVisibility } from '@/features/invoicing/profile-visibility'
import {
  licensesVisibility,
  settingsVisibility,
} from '@/features/settings/visibility'
import { localizedPages } from '@/i18n/config'
import * as m from '@/paraglide/messages'
import { createVisibility, localizedSocialMetadata } from './visibility'
import type { DeploymentPolicy, PageVisibility } from './visibility'
import type { Locale } from '@/paraglide/runtime'

// Lightweight declarations only: discovery never imports rendering or user data.
export const pageDeclarations = [
  landingVisibility,
  invoiceVisibility,
  settingsVisibility,
  profileVisibility,
  licensesVisibility,
]

export function localizedCanonicalPath(path: string, locale: Locale) {
  const mapping = localizedPages.find((page) => page.internal === path)
  return mapping?.[locale] ?? `/${locale}${path === '/' ? '' : path}`
}

function translatedDeclaration(
  page: PageVisibility,
  locale: Locale,
): PageVisibility {
  const options = { locale }
  const { socialLocale, socialImage } = localizedSocialMetadata(locale)
  const metadata: Partial<
    Record<string, () => Pick<PageVisibility, 'title' | 'description'>>
  > = {
    '/': () => ({
      title: m.meta_landing_title({}, options),
      description: m.meta_landing_description({}, options),
    }),
    '/invoice': () => ({
      title: m.meta_invoice_title({}, options),
      description: m.meta_invoice_description({}, options),
    }),
    '/settings': () => ({
      title: m.meta_settings_title({}, options),
      description: m.meta_settings_description({}, options),
    }),
    '/settings/licenses': () => ({
      title: m.meta_licenses_title({}, options),
      description: m.meta_licenses_description({}, options),
    }),
    '/settings/profile': () => ({
      title: m.meta_profile_title({}, options),
      description: m.meta_profile_description({}, options),
    }),
  }
  return {
    ...page,
    ...metadata[page.canonicalPath]?.(),
    canonicalPath: localizedCanonicalPath(page.canonicalPath, locale),
    language: locale,
    socialLocale,
    fallback: page.fallback && locale === 'de',
    socialImage: page.socialImage ?? socialImage,
    ...(page.translationGroup
      ? { agentTitle: m.meta_landing_agent({}, options) }
      : {}),
    ...(page.structuredData
      ? {
          structuredData: {
            features: [
              m.meta_feature_profile({}, options),
              m.meta_feature_positions({}, options),
              m.meta_feature_pdf({}, options),
              m.meta_feature_draft({}, options),
              m.meta_feature_backup({}, options),
              m.meta_feature_offline({}, options),
            ],
          },
        }
      : {}),
  }
}

export function pageVisibility(policy: DeploymentPolicy) {
  return createVisibility(
    policy,
    pageDeclarations.flatMap((page) =>
      (['de', 'en'] as const).map((locale) =>
        translatedDeclaration(page, locale),
      ),
    ),
  )
}
