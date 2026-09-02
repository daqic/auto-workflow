import type { SepoliaRpcAdapter } from '../sepolia-rpc-adapter'

interface ChainIdResponse {
  readonly chainId: number
}

interface ErrorResponse {
  readonly error: Error
}

export function createScriptedSepoliaRpcAdapter(
  responses: readonly (ChainIdResponse | ErrorResponse)[],
): SepoliaRpcAdapter {
  const remainingResponses = [...responses]

  return {
    async getChainId() {
      const response = remainingResponses.shift()

      if (!response) {
        throw new Error('Scripted RPC response missing')
      }

      if ('error' in response) {
        throw response.error
      }

      return response.chainId
    },
  }
}
