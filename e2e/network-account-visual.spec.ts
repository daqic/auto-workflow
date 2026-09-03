import { expect, test } from '@playwright/test'

import { defaultRpcUrl, installReadyRpc } from './support/rpc'
import { expectRegionSize, prepareVisualCapture } from './support/visual'

test('matches the approved Penpot Dark Network Advanced RPC state', async ({ page }) => {
  await installReadyRpc(page)
  await page.goto('/')
  await expect(page.getByTestId('network-status')).toContainText('已连接')

  const networkRegion = page.getByRole('region', { name: 'Sepolia 网络连接' })
  await networkRegion.getByText('高级 RPC 设置').click()
  await networkRegion.getByLabel('临时 RPC 地址').click()
  await expect(networkRegion.getByLabel('临时 RPC 地址')).toBeFocused()
  await expectRegionSize(networkRegion, 526)
  await prepareVisualCapture(page)

  await expect(networkRegion).toHaveScreenshot('network-advanced-rpc.png')
})

test('matches the approved Penpot Dark Network Connection Failure state', async ({ page }) => {
  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    await route.fulfill({ body: 'provider unavailable', status: 503 })
  })
  await page.goto('/')

  const networkRegion = page.getByRole('region', { name: 'Sepolia 网络连接' })
  await expect(page.getByTestId('network-status')).toContainText('连接失败')
  await expect(networkRegion.getByRole('alert')).toContainText('Sepolia 连接不可用')
  await expectRegionSize(networkRegion, 472)
  await prepareVisualCapture(page)

  await expect(networkRegion).toHaveScreenshot('network-connection-failure.png')
})

test('matches the approved Penpot Dark Account Import Error state', async ({ page }) => {
  await installReadyRpc(page)
  await page.goto('/')
  await expect(page.getByTestId('network-status')).toContainText('已连接')

  const accountRegion = page.getByRole('region', { name: '账户会话' })
  await accountRegion.getByLabel('专用测试账户').fill('1'.repeat(64))
  await accountRegion.getByRole('button', { name: '导入账户' }).click()
  await expect(page.getByTestId('account-status')).toContainText('导入错误')
  await expect(page.getByTestId('account-error')).toContainText('0x 开头的 64 位十六进制')
  await expect(accountRegion.getByLabel('专用测试账户')).toHaveValue('')
  await expect(accountRegion.getByLabel('专用测试账户')).toHaveAttribute('aria-invalid', 'true')
  await expectRegionSize(accountRegion, 206)
  await prepareVisualCapture(page)

  await expect(accountRegion).toHaveScreenshot('account-import-error.png')
})
