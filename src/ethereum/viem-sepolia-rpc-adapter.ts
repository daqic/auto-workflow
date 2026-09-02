import { createPublicClient, http, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'

import type { SepoliaRpcAdapter } from './sepolia-rpc-adapter'

const ERC20_INSPECTION_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
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
  }
}
