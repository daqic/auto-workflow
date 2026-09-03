import { expect, type Page } from '@playwright/test'

export async function prepareVisualCapture(page: Page) {
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
  await page.mouse.move(0, 0)
}
