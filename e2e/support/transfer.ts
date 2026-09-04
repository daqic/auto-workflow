import { expect, type Page } from '@playwright/test'
import { encodeFunctionResult, keccak256, parseAbi, toBytes, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import {
  defaultRpcUrl,
  fulfillChainId,
  fulfillRpcError,
  fulfillRpcResult,
  readRpcBody,
  readRpcCallData,
  readRpcMethod,
} from './rpc'

const tokenInspectionAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
])

const transferAbi = parseAbi([
  'function transfer(address recipient, uint256 amount) returns (bool)',
])

export const visualTestPrivateKey = keccak256(
  toBytes('frontend-agent-lab:issue-12:visual-transfer-fixture:never-fund'),
)

type TransferReceiptStatus = 'reverted' | 'success'

export interface TransferRpcScenarioOptions {
  readonly broadcast?: 'accept' | 'ambiguous-once' | 'reject'
  readonly initialReceipt?: TransferReceiptStatus | null
  readonly privateKey?: Hex
  readonly receiptGate?: Promise<void>
  readonly simulation?: 'empty' | 'true'
}

export async function installTransferRpcScenario(page: Page, scenario: TransferRpcScenarioOptions) {
  const privateKey = scenario.privateKey ?? generatePrivateKey()
  const accountAddress = privateKeyToAccount(privateKey).address
  const tokenAddress = '0x1111111111111111111111111111111111111111'
  const blockHash = `0x${'1'.repeat(64)}`
  let ethBalanceReads = 0
  let tokenBalanceReads = 0
  let rawTransactionSubmissions = 0
  let transactionCountReads = 0
  let receiptStatus = scenario.initialReceipt ?? null
  let submittedHash = `0x${'0'.repeat(64)}`
  const queriedHashes: string[] = []
  const submittedPayloads: string[] = []

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
                abi: transferAbi,
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
      transactionCountReads += 1
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
      submittedPayloads.push(signedTransaction)
      submittedHash = keccak256(signedTransaction)
      rawTransactionSubmissions += 1

      if (scenario.broadcast === 'ambiguous-once' && rawTransactionSubmissions === 1) {
        await fulfillRpcError(route, -32_000, 'already known')
        return
      }

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
      const transactionHash = typeof params[0] === 'string' ? params[0] : ''
      queriedHashes.push(transactionHash)
      await scenario.receiptGate

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
    queriedHashes: () => [...queriedHashes],
    recipient: '0x2222222222222222222222222222222222222222',
    setReceiptStatus(status: TransferReceiptStatus | null) {
      receiptStatus = status
    },
    submittedPayloads: () => [...submittedPayloads],
    submittedHash: () => submittedHash,
    submissionCount: () => rawTransactionSubmissions,
    tokenAddress,
    transactionCountReads: () => transactionCountReads,
  }
}

export async function openTransferForm(
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

  return page.getByRole('region', { name: '提交 Token 转账' })
}
