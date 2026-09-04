import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  installTransferRpcScenario,
  openTransferForm,
  visualTestPrivateKey,
  type TransferRpcScenarioOptions,
} from './support/transfer'
import {
  expectInterVariableFont,
  expectRegionSize,
  expectRelativeBox,
  expectSingleLineText,
  prepareVisualCapture,
} from './support/visual'

async function installVisualTransferRpc(
  page: Page,
  options: Omit<TransferRpcScenarioOptions, 'privateKey'> = {},
) {
  return installTransferRpcScenario(page, { ...options, privateKey: visualTestPrivateKey })
}

async function openVisualTransferForm(
  page: Page,
  scenario: Awaited<ReturnType<typeof installTransferRpcScenario>>,
) {
  expect(page.viewportSize()).toEqual({ height: 900, width: 1280 })

  const region = await openTransferForm(page, scenario)
  await expectInterVariableFont(page.getByTestId('account-address'))

  return region
}

async function captureTransferState(page: Page, height: number, name: string) {
  const region = page.getByRole('region', { name: '提交 Token 转账' })
  await expectRegionSize(region, height)
  await prepareVisualCapture(page)
  await expect(region).toHaveScreenshot(name)
}

async function expectSharedTransferFormGeometry(region: Locator) {
  await expectRelativeBox(region, region.getByLabel('收款地址'), {
    height: 40,
    width: 470,
    x: 32,
    y: 186,
  })
  await expectRelativeBox(region, region.getByLabel('展示金额'), {
    height: 40,
    width: 220,
    x: 532,
    y: 186,
  })
  await expectRelativeBox(region, region.getByRole('button', { name: 'Max' }), {
    height: 40,
    width: 54,
    x: 762,
    y: 186,
  })
}

test('matches the approved Penpot Dark Transfer Inline Validation state', async ({ page }) => {
  const scenario = await installVisualTransferRpc(page)
  const region = await openVisualTransferForm(page, scenario)
  await region.getByLabel('收款地址').fill('not-an-address')
  await region.getByRole('button', { name: '检查并提交' }).click()

  await expect(page.getByTestId('transfer-status')).toHaveText('等待提交')
  await expect(page.getByTestId('transfer-recipient-error')).toHaveText(
    '请输入有效的 Ethereum 收款地址。',
  )
  await expect(region.getByLabel('收款地址')).toHaveAttribute('aria-invalid', 'true')
  expect(scenario.submissionCount()).toBe(0)
  await expectSharedTransferFormGeometry(region)
  await expectRelativeBox(region, page.getByTestId('transfer-recipient-error'), {
    height: 19,
    width: 470,
    x: 32,
    y: 234,
  })
  const submitButton = region.getByRole('button', { name: '检查并提交' })
  await expectRelativeBox(region, submitButton, { height: 40, width: 142, x: 674, y: 344 })
  await expectSingleLineText(submitButton)
  await captureTransferState(page, 410, 'transfer-inline-validation.png')
})

test('matches the approved Penpot Dark Transfer Pending Confirmation state', async ({ page }) => {
  let releaseReceipt = () => {}
  const receiptGate = new Promise<void>((resolve) => {
    releaseReceipt = resolve
  })
  const scenario = await installVisualTransferRpc(page, { receiptGate })
  const region = await openVisualTransferForm(page, scenario)
  await region.getByRole('button', { name: '检查并提交' }).click()

  try {
    await expect(page.getByTestId('transfer-status')).toHaveText('已提交 · 确认中')
    await expect(region.getByLabel('收款地址')).toBeDisabled()
    await expect(region.getByLabel('展示金额')).toBeDisabled()
    const pendingButton = region.getByRole('button', { name: '已提交 · 确认中' })
    await expect(pendingButton).toBeDisabled()
    await expectSharedTransferFormGeometry(region)
    await expectRelativeBox(region, pendingButton, {
      height: 40,
      width: 172,
      x: 644,
      y: 306,
    })
    await expect(page.getByText('本地交易哈希', { exact: true })).toBeVisible()
    await expect(page.getByTestId('transaction-hash')).toHaveAttribute(
      'href',
      `https://sepolia.etherscan.io/tx/${scenario.submittedHash()}`,
    )
    await expectInterVariableFont(page.getByTestId('transaction-hash'))
    await expectRelativeBox(region, page.getByTestId('transaction-hash').locator('..'), {
      height: 50,
      width: 816,
      x: 32,
      y: 246,
    })
    await expectSingleLineText(pendingButton)
    await captureTransferState(page, 378, 'transfer-pending-confirmation.png')
  } finally {
    scenario.setReceiptStatus('success')
    releaseReceipt()
  }

  await expect(page.getByTestId('transfer-status')).toHaveText('执行成功')
})

test('matches the approved Penpot Dark Transfer Broadcast Failed state', async ({ page }) => {
  const scenario = await installVisualTransferRpc(page, {
    broadcast: 'reject',
  })
  const region = await openVisualTransferForm(page, scenario)
  await region.getByRole('button', { name: '检查并提交' }).click()

  await expect(page.getByTestId('transfer-status')).toHaveText('广播失败')
  await expect(page.getByTestId('transfer-error')).toContainText('不会自动重试')
  await expect(page.getByTestId('transaction-hash')).toHaveCount(0)
  const newTransferButton = region.getByRole('button', { name: '新建转账' })
  await expect(newTransferButton).toBeEnabled()
  await expectSharedTransferFormGeometry(region)
  await expectRelativeBox(region, page.getByTestId('transfer-error'), {
    height: 72,
    width: 816,
    x: 32,
    y: 246,
  })
  await expectRelativeBox(region, newTransferButton, {
    height: 40,
    width: 112,
    x: 518,
    y: 416,
  })
  await expectRelativeBox(region, region.getByRole('button', { name: '广播失败' }), {
    height: 40,
    width: 170,
    x: 646,
    y: 416,
  })
  await captureTransferState(page, 490, 'transfer-broadcast-failed.png')
})

test('matches the approved Penpot Dark Transfer Unknown Status state', async ({ page }) => {
  await page.clock.install()
  const scenario = await installVisualTransferRpc(page)
  const region = await openVisualTransferForm(page, scenario)
  await region.getByRole('button', { name: '检查并提交' }).click()
  await expect(page.getByTestId('transfer-status')).toHaveText('已提交 · 确认中')
  await page.clock.fastForward(120_000)

  await expect(page.getByTestId('transfer-status')).toHaveText('状态未知')
  await expect(page.getByTestId('transfer-error')).toContainText('等待 120 秒')
  await expect(page.getByTestId('transaction-hash')).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/tx/${scenario.submittedHash()}`,
  )
  const queryButton = region.getByRole('button', { name: '查询原交易' })
  await expect(queryButton).toBeEnabled()
  await expectSharedTransferFormGeometry(region)
  await expectRelativeBox(region, page.getByTestId('transfer-error'), {
    height: 72,
    width: 816,
    x: 32,
    y: 246,
  })
  await expectRelativeBox(region, page.getByTestId('transaction-hash').locator('..'), {
    height: 66,
    width: 816,
    x: 32,
    y: 334,
  })
  await expectRelativeBox(region, queryButton, {
    height: 40,
    width: 132,
    x: 514,
    y: 416,
  })
  await expectRelativeBox(region, region.getByRole('button', { name: '新建转账' }), {
    height: 40,
    width: 112,
    x: 386,
    y: 416,
  })
  await expectRelativeBox(region, region.getByRole('button', { name: '状态未知' }), {
    height: 40,
    width: 154,
    x: 662,
    y: 416,
  })
  await captureTransferState(page, 510, 'transfer-unknown-status.png')
})

test('matches the approved Penpot Dark Transfer Recovery Required state', async ({ page }) => {
  const scenario = await installVisualTransferRpc(page, {
    broadcast: 'ambiguous-once',
  })
  const region = await openVisualTransferForm(page, scenario)
  await region.getByRole('button', { name: '检查并提交' }).click()

  await expect(page.getByTestId('transfer-status')).toHaveText('广播状态不明确')
  await expect(page.getByTestId('transfer-error')).toContainText('可能已到达网络')
  await expect(page.getByTestId('transfer-recovery-warning')).toContainText(
    '恢复完成前不能编辑或提交新转账',
  )
  const queryButton = region.getByRole('button', { name: '查询原交易' })
  const replayButton = region.getByRole('button', { name: '重播原交易' })
  await expect(queryButton).toBeEnabled()
  await expect(replayButton).toBeEnabled()
  await expect(region.getByRole('button', { name: '新建转账' })).toHaveCount(0)
  await expectSharedTransferFormGeometry(region)
  await expectRelativeBox(region, page.getByTestId('transfer-error'), {
    height: 72,
    width: 816,
    x: 32,
    y: 246,
  })
  await expectRelativeBox(region, page.getByTestId('transfer-recovery-warning'), {
    height: 92,
    width: 816,
    x: 32,
    y: 334,
  })
  await expectRelativeBox(region, page.getByTestId('transaction-hash').locator('..'), {
    height: 66,
    width: 816,
    x: 32,
    y: 442,
  })
  await expectRelativeBox(region, queryButton, {
    height: 40,
    width: 132,
    x: 390,
    y: 524,
  })
  await expectRelativeBox(region, replayButton, {
    height: 40,
    width: 132,
    x: 538,
    y: 524,
  })
  await expectRelativeBox(region, region.getByRole('button', { name: '广播状态不明确' }), {
    height: 40,
    width: 130,
    x: 686,
    y: 524,
  })
  await expectSingleLineText(region.getByRole('button', { name: '广播状态不明确' }))
  await captureTransferState(page, 585, 'transfer-recovery-required.png')
})

test('matches the approved Penpot Dark Transfer Success state', async ({ page }) => {
  const scenario = await installVisualTransferRpc(page, { initialReceipt: 'success' })
  const region = await openVisualTransferForm(page, scenario)
  await region.getByRole('button', { name: '检查并提交' }).click()

  await expect(page.getByTestId('transfer-status')).toHaveText('执行成功')
  await expect(page.getByTestId('transaction-hash')).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/tx/${scenario.submittedHash()}`,
  )
  await expect(page.getByTestId('token-balance')).toHaveText('0.2655 DUSD')
  await expect(page.getByTestId('eth-balance')).toHaveText('0.75 ETH')
  const newTransferButton = region.getByRole('button', { name: '新建转账' })
  await expect(newTransferButton).toBeEnabled()
  await expectSharedTransferFormGeometry(region)
  await expectRelativeBox(region, page.getByTestId('transaction-hash').locator('..'), {
    height: 66,
    width: 816,
    x: 32,
    y: 246,
  })
  await expectRelativeBox(region, newTransferButton, {
    height: 40,
    width: 112,
    x: 518,
    y: 328,
  })
  await expectRelativeBox(region, region.getByRole('button', { name: '执行成功' }), {
    height: 40,
    width: 170,
    x: 646,
    y: 328,
  })
  await captureTransferState(page, 462, 'transfer-success.png')
})
