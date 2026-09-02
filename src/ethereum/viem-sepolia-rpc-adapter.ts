import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

import type { SepoliaRpcAdapter } from './sepolia-rpc-adapter'

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
  }
}
