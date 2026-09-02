import { expect, test, type Route } from '@playwright/test'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const defaultRpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com'

function readRequestId(route: Route): unknown {
  const body: unknown = JSON.parse(route.request().postData() ?? '{}')

  if (typeof body !== 'object' || body === null || !('id' in body)) {
    return null
  }

  return body.id
}

async function fulfillChainId(route: Route, chainId: number) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      id: readRequestId(route),
      jsonrpc: '2.0',
      result: `0x${chainId.toString(16)}`,
    }),
  })
}

async function fulfillRpcResult(route: Route, result: string) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      id: readRequestId(route),
      jsonrpc: '2.0',
      result,
    }),
  })
}

function readRpcMethod(route: Route): string | null {
  const body: unknown = JSON.parse(route.request().postData() ?? '{}')

  if (typeof body !== 'object' || body === null || !('method' in body)) {
    return null
  }

  return typeof body.method === 'string' ? body.method : null
}

test('validates the default production RPC path before enabling Sepolia actions', async ({
  page,
}) => {
  let requests = 0
  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    requests += 1
    await fulfillChainId(route, 11_155_111)
  })

  await page.goto('/')

  await expect(page).toHaveTitle('Ethereum Sepolia 工具 Demo')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ethereum Sepolia 工具 Demo')
  await expect(page.getByTestId('network-status')).toContainText('已连接')
  await expect(page.getByTestId('active-rpc-url')).toContainText(defaultRpcUrl)
  expect(requests).toBe(1)
})

test('recovers manually and preserves the active RPC until an override validates', async ({
  page,
}) => {
  let defaultRequests = 0
  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    defaultRequests += 1

    if (defaultRequests === 1) {
      await route.fulfill({ status: 503, body: 'provider unavailable' })
      return
    }

    await fulfillChainId(route, 11_155_111)
  })
  await page.route('https://wrong-chain.example/**', (route) => fulfillChainId(route, 1))
  await page.route('https://working-sepolia.example/**', (route) =>
    fulfillChainId(route, 11_155_111),
  )

  await page.goto('/')

  await expect(page.getByRole('alert')).toContainText('链上操作暂不可用')
  await expect(page.getByLabel('专用测试账户')).toBeDisabled()
  await expect(page.getByTestId('account-disabled-reason')).toContainText('链上操作暂不可用')
  expect(defaultRequests).toBe(1)

  await page.getByRole('button', { name: '重新连接' }).click()
  await expect(page.getByTestId('network-status')).toContainText('已连接')
  expect(defaultRequests).toBe(2)

  await page.getByText('高级 RPC 设置').click()
  await page.getByLabel('临时 RPC 地址').fill('https://wrong-chain.example/rpc')
  await page.getByRole('button', { name: '验证并应用' }).click()
  await expect(page.getByTestId('rpc-override-error')).toContainText('已保留当前 RPC')
  await expect(page.getByTestId('active-rpc-url')).toContainText(defaultRpcUrl)

  await page.getByLabel('临时 RPC 地址').fill('https://working-sepolia.example/rpc')
  await page.getByRole('button', { name: '验证并应用' }).click()
  await expect(page.getByTestId('active-rpc-url')).toContainText(
    'https://working-sepolia.example/rpc',
  )

  const persistedBrowserState = await page.evaluate(() => ({
    localStorageValues: Object.values(localStorage),
    sessionStorageValues: Object.values(sessionStorage),
    url: window.location.href,
  }))
  expect(JSON.stringify(persistedBrowserState)).not.toContain('working-sepolia.example')
})

test('keeps a dedicated test account only for the active browser session', async ({ page }) => {
  const firstPrivateKey = generatePrivateKey()
  const secondPrivateKey = generatePrivateKey()
  const firstAddress = privateKeyToAccount(firstPrivateKey).address
  const secondAddress = privateKeyToAccount(secondPrivateKey).address
  const balances = [
    1_500_000_000_000_000_000n,
    2_000_000_000_000_000_000n,
    3_000_000_000_000_000_000n,
  ]

  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    const method = readRpcMethod(route)

    if (method === 'eth_chainId') {
      await fulfillChainId(route, 11_155_111)
      return
    }

    if (method === 'eth_getBalance') {
      const balance = balances.shift()

      if (balance === undefined) {
        throw new Error('Unexpected extra ETH balance request')
      }

      await fulfillRpcResult(route, `0x${balance.toString(16)}`)
      return
    }

    await route.abort('failed')
  })

  await page.goto('/')

  const privateKeyInput = page.getByLabel('专用测试账户')
  await expect(privateKeyInput).toHaveAttribute('type', 'password')
  await privateKeyInput.fill(firstPrivateKey)
  await page.getByRole('button', { name: '临时显示私钥' }).click()
  await expect(privateKeyInput).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: '隐藏私钥' }).click()
  await page.getByRole('button', { name: '导入账户' }).click()

  const firstAccountLink = page.getByTestId('account-address')
  await expect(firstAccountLink).toHaveText(firstAddress)
  await expect(firstAccountLink).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/address/${firstAddress}`,
  )
  await expect(firstAccountLink).toHaveAttribute('target', '_blank')
  await expect(page.getByTestId('eth-balance')).toHaveText('1.5 ETH')

  await page.getByRole('button', { name: '刷新余额' }).click()
  await expect(page.getByTestId('eth-balance')).toHaveText('2 ETH')

  await page.getByRole('button', { name: '导入新账户' }).click()
  await page.getByLabel('专用测试账户').fill(secondPrivateKey)
  await page.getByRole('button', { name: '导入账户' }).click()
  await expect(page.getByTestId('account-address')).toHaveText(secondAddress)
  await expect(page.getByTestId('eth-balance')).toHaveText('3 ETH')

  const persistedBrowserState = await page.evaluate(() => ({
    localStorageValues: Object.values(localStorage),
    sessionStorageValues: Object.values(sessionStorage),
    url: window.location.href,
  }))
  expect(JSON.stringify(persistedBrowserState)).not.toContain(firstPrivateKey)
  expect(JSON.stringify(persistedBrowserState)).not.toContain(secondPrivateKey)
  expect(JSON.stringify(persistedBrowserState)).not.toContain(secondAddress)

  await page.getByRole('button', { name: '锁定', exact: true }).click()
  await expect(page.getByTestId('account-status')).toContainText('已锁定')
  await expect(page.getByLabel('专用测试账户')).toHaveValue('')

  await page.reload()
  await expect(page.getByTestId('account-status')).toContainText('已锁定')
  await expect(page.getByLabel('专用测试账户')).toHaveValue('')
})

test('clears and safely rejects unsupported private-key input', async ({ page }) => {
  const privateKeyWithoutPrefix = generatePrivateKey().slice(2)
  await page.route(`${defaultRpcUrl}/**`, (route) => fulfillChainId(route, 11_155_111))
  await page.goto('/')

  await page.getByLabel('专用测试账户').fill(privateKeyWithoutPrefix)
  await page.getByRole('button', { name: '导入账户' }).click()

  await expect(page.getByTestId('account-status')).toContainText('导入错误')
  await expect(page.getByTestId('account-error')).toContainText('0x 开头的 64 位十六进制')
  await expect(page.getByTestId('account-error')).not.toContainText(privateKeyWithoutPrefix)
  await expect(page.getByLabel('专用测试账户')).toHaveValue('')
})
