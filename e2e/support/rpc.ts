import type { Route } from '@playwright/test'

export const defaultRpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com'

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
