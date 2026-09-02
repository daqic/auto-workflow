import { expect, test, type Page, type Route } from '@playwright/test'
import { encodeFunctionResult, keccak256, parseAbi } from 'viem'
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

async function fulfillRpcResult(route: Route, result: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      id: readRequestId(route),
      jsonrpc: '2.0',
      result,
    }),
  })
}

async function fulfillRpcError(route: Route, code: number, message: string) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      error: { code, message },
      id: readRequestId(route),
      jsonrpc: '2.0',
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

type TransferReceiptStatus = 'reverted' | 'success'

interface TransferRpcScenario {
  readonly broadcast?: 'accept' | 'reject'
  readonly simulation: 'empty' | 'true'
  readonly initialReceipt: TransferReceiptStatus | null
}

async function installTransferRpcScenario(page: Page, scenario: TransferRpcScenario) {
  const privateKey = generatePrivateKey()
  const accountAddress = privateKeyToAccount(privateKey).address
  const tokenAddress = '0x1111111111111111111111111111111111111111'
  const blockHash = `0x${'1'.repeat(64)}`
  let ethBalanceReads = 0
  let tokenBalanceReads = 0
  let rawTransactionSubmissions = 0
  let submittedHash = `0x${'0'.repeat(64)}`
  let receiptStatus = scenario.initialReceipt

  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    const body = readRpcBody(route)
    const method = readRpcMethod(route)
    const params = Array.isArray(body.params) ? body.params : []

    if (method === 'eth_chainId') {
      await fulfillChainId(route, 11_155_111)
      return
    }

    if (method === 'eth_getBalance') {
      const balances = [1_000_000_000_000_000_000n, 750_000_000_000_000_000n]
      const balance = balances[ethBalanceReads] ?? balances.at(-1) ?? 0n
      ethBalanceReads += 1
      await fulfillRpcResult(route, `0x${balance.toString(16)}`)
      return
    }

    if (method === 'eth_getCode') {
      await fulfillRpcResult(route, '0x6000')
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
        const balances = [1_500_000n, 265_500n]
        const balance = balances[tokenBalanceReads] ?? balances.at(-1) ?? 0n
        tokenBalanceReads += 1
        await fulfillRpcResult(
          route,
          encodeFunctionResult({
            abi: tokenInspectionAbi,
            functionName: 'balanceOf',
            result: balance,
          }),
        )
        return
      }

      if (callData?.startsWith('0xa9059cbb')) {
        await fulfillRpcResult(
          route,
          scenario.simulation === 'empty'
            ? '0x'
            : encodeFunctionResult({
                abi: parseAbi([
                  'function transfer(address recipient, uint256 amount) returns (bool)',
                ]),
                functionName: 'transfer',
                result: true,
              }),
        )
        return
      }
    }

    if (method === 'eth_fillTransaction') {
      await fulfillRpcError(route, -32_601, 'Method not found')
      return
    }

    if (method === 'eth_getTransactionCount') {
      await fulfillRpcResult(route, '0x0')
      return
    }

    if (method === 'eth_getBlockByNumber') {
      await fulfillRpcResult(route, {
        baseFeePerGas: '0x3b9aca00',
        difficulty: '0x0',
        extraData: '0x',
        gasLimit: '0x1c9c380',
        gasUsed: '0x5208',
        hash: blockHash,
        logsBloom: `0x${'0'.repeat(512)}`,
        miner: '0x0000000000000000000000000000000000000000',
        mixHash: `0x${'0'.repeat(64)}`,
        nonce: '0x0000000000000000',
        number: '0x10',
        parentHash: `0x${'2'.repeat(64)}`,
        receiptsRoot: `0x${'3'.repeat(64)}`,
        sha3Uncles: `0x${'4'.repeat(64)}`,
        size: '0x100',
        stateRoot: `0x${'5'.repeat(64)}`,
        timestamp: '0x1',
        totalDifficulty: '0x0',
        transactions: [],
        transactionsRoot: `0x${'6'.repeat(64)}`,
        uncles: [],
      })
      return
    }

    if (method === 'eth_blockNumber') {
      await fulfillRpcResult(route, '0x10')
      return
    }

    if (method === 'eth_maxPriorityFeePerGas') {
      await fulfillRpcResult(route, '0x3b9aca00')
      return
    }

    if (method === 'eth_estimateGas') {
      await fulfillRpcResult(route, '0xc350')
      return
    }

    if (method === 'eth_sendRawTransaction') {
      const signedTransaction = typeof params[0] === 'string' ? params[0] : '0x'
      submittedHash = keccak256(signedTransaction)
      rawTransactionSubmissions += 1

      if (scenario.broadcast === 'reject') {
        await fulfillRpcError(route, -32_000, 'insufficient funds for gas * price + value')
        return
      }

      await fulfillRpcResult(route, submittedHash)
      return
    }

    if (method === 'eth_getTransactionByHash') {
      await fulfillRpcResult(route, null)
      return
    }

    if (method === 'eth_getTransactionReceipt') {
      if (!receiptStatus) {
        await fulfillRpcResult(route, null)
        return
      }

      await fulfillRpcResult(route, {
        blockHash,
        blockNumber: '0x10',
        contractAddress: null,
        cumulativeGasUsed: '0xc350',
        effectiveGasPrice: '0x77359400',
        from: accountAddress,
        gasUsed: '0xc350',
        logs: [],
        logsBloom: `0x${'0'.repeat(512)}`,
        status: receiptStatus === 'success' ? '0x1' : '0x0',
        to: tokenAddress,
        transactionHash: submittedHash,
        transactionIndex: '0x0',
        type: '0x2',
      })
      return
    }

    await route.abort('failed')
  })

  return {
    privateKey,
    recipient: '0x2222222222222222222222222222222222222222',
    setReceiptStatus(status: TransferReceiptStatus | null) {
      receiptStatus = status
    },
    submittedHash: () => submittedHash,
    submissionCount: () => rawTransactionSubmissions,
    tokenAddress,
  }
}

async function openTransferForm(
  page: Page,
  scenario: Awaited<ReturnType<typeof installTransferRpcScenario>>,
) {
  await page.goto('/')
  await page.getByLabel('专用测试账户').fill(scenario.privateKey)
  await page.getByRole('button', { name: '导入账户' }).click()
  await page.getByLabel('Token contract address').fill(scenario.tokenAddress)
  await page.getByRole('button', { name: '查询 Token' }).click()
  await expect(page.getByTestId('token-balance')).toHaveText('1.5 DUSD')
  await page.getByLabel('收款地址').fill(scenario.recipient)
  await page.getByLabel('展示金额').fill('1')
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

test('submits one raw Token transfer and shows success only after a confirmed receipt', async ({
  page,
}) => {
  const privateKey = generatePrivateKey()
  const accountAddress = privateKeyToAccount(privateKey).address
  const tokenAddress = '0x1111111111111111111111111111111111111111'
  const recipient = '0x2222222222222222222222222222222222222222'
  const blockHash = `0x${'1'.repeat(64)}`
  let ethBalanceReads = 0
  let tokenBalanceReads = 0
  let rawTransactionSubmissions = 0
  let submittedHash = `0x${'0'.repeat(64)}`

  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    const body = readRpcBody(route)
    const method = readRpcMethod(route)
    const params = Array.isArray(body.params) ? body.params : []

    if (method === 'eth_chainId') {
      await fulfillChainId(route, 11_155_111)
      return
    }

    if (method === 'eth_getBalance') {
      const balances = [1_000_000_000_000_000_000n, 750_000_000_000_000_000n]
      const balance = balances[ethBalanceReads]
      ethBalanceReads += 1
      await fulfillRpcResult(route, `0x${(balance ?? 0n).toString(16)}`)
      return
    }

    if (method === 'eth_getCode') {
      await fulfillRpcResult(route, '0x6000')
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
        const balances = [1_500_000n, 265_500n]
        const balance = balances[tokenBalanceReads]
        tokenBalanceReads += 1
        await fulfillRpcResult(
          route,
          encodeFunctionResult({
            abi: tokenInspectionAbi,
            functionName: 'balanceOf',
            result: balance ?? 0n,
          }),
        )
        return
      }

      if (callData?.startsWith('0xa9059cbb')) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({
            abi: parseAbi(['function transfer(address recipient, uint256 amount) returns (bool)']),
            functionName: 'transfer',
            result: true,
          }),
        )
        return
      }
    }

    if (method === 'eth_fillTransaction') {
      await fulfillRpcError(route, -32_601, 'Method not found')
      return
    }

    if (method === 'eth_getTransactionCount') {
      await fulfillRpcResult(route, '0x0')
      return
    }

    if (method === 'eth_getBlockByNumber') {
      await fulfillRpcResult(route, {
        baseFeePerGas: '0x3b9aca00',
        difficulty: '0x0',
        extraData: '0x',
        gasLimit: '0x1c9c380',
        gasUsed: '0x5208',
        hash: blockHash,
        logsBloom: `0x${'0'.repeat(512)}`,
        miner: '0x0000000000000000000000000000000000000000',
        mixHash: `0x${'0'.repeat(64)}`,
        nonce: '0x0000000000000000',
        number: '0x10',
        parentHash: `0x${'2'.repeat(64)}`,
        receiptsRoot: `0x${'3'.repeat(64)}`,
        sha3Uncles: `0x${'4'.repeat(64)}`,
        size: '0x100',
        stateRoot: `0x${'5'.repeat(64)}`,
        timestamp: '0x1',
        totalDifficulty: '0x0',
        transactions: [],
        transactionsRoot: `0x${'6'.repeat(64)}`,
        uncles: [],
      })
      return
    }

    if (method === 'eth_maxPriorityFeePerGas') {
      await fulfillRpcResult(route, '0x3b9aca00')
      return
    }

    if (method === 'eth_estimateGas') {
      await fulfillRpcResult(route, '0xc350')
      return
    }

    if (method === 'eth_sendRawTransaction') {
      const signedTransaction = typeof params[0] === 'string' ? params[0] : '0x'
      submittedHash = keccak256(signedTransaction)
      rawTransactionSubmissions += 1
      await new Promise((resolve) => setTimeout(resolve, 300))
      await fulfillRpcResult(route, submittedHash)
      return
    }

    if (method === 'eth_getTransactionReceipt') {
      await fulfillRpcResult(route, {
        blockHash,
        blockNumber: '0x10',
        contractAddress: null,
        cumulativeGasUsed: '0xc350',
        effectiveGasPrice: '0x77359400',
        from: accountAddress,
        gasUsed: '0xc350',
        logs: [],
        logsBloom: `0x${'0'.repeat(512)}`,
        status: '0x1',
        to: tokenAddress,
        transactionHash: submittedHash,
        transactionIndex: '0x0',
        type: '0x2',
      })
      return
    }

    await route.abort('failed')
  })

  await page.goto('/')
  await page.getByLabel('专用测试账户').fill(privateKey)
  await page.getByRole('button', { name: '导入账户' }).click()
  await page.getByLabel('Token contract address').fill(tokenAddress)
  await page.getByRole('button', { name: '查询 Token' }).click()
  await expect(page.getByTestId('token-balance')).toHaveText('1.5 DUSD')

  await page.getByLabel('收款地址').fill(recipient)
  await page.getByLabel('展示金额').fill('1.2345')
  const submitButton = page.getByRole('button', { name: '检查并提交' })
  await submitButton.click()

  await expect(page.getByLabel('收款地址')).toBeDisabled()
  await expect(page.getByLabel('展示金额')).toBeDisabled()
  await expect(page.getByRole('button', { name: /提交中|已提交 · 确认中/ })).toBeDisabled()
  await page.getByTestId('token-transfer-form').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await expect(page.getByTestId('transfer-status')).toContainText('执行成功')
  await expect(page.getByTestId('transaction-hash')).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/tx/${submittedHash}`,
  )
  await expect(page.getByTestId('token-balance')).toHaveText('0.2655 DUSD')
  await expect(page.getByTestId('eth-balance')).toHaveText('0.75 ETH')
  expect(rawTransactionSubmissions).toBe(1)
})

test('stops an undecodable transfer simulation before signing and broadcast', async ({ page }) => {
  const scenario = await installTransferRpcScenario(page, {
    initialReceipt: null,
    simulation: 'empty',
  })
  await openTransferForm(page, scenario)

  await page.getByRole('button', { name: '检查并提交' }).click()

  await expect(page.getByTestId('transfer-error')).toContainText('模拟未返回 true')
  await expect(page.getByLabel('收款地址')).toBeEnabled()
  await expect(page.getByLabel('展示金额')).toBeEnabled()
  expect(scenario.submissionCount()).toBe(0)
  await expect(page.getByTestId('transaction-hash')).toHaveCount(0)
})

test('shows a reverted receipt as execution failed and retains the original hash', async ({
  page,
}) => {
  const scenario = await installTransferRpcScenario(page, {
    initialReceipt: 'reverted',
    simulation: 'true',
  })
  await openTransferForm(page, scenario)

  await page.getByRole('button', { name: '检查并提交' }).click()

  await expect(page.getByTestId('transfer-status')).toHaveText('执行失败')
  await expect(page.getByTestId('transfer-error')).toContainText('链上执行失败')
  await expect(page.getByTestId('transaction-hash')).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/tx/${scenario.submittedHash()}`,
  )
  await expect(page.getByLabel('收款地址')).toBeDisabled()
  await expect(page.getByLabel('展示金额')).toBeDisabled()
  await expect(page.getByLabel('展示金额')).toHaveValue('')
  expect(scenario.submissionCount()).toBe(1)

  await page.getByRole('button', { name: '新建转账' }).click()
  await expect(page.getByLabel('收款地址')).toBeEnabled()
  await expect(page.getByLabel('展示金额')).toBeEnabled()
  await expect(page.getByTestId('transaction-hash')).toHaveCount(0)
})

test('shows a confirmed RPC rejection as broadcast failed without retrying', async ({ page }) => {
  const scenario = await installTransferRpcScenario(page, {
    broadcast: 'reject',
    initialReceipt: null,
    simulation: 'true',
  })
  await openTransferForm(page, scenario)

  await page.getByRole('button', { name: '检查并提交' }).click()

  await expect(page.getByTestId('transfer-status')).toHaveText('广播失败')
  await expect(page.getByTestId('transfer-error')).toContainText('不会自动重试')
  await expect(page.getByTestId('transaction-hash')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建转账' })).toBeEnabled()
  expect(scenario.submissionCount()).toBe(1)
})

test('times out after 120 seconds and manually queries the same transaction hash', async ({
  page,
}) => {
  await page.clock.install()
  const scenario = await installTransferRpcScenario(page, {
    initialReceipt: null,
    simulation: 'true',
  })
  await openTransferForm(page, scenario)

  await page.getByRole('button', { name: '检查并提交' }).click()
  await expect(page.getByTestId('transfer-status')).toContainText('确认中')
  await page.clock.fastForward(120_000)

  await expect(page.getByTestId('transfer-status')).toHaveText('状态未知')
  await expect(page.getByTestId('transfer-error')).toContainText('等待 120 秒')
  const originalHash = scenario.submittedHash()
  await expect(page.getByTestId('transaction-hash')).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/tx/${originalHash}`,
  )
  await expect(page.getByLabel('收款地址')).toBeDisabled()
  await expect(page.getByLabel('展示金额')).toBeDisabled()
  expect(scenario.submissionCount()).toBe(1)

  scenario.setReceiptStatus('success')
  await page.getByRole('button', { name: '查询原交易' }).click()
  await expect(page.getByTestId('transfer-status')).toHaveText('执行成功')
  await expect(page.getByTestId('transaction-hash')).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/tx/${originalHash}`,
  )
  expect(scenario.submissionCount()).toBe(1)
})
