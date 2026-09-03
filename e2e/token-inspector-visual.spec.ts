import { expect, test, type Page } from '@playwright/test'

import { installTokenInspectionRpc } from './support/rpc'
import {
  expectRegionSize,
  expectRelativeBox,
  expectSingleLineText,
  prepareVisualCapture,
} from './support/visual'

const tokenAddress = '0x1111111111111111111111111111111111111111'

async function openTokenInspector(page: Page) {
  expect(page.viewportSize()).toEqual({ height: 900, width: 1280 })
  await page.goto('/')
  await expect(page.getByTestId('network-status')).toContainText('已连接')

  return page.getByRole('region', { name: '查询目标 Token' })
}

test('matches the approved Penpot Dark Token Inspector Loading state', async ({ page }) => {
  let releaseBytecode = () => {}
  const bytecodeGate = new Promise<void>((resolve) => {
    releaseBytecode = resolve
  })
  await installTokenInspectionRpc(page, { bytecodeGate })

  const tokenRegion = await openTokenInspector(page)
  const tokenInput = tokenRegion.getByLabel('Token contract address')
  await tokenInput.fill(tokenAddress)
  await tokenRegion.getByRole('button', { name: '查询 Token' }).click()

  try {
    await expect(tokenRegion.getByRole('status')).toContainText('正在执行兼容性检查')
    const queryButton = tokenRegion.getByRole('button', { name: '查询中…' })
    await expect(queryButton).toBeDisabled()
    await expectRegionSize(tokenRegion, 380)
    await expectRelativeBox(tokenRegion, tokenInput, { height: 40, width: 697, x: 33, y: 198 })
    await expectRelativeBox(tokenRegion, queryButton, {
      height: 40,
      width: 107,
      x: 740,
      y: 198,
    })
    await expectSingleLineText(queryButton)
    await prepareVisualCapture(page)

    await expect(tokenRegion).toHaveScreenshot('token-inspector-loading.png')
  } finally {
    releaseBytecode()
  }

  await expect(page.getByTestId('token-compatibility')).toContainText('兼容性检查通过')
})

test('matches the approved Penpot Dark Token Inspector Result state', async ({ page }) => {
  await installTokenInspectionRpc(page)

  const tokenRegion = await openTokenInspector(page)
  await tokenRegion.getByLabel('Token contract address').fill(tokenAddress)
  await tokenRegion.getByRole('button', { name: '查询 Token' }).click()

  await expect(page.getByTestId('token-compatibility')).toContainText('兼容性检查通过')
  await expect(page.getByTestId('token-name')).toHaveText('Demo USD')
  await expect(page.getByTestId('token-symbol')).toHaveText('DUSD')
  await expect(page.getByTestId('token-decimals')).toHaveText('6')
  await expect(page.getByTestId('token-address')).toHaveText(tokenAddress)
  await expect(page.getByTestId('token-balance')).toHaveText('尚未导入账户，余额尚不可用')
  await expectRegionSize(tokenRegion, 562)

  const queryButton = tokenRegion.getByRole('button', { name: '查询 Token' })
  await expectSingleLineText(queryButton)

  const tokenResult = page.getByTestId('token-compatibility').locator('../..')
  const nameCell = page.getByTestId('token-name').locator('..')
  const symbolCell = page.getByTestId('token-symbol').locator('..')
  const decimalsCell = page.getByTestId('token-decimals').locator('..')
  await expectRelativeBox(tokenRegion, tokenResult, {
    height: 268,
    width: 814,
    x: 33,
    y: 262,
  })
  await expectRelativeBox(tokenResult, nameCell, { height: 72, width: 382, x: 0, y: 52 })
  await expectRelativeBox(tokenResult, symbolCell, { height: 72, width: 254, x: 382, y: 52 })
  await expectRelativeBox(tokenResult, decimalsCell, {
    height: 72,
    width: 178,
    x: 636,
    y: 52,
  })
  await prepareVisualCapture(page)

  await expect(tokenRegion).toHaveScreenshot('token-inspector-result.png')
})

test('matches the approved Penpot Dark Token Inspector Validation Error state', async ({
  page,
}) => {
  const rpc = await installTokenInspectionRpc(page)

  const tokenRegion = await openTokenInspector(page)
  await tokenRegion.getByLabel('Token contract address').fill('not-an-address')
  await tokenRegion.getByRole('button', { name: '查询 Token' }).click()

  await expect(page.getByTestId('token-error')).toHaveText(
    'Token 地址格式无效，请输入有效的 Ethereum 合约地址。',
  )
  await expect(tokenRegion.getByLabel('Token contract address')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(rpc.tokenRequestCount()).toBe(0)
  await expectRegionSize(tokenRegion, 360)
  await expectSingleLineText(tokenRegion.getByRole('button', { name: '查询 Token' }))
  await prepareVisualCapture(page)

  await expect(tokenRegion).toHaveScreenshot('token-inspector-validation-error.png')
})
