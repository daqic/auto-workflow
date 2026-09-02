import { createPublicClient, encodeFunctionData, http, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'

import type { SepoliaRpcAdapter } from './sepolia-rpc-adapter'

const ERC20_INSPECTION_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function transfer(address recipient, uint256 amount) returns (bool)',
])

export function createViemSepoliaRpcAdapter(): SepoliaRpcAdapter {
  function createClient(rpcUrl: string) {
    return createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl, { retryCount: 0 }),
    })
  }

  return {
    async getChainId(rpcUrl) {
      return createClient(rpcUrl).getChainId()
    },
    async getEthBalance(rpcUrl, address) {
      return createClient(rpcUrl).getBalance({ address })
    },
    async getBytecode(rpcUrl, address) {
      return createClient(rpcUrl).getBytecode({ address })
    },
    async getTokenBalance(rpcUrl, tokenAddress, accountAddress) {
      return createClient(rpcUrl).readContract({
        abi: ERC20_INSPECTION_ABI,
        address: tokenAddress,
        args: [accountAddress],
        functionName: 'balanceOf',
      })
    },
    async getTokenDecimals(rpcUrl, tokenAddress) {
      return createClient(rpcUrl).readContract({
        abi: ERC20_INSPECTION_ABI,
        address: tokenAddress,
        functionName: 'decimals',
      })
    },
    async getTokenName(rpcUrl, tokenAddress) {
      return createClient(rpcUrl).readContract({
        abi: ERC20_INSPECTION_ABI,
        address: tokenAddress,
        functionName: 'name',
      })
    },
    async getTokenSymbol(rpcUrl, tokenAddress) {
      return createClient(rpcUrl).readContract({
        abi: ERC20_INSPECTION_ABI,
        address: tokenAddress,
        functionName: 'symbol',
      })
    },
    async prepareTokenTransfer(rpcUrl, request) {
      return createClient(rpcUrl).prepareTransactionRequest({
        account: request.accountAddress,
        data: encodeFunctionData({
          abi: ERC20_INSPECTION_ABI,
          args: [request.recipient, request.amount],
          functionName: 'transfer',
        }),
        to: request.tokenAddress,
        type: 'eip1559',
        value: 0n,
      })
    },
    async sendRawTransaction(rpcUrl, signedTransaction) {
      return createClient(rpcUrl).sendRawTransaction({ serializedTransaction: signedTransaction })
    },
    async simulateTokenTransfer(rpcUrl, request) {
      const simulation = await createClient(rpcUrl).simulateContract({
        abi: ERC20_INSPECTION_ABI,
        account: request.accountAddress,
        address: request.tokenAddress,
        args: [request.recipient, request.amount],
        functionName: 'transfer',
      })

      return simulation.result
    },
    async waitForTransactionReceipt(rpcUrl, transactionHash) {
      const receipt = await createClient(rpcUrl).waitForTransactionReceipt({
        checkReplacement: false,
        confirmations: 1,
        hash: transactionHash,
        timeout: 120_000,
      })

      return { confirmations: 1, status: receipt.status }
    },
  }
}
