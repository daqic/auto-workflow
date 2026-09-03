import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      animations: 'disabled',
      pathTemplate: '{testDir}/visual-baselines/{platform}/{testFilePath}/{arg}{ext}',
    },
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'corepack pnpm@10.15.0 run preview'
      : 'corepack pnpm@10.15.0 exec vite --host 127.0.0.1 --port 5174',
    env: {
      DISABLE_VUE_DEVTOOLS: 'true',
    },
    port: process.env.CI ? 4173 : 5174,
    reuseExistingServer: false,
  },
})
