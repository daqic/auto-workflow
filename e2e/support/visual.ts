import { expect, type Locator, type Page } from '@playwright/test'

interface RelativeBox {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}

export async function expectRegionSize(region: Locator, height: number, width = 880) {
  await expect
    .poll(async () => {
      const box = await region.boundingBox()

      return box ? { height: box.height, width: box.width } : null
    })
    .toEqual({ height, width })
}

export async function expectRelativeBox(
  reference: Locator,
  target: Locator,
  expected: RelativeBox,
) {
  await expect
    .poll(async () => {
      const [referenceBox, targetBox] = await Promise.all([
        reference.boundingBox(),
        target.boundingBox(),
      ])

      return referenceBox && targetBox
        ? {
            height: Math.round(targetBox.height),
            width: Math.round(targetBox.width),
            x: Math.round(targetBox.x - referenceBox.x),
            y: Math.round(targetBox.y - referenceBox.y),
          }
        : null
    })
    .toEqual(expected)
}

export async function expectSingleLineText(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)

        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
      }),
    )
    .toBe(1)
}

export async function expectInterVariableFont(target: Locator) {
  await expect
    .poll(() => target.evaluate((element) => getComputedStyle(element).fontFamily))
    .toBe('"Inter Variable", ui-sans-serif, system-ui, sans-serif')
}

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
