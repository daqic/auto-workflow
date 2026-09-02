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
  readonly canApplyRpcOverride: boolean
  readonly canReconnect: boolean
  readonly canUseChainActions: boolean
  readonly chainId: number | null
  readonly connectionError: NetworkProblem | null
  readonly isValidatingRpc: boolean
  readonly rpcOverrideError: NetworkProblem | null
  readonly status: NetworkStatus
}

type NetworkState = Omit<
  NetworkSnapshot,
  'canApplyRpcOverride' | 'canReconnect' | 'canUseChainActions'
>

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

type SepoliaProbeResult =
  | { readonly kind: 'valid'; readonly chainId: typeof SEPOLIA_CHAIN_ID }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'wrong-chain' }

function freezeSnapshot(network: NetworkState): EthereumToolSnapshot {
  const isNetworkBusy = network.status === 'connecting' || network.isValidatingRpc

  return Object.freeze({
    network: Object.freeze({
      ...network,
      canApplyRpcOverride: !isNetworkBusy,
      canReconnect:
        !isNetworkBusy && (network.status === 'connected' || network.status === 'error'),
      canUseChainActions: network.status === 'connected' && network.chainId === SEPOLIA_CHAIN_ID,
    }),
  })
}

export function createEthereumTool({ rpc }: { rpc: SepoliaRpcAdapter }): EthereumTool {
  let networkState: NetworkState = {
    activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
    chainId: null,
    connectionError: null,
    isValidatingRpc: false,
    rpcOverrideError: null,
    status: 'idle',
  }
  let snapshot = freezeSnapshot(networkState)
  const listeners = new Set<(snapshot: EthereumToolSnapshot) => void>()

  function publish(networkPatch: Partial<NetworkState>) {
    networkState = { ...networkState, ...networkPatch }
    snapshot = freezeSnapshot(networkState)
    listeners.forEach((listener) => listener(snapshot))
  }

  async function probeSepolia(rpcUrl: string): Promise<SepoliaProbeResult> {
    try {
      const chainId = await rpc.getChainId(rpcUrl)

      if (chainId !== SEPOLIA_CHAIN_ID) {
        return { kind: 'wrong-chain' }
      }

      return { kind: 'valid', chainId: SEPOLIA_CHAIN_ID }
    } catch {
      return { kind: 'unreachable' }
    }
  }

  async function initialize() {
    if (networkState.status === 'connecting' || networkState.isValidatingRpc) {
      return
    }

    publish({
      chainId: null,
      connectionError: null,
      status: 'connecting',
    })

    const result = await probeSepolia(networkState.activeRpcUrl)

    if (result.kind === 'unreachable') {
      publish({
        chainId: null,
        connectionError: UNREACHABLE_PROBLEM,
        status: 'error',
      })
      return
    }

    if (result.kind === 'wrong-chain') {
      publish({
        chainId: null,
        connectionError: WRONG_CHAIN_PROBLEM,
        status: 'error',
      })
      return
    }

    publish({
      chainId: result.chainId,
      connectionError: null,
      status: 'connected',
    })
  }

  async function applyRpcOverride(candidateRpcUrl: string) {
    if (networkState.status === 'connecting' || networkState.isValidatingRpc) {
      return false
    }

    let normalizedRpcUrl: string

    try {
      const url = new URL(candidateRpcUrl.trim())

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Unsupported RPC protocol')
      }

      normalizedRpcUrl = url.toString()
    } catch {
      publish({
        isValidatingRpc: false,
        rpcOverrideError: INVALID_RPC_URL_PROBLEM,
      })
      return false
    }

    publish({
      isValidatingRpc: true,
      rpcOverrideError: null,
    })

    const result = await probeSepolia(normalizedRpcUrl)

    if (result.kind === 'unreachable') {
      publish({
        isValidatingRpc: false,
        rpcOverrideError: CANDIDATE_UNREACHABLE_PROBLEM,
      })
      return false
    }

    if (result.kind === 'wrong-chain') {
      publish({
        isValidatingRpc: false,
        rpcOverrideError: CANDIDATE_WRONG_CHAIN_PROBLEM,
      })
      return false
    }

    publish({
      activeRpcUrl: normalizedRpcUrl,
      chainId: result.chainId,
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
