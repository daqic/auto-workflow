import type { Page, Route } from '@playwright/test'
import { encodeFunctionResult, getAbiItem, parseAbi, toFunctionSelector } from 'viem'

const tokenInspectionAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
])

const tokenInspectionSelectors = {
  decimals: toFunctionSelector(getAbiItem({ abi: tokenInspectionAbi, name: 'decimals' })),
  name: toFunctionSelector(getAbiItem({ abi: tokenInspectionAbi, name: 'name' })),
  symbol: toFunctionSelector(getAbiItem({ abi: tokenInspectionAbi, name: 'symbol' })),
}

export const defaultRpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com'

export async function installReadyRpc(page: Page) {
  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    await fulfillChainId(route, 11_155_111)
  })
}

interface TokenInspectionRpcOptions {
  readonly bytecodeGate?: Promise<void>
  readonly decimals?: number
  readonly name?: string
  readonly symbol?: string
}

export async function installTokenInspectionRpc(
  page: Page,
  {
    bytecodeGate,
    decimals = 6,
    name = 'Demo USD',
    symbol = 'DUSD',
  }: TokenInspectionRpcOptions = {},
) {
  let tokenRequestCount = 0

  await page.route(`${defaultRpcUrl}/**`, async (route) => {
    const method = readRpcMethod(route)

    if (method === 'eth_chainId') {
      await fulfillChainId(route, 11_155_111)
      return
    }

    tokenRequestCount += 1

    if (method === 'eth_getCode') {
      await bytecodeGate
      await fulfillRpcResult(route, '0x6000')
      return
    }

    if (method === 'eth_call') {
      const callData = readRpcCallData(route)

      if (callData?.startsWith(tokenInspectionSelectors.decimals)) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({
            abi: tokenInspectionAbi,
            functionName: 'decimals',
            result: decimals,
          }),
        )
        return
      }

      if (callData?.startsWith(tokenInspectionSelectors.name)) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({ abi: tokenInspectionAbi, functionName: 'name', result: name }),
        )
        return
      }

      if (callData?.startsWith(tokenInspectionSelectors.symbol)) {
        await fulfillRpcResult(
          route,
          encodeFunctionResult({ abi: tokenInspectionAbi, functionName: 'symbol', result: symbol }),
        )
        return
      }
    }

    await route.abort('failed')
  })

  return {
    tokenRequestCount: () => tokenRequestCount,
  }
}

export function readRpcBody(route: Route): Record<string, unknown> {
  const body: unknown = JSON.parse(route.request().postData() ?? '{}')

  return typeof body === 'object' && body !== null ? body : {}
}

function readRequestId(route: Route): unknown {
  return readRpcBody(route).id ?? null
}

export async function fulfillChainId(route: Route, chainId: number) {
  await fulfillRpcResult(route, `0x${chainId.toString(16)}`)
}

export async function fulfillRpcResult(route: Route, result: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      id: readRequestId(route),
      jsonrpc: '2.0',
      result,
    }),
  })
}

export async function fulfillRpcError(route: Route, code: number, message: string) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      error: { code, message },
      id: readRequestId(route),
      jsonrpc: '2.0',
    }),
  })
}

export function readRpcMethod(route: Route): string | null {
  const method = readRpcBody(route).method

  return typeof method === 'string' ? method : null
}

export function readRpcCallData(route: Route): string | null {
  const params = readRpcBody(route).params

  if (!Array.isArray(params) || typeof params[0] !== 'object' || params[0] === null) {
    return null
  }

  return 'data' in params[0] && typeof params[0].data === 'string' ? params[0].data : null
}
