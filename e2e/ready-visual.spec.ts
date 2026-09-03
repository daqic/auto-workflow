import { expect, test, type Page } from '@playwright/test'

import { installReadyRpc } from './support/rpc'
import { prepareVisualCapture } from './support/visual'

async function openReadyPage(page: Page) {
  expect(page.viewportSize()).toEqual({ height: 900, width: 1280 })

  await installReadyRpc(page)

  await page.goto('/')
  await expect(page.getByTestId('network-status')).toContainText('已连接')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBe(1668)
  await expect(
    Promise.all(
      [
        '.topbar',
        '[data-testid="account-import-form"]',
        '.network-card',
        '.token-card',
        '.transfer-card',
        '.safety-note',
      ].map((selector) => page.locator(selector).boundingBox()),
    ),
  ).resolves.toEqual([
    { height: 148, width: 1280, x: 0, y: 0 },
    { height: 114, width: 720, x: 512, y: 16 },
    { height: 383, width: 880, x: 200, y: 397 },
    { height: 380, width: 880, x: 200, y: 804 },
    { height: 266, width: 880, x: 200, y: 1208 },
    { height: 82, width: 880, x: 200, y: 1492 },
  ])
  await prepareVisualCapture(page)
}

test('matches the approved Penpot Dark Ready composition', async ({ page }) => {
  await openReadyPage(page)

  await expect(page).toHaveScreenshot('ready.png', { fullPage: true })
})
