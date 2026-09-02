import { expect, test, type Route } from '@playwright/test'
import { encodeFunctionResult, parseAbi } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const defaultRpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com'
const tokenInspectionAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
])

function readRpcBody(route: Route): Record<string, unknown> {
  const body: unknown = JSON.parse(route.request().postData() ?? '{}')

  return typeof body === 'object' && body !== null ? body : {}
}

function readRequestId(route: Route): unknown {
  return readRpcBody(route).id ?? null
}

async function fulfillChainId(route: Route, chainId: number) {
  await fulfillRpcResult(route, `0x${chainId.toString(16)}`)
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
  const method = readRpcBody(route).method

  return typeof method === 'string' ? method : null
}

function readRpcCallData(route: Route): string | null {
  const params = readRpcBody(route).params

  if (!Array.isArray(params) || typeof params[0] !== 'object' || params[0] === null) {
    return null
  }

  return 'data' in params[0] && typeof params[0].data === 'string' ? params[0].data : null
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

test('queries a compatible Token only on demand and adds its account balance after import', async ({
  page,
}) => {
  const privateKey = generatePrivateKey()
  const tokenAddress = '0x1111111111111111111111111111111111111111'
  let requests = 0

  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    requests += 1
    const method = readRpcMethod(route)

    if (method === 'eth_chainId') {
      await fulfillChainId(route, 11_155_111)
      return
    }

    if (method === 'eth_getCode') {
      await fulfillRpcResult(route, '0x6000')
      return
    }

    if (method === 'eth_getBalance') {
      await fulfillRpcResult(route, '0xde0b6b3a7640000')
      return
    }

    if (method === 'eth_call') {
      const callData = readRpcCallData(route)

      if (callData?.startsWith('0x313ce567')) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({ abi: tokenInspectionAbi, functionName: 'decimals', result: 6 }),
        )
        return
      }

      if (callData?.startsWith('0x06fdde03')) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({
            abi: tokenInspectionAbi,
            functionName: 'name',
            result: 'Demo USD',
          }),
        )
        return
      }

      if (callData?.startsWith('0x95d89b41')) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({
            abi: tokenInspectionAbi,
            functionName: 'symbol',
            result: 'DUSD',
          }),
        )
        return
      }

      if (callData?.startsWith('0x70a08231')) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({
            abi: tokenInspectionAbi,
            functionName: 'balanceOf',
            result: 1_234_500n,
          }),
        )
        return
      }
    }

    await route.abort('failed')
  })

  await page.goto('/')
  await expect(page.getByTestId('network-status')).toContainText('已连接')

  await page.getByLabel('Token contract address').fill(tokenAddress)
  expect(requests).toBe(1)
  await expect(page.getByTestId('token-empty-state')).toContainText('尚未查询')

  await page.getByRole('button', { name: '查询 Token' }).click()
  await expect(page.getByTestId('token-compatibility')).toContainText('兼容性检查通过')
  await expect(page.getByTestId('token-name')).toHaveText('Demo USD')
  await expect(page.getByTestId('token-symbol')).toHaveText('DUSD')
  await expect(page.getByTestId('token-decimals')).toHaveText('6')
  await expect(page.getByTestId('token-balance')).toContainText('余额尚不可用')
  await expect(page.getByTestId('token-address')).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/token/${tokenAddress}`,
  )
  await expect(page.getByTestId('token-address')).toHaveAttribute('target', '_blank')

  await page.getByLabel('专用测试账户').fill(privateKey)
  await page.getByRole('button', { name: '导入账户' }).click()
  await expect(page.getByTestId('token-balance')).toHaveText('1.2345 DUSD')

  const persistedBrowserState = await page.evaluate(() => ({
    localStorageValues: Object.values(localStorage),
    sessionStorageValues: Object.values(sessionStorage),
    url: window.location.href,
  }))
  expect(JSON.stringify(persistedBrowserState)).not.toContain(tokenAddress)

  await page.getByRole('button', { name: '锁定', exact: true }).click()
  await expect(page.getByTestId('token-compatibility')).toContainText('兼容性检查通过')
  await expect(page.getByTestId('token-balance')).toContainText('余额尚不可用')
})

test('shows a specific Token error for an address without contract bytecode', async ({ page }) => {
  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    const method = readRpcMethod(route)

    if (method === 'eth_chainId') {
      await fulfillChainId(route, 11_155_111)
      return
    }

    if (method === 'eth_getCode') {
      await fulfillRpcResult(route, '0x')
      return
    }

    await route.abort('failed')
  })

  await page.goto('/')
  await page.getByLabel('Token contract address').fill('0x2222222222222222222222222222222222222222')
  await page.getByRole('button', { name: '查询 Token' }).click()

  await expect(page.getByTestId('token-error')).toContainText('未检测到合约字节码')
  await expect(page.getByTestId('token-compatibility')).toHaveCount(0)
})
