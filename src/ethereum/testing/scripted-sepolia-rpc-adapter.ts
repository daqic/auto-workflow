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

interface ScriptedSepoliaRpcResponses {
  readonly chainId: readonly (ChainIdResponse | ErrorResponse)[]
  readonly ethBalance?: readonly (EthBalanceResponse | ErrorResponse)[]
}

function isLegacyChainIdScript(
  responses: readonly (ChainIdResponse | ErrorResponse)[] | ScriptedSepoliaRpcResponses,
): responses is readonly (ChainIdResponse | ErrorResponse)[] {
  return Array.isArray(responses)
}

export function createScriptedSepoliaRpcAdapter(
  responses: readonly (ChainIdResponse | ErrorResponse)[] | ScriptedSepoliaRpcResponses,
): SepoliaRpcAdapter {
  const isLegacyScript = isLegacyChainIdScript(responses)
  const remainingChainIdResponses = [...(isLegacyScript ? responses : responses.chainId)]
  const remainingEthBalanceResponses = [...(isLegacyScript ? [] : (responses.ethBalance ?? []))]

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
