import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  images: ['public/favicon.svg'],
  preset: {
    transparent: {
      sizes: [192, 512],
      favicons: [[48, 'favicon.ico']],
    },
    maskable: { sizes: [192, 512], padding: 0.3 },
    apple: { sizes: [180], padding: 0.25 },
  },
})
