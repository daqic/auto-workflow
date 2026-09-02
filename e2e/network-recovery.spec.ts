import { expect, test, type Route } from '@playwright/test'

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
