import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/offline',
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 390, height: 844 } },
  webServer: {
    command: 'npm run preview -- --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true
  },
  reporter: 'list'
})
