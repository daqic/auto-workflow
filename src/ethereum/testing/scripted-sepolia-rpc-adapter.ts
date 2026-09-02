import type { SepoliaRpcAdapter } from '../sepolia-rpc-adapter'

interface ChainIdResponse {
  readonly chainId: number
}

interface ErrorResponse {
  readonly error: Error
}

interface EthBalanceResponse {
  readonly balance: bigint
}

export function createScriptedSepoliaRpcAdapter(
  chainIdResponses: readonly (ChainIdResponse | ErrorResponse)[],
  ethBalanceResponses: readonly (EthBalanceResponse | ErrorResponse)[] = [],
): SepoliaRpcAdapter {
  const remainingChainIdResponses = [...chainIdResponses]
  const remainingEthBalanceResponses = [...ethBalanceResponses]

  function takeResponse<T extends ChainIdResponse | EthBalanceResponse>(
    queue: Array<T | ErrorResponse>,
  ): T {
    const response = queue.shift()

    if (!response) {
      throw new Error('Scripted RPC response missing')
    }

    if ('error' in response) {
      throw response.error
    }

    return response
  }

  return {
    async getChainId() {
      return takeResponse(remainingChainIdResponses).chainId
    },
    async getEthBalance() {
      return takeResponse(remainingEthBalanceResponses).balance
    },
  }
}
