import type { SepoliaRpcAdapter } from './sepolia-rpc-adapter'

export const DEFAULT_SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
export const SEPOLIA_CHAIN_ID = 11_155_111

type NetworkStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface NetworkProblem {
  readonly kind: 'unreachable' | 'wrong-chain' | 'invalid-url'
  readonly message: string
}

const UNREACHABLE_PROBLEM = Object.freeze({
  kind: 'unreachable' as const,
  message: '无法连接 Ethereum Sepolia RPC。链上操作暂不可用，请手动重连或更换 RPC。',
})

const WRONG_CHAIN_PROBLEM = Object.freeze({
  kind: 'wrong-chain' as const,
  message: 'RPC 连接的网络不是 Ethereum Sepolia（chain ID 必须为 11155111）。',
})

const CANDIDATE_WRONG_CHAIN_PROBLEM = Object.freeze({
  kind: 'wrong-chain' as const,
  message: '候选 RPC 不是 Ethereum Sepolia，已保留当前 RPC。',
})

const INVALID_RPC_URL_PROBLEM = Object.freeze({
  kind: 'invalid-url' as const,
  message: '请输入有效的 HTTP(S) RPC 地址。',
})

const CANDIDATE_UNREACHABLE_PROBLEM = Object.freeze({
  kind: 'unreachable' as const,
  message: '候选 RPC 无法连接，已保留当前 RPC。',
})

interface NetworkSnapshot {
  readonly activeRpcUrl: string
  readonly canUseChainActions: boolean
  readonly chainId: number | null
  readonly connectionError: NetworkProblem | null
  readonly isValidatingRpc: boolean
  readonly rpcOverrideError: NetworkProblem | null
  readonly status: NetworkStatus
}

export interface EthereumToolSnapshot {
  readonly network: NetworkSnapshot
}

export interface EthereumTool {
  read(): EthereumToolSnapshot
  subscribe(listener: (snapshot: EthereumToolSnapshot) => void): () => void
  readonly network: {
    applyRpcOverride(candidateRpcUrl: string): Promise<boolean>
    initialize(): Promise<void>
    reconnect(): Promise<void>
  }
}

function freezeSnapshot(network: NetworkSnapshot): EthereumToolSnapshot {
  return Object.freeze({ network: Object.freeze(network) })
}

export function createEthereumTool({ rpc }: { rpc: SepoliaRpcAdapter }): EthereumTool {
  let snapshot = freezeSnapshot({
    activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
    canUseChainActions: false,
    chainId: null,
    connectionError: null,
    isValidatingRpc: false,
    rpcOverrideError: null,
    status: 'idle',
  })
  const listeners = new Set<(snapshot: EthereumToolSnapshot) => void>()

  function publish(network: NetworkSnapshot) {
    snapshot = freezeSnapshot(network)
    listeners.forEach((listener) => listener(snapshot))
  }

  async function initialize() {
    publish({
      ...snapshot.network,
      canUseChainActions: false,
      chainId: null,
      connectionError: null,
      status: 'connecting',
    })

    let chainId: number

    try {
      chainId = await rpc.getChainId(snapshot.network.activeRpcUrl)
    } catch {
      publish({
        ...snapshot.network,
        chainId: null,
        connectionError: UNREACHABLE_PROBLEM,
        status: 'error',
      })
      return
    }

    if (chainId !== SEPOLIA_CHAIN_ID) {
      publish({
        ...snapshot.network,
        chainId: null,
        connectionError: WRONG_CHAIN_PROBLEM,
        status: 'error',
      })
      return
    }

    publish({
      ...snapshot.network,
      canUseChainActions: true,
      chainId,
      connectionError: null,
      status: 'connected',
    })
  }

  async function applyRpcOverride(candidateRpcUrl: string) {
    let normalizedRpcUrl: string

    try {
      const url = new URL(candidateRpcUrl.trim())

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Unsupported RPC protocol')
      }

      normalizedRpcUrl = url.toString()
    } catch {
      publish({
        ...snapshot.network,
        isValidatingRpc: false,
        rpcOverrideError: INVALID_RPC_URL_PROBLEM,
      })
      return false
    }

    publish({
      ...snapshot.network,
      isValidatingRpc: true,
      rpcOverrideError: null,
    })

    let chainId: number

    try {
      chainId = await rpc.getChainId(normalizedRpcUrl)
    } catch {
      publish({
        ...snapshot.network,
        isValidatingRpc: false,
        rpcOverrideError: CANDIDATE_UNREACHABLE_PROBLEM,
      })
      return false
    }

    if (chainId !== SEPOLIA_CHAIN_ID) {
      publish({
        ...snapshot.network,
        isValidatingRpc: false,
        rpcOverrideError: CANDIDATE_WRONG_CHAIN_PROBLEM,
      })
      return false
    }

    publish({
      ...snapshot.network,
      activeRpcUrl: normalizedRpcUrl,
      canUseChainActions: true,
      chainId,
      connectionError: null,
      isValidatingRpc: false,
      status: 'connected',
    })
    return true
  }

  return {
    read: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    network: {
      applyRpcOverride,
      initialize,
      reconnect: initialize,
    },
  }
}
