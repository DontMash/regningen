import { test } from '../support/playwright/playwright'

test('declares German as the application language', async ({
  harness,
  language,
  releaseNotes,
}) => {
  await harness.open('/')
  await releaseNotes.dismissReleaseNotes()
  await language.expectGermanLanguage()
})
