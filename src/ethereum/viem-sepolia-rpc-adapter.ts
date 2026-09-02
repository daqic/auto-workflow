import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

import type { SepoliaRpcAdapter } from './sepolia-rpc-adapter'

export function createViemSepoliaRpcAdapter(): SepoliaRpcAdapter {
  return {
    async getChainId(rpcUrl) {
      const client = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl, { retryCount: 0 }),
      })

      return client.getChainId()
    },
  }
}
