import { expect, test, type Page } from '@playwright/test'

import { defaultRpcUrl, fulfillChainId } from './support/rpc'

async function openReadyPage(page: Page) {
  expect(page.viewportSize()).toEqual({ height: 900, width: 1280 })

  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    await fulfillChainId(route, 11_155_111)
  })

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
  await page.evaluate(() => document.fonts.ready)

  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded')
  await expect
    .poll(() =>
      page.evaluate(() => ({
        family: getComputedStyle(document.body).fontFamily,
        loaded: [...document.fonts].some(
          (font) => font.family === 'Inter Variable' && font.status === 'loaded',
        ),
        normal: document.fonts.check('400 14px "Inter Variable"'),
        strong: document.fonts.check('700 14px "Inter Variable"'),
      })),
    )
    .toEqual({
      family: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
      loaded: true,
      normal: true,
      strong: true,
    })
}

test('matches the approved Penpot Dark Ready composition', async ({ page }) => {
  await openReadyPage(page)

  await expect(page).toHaveScreenshot('ready.png', { fullPage: true })
})
