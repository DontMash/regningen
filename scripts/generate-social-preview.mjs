import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import * as m from '../src/paraglide/messages.js'

const font = async (family) =>
  (
    await readFile(
      `node_modules/@fontsource-variable/${family}/files/${family}-latin-wght-normal.woff2`,
    )
  ).toString('base64')
const icon = await readFile('public/favicon.svg', 'utf8')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  })
  for (const locale of ['de', 'en']) {
    const text = (message) =>
      message({}, { locale })
        .replace(
          /[&<>"']/g,
          (character) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[character],
        )
        .replaceAll('\n', '<br>')
    const total = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
    })
      .format(119)
      .replaceAll('\u00a0', ' ')
    await page.setContent(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><style>
    @font-face { font-family: Inter; src: url(data:font/woff2;base64,${await font('inter')}); }
    @font-face { font-family: Lora; src: url(data:font/woff2;base64,${await font('lora')}); }
    * { box-sizing: border-box; } body { margin: 0; background: #f5f5f4; color: #1c1917; font: 24px Inter; }
    main { width: 1200px; height: 630px; padding: 64px; display: grid; grid-template-columns: 1fr 340px; align-items: center; gap: 72px; }
    .brand { display: flex; align-items: center; gap: 14px; font: 600 36px Lora; } .brand svg { width: 42px; height: 42px; }
    h1 { font: 500 54px/1.18 Lora; margin: 46px 0 24px; letter-spacing: -1px; } p { margin: 0; line-height: 1.6; }
    .paper { background: #fff; border: 1px solid #e7e5e4; padding: 32px; box-shadow: 12px 16px 0 #e7e5e4; }
    .paper h2 { font: 600 30px Lora; margin: 0 0 12px; } .paper p { font-size: 16px; color: #57534e; }
    .rule { height: 4px; background: #ec003f; margin: 24px 0; } .line { height: 8px; width: 100%; background: #e7e5e4; margin: 18px 0; }
    .short { width: 60%; } .total { border-top: 1px solid #e7e5e4; margin-top: 40px; padding-top: 20px; display: flex; justify-content: space-between; font-size: 18px; }
    .pdf { display: inline-block; background: #ec003f; color: #fff; padding: 8px 14px; font-size: 16px; margin-top: 28px; border-radius: 4px; }
  </style><main><section><div class="brand">${icon}regningen</div><h1>${text(m.artwork_headline)}</h1><p>${text(m.artwork_intro)}</p></section><section class="paper"><h2>${text(m.artwork_invoice)}</h2><p>${text(m.artwork_example)}</p><div class="rule"></div><p>${text(m.artwork_parties)}</p><div class="line"></div><div class="line short"></div><div class="total"><span>${text(m.artwork_gross)}</span><strong>${total}</strong></div><div class="pdf">${text(m.artwork_download)}</div></section></main></html>`)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path:
        locale === 'de'
          ? 'public/social-preview.png'
          : 'public/social-preview-en.png',
    })
  }
} finally {
  await browser.close()
}
