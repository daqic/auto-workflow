import { formatEther, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'

import type { SepoliaRpcAdapter } from './sepolia-rpc-adapter'

export const DEFAULT_SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
export const SEPOLIA_CHAIN_ID = 11_155_111

type NetworkStatus = 'idle' | 'connecting' | 'connected' | 'error'
type AccountStatus =
  'locked' | 'importing' | 'loading-balance' | 'connected' | 'import-error' | 'balance-error'

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

interface AccountProblem {
  readonly kind: 'invalid-private-key' | 'balance-unavailable' | 'network-unavailable'
  readonly message: string
}

interface AccountSnapshot {
  readonly address: `0x${string}` | null
  readonly canImport: boolean
  readonly canLock: boolean
  readonly canRefreshBalance: boolean
  readonly error: AccountProblem | null
  readonly ethBalance: string | null
  readonly status: AccountStatus
}

type NetworkState = Omit<
  NetworkSnapshot,
  'canApplyRpcOverride' | 'canReconnect' | 'canUseChainActions'
>

export interface EthereumToolSnapshot {
  readonly account: AccountSnapshot
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
  readonly account: {
    importPrivateKey(privateKey: string): Promise<boolean>
    lock(): void
    refreshBalance(): Promise<boolean>
  }
}

type SepoliaProbeResult =
  | { readonly kind: 'valid'; readonly chainId: typeof SEPOLIA_CHAIN_ID }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'wrong-chain' }

type AccountState = Omit<AccountSnapshot, 'canImport' | 'canLock' | 'canRefreshBalance'>

const INVALID_PRIVATE_KEY_PROBLEM = Object.freeze({
  kind: 'invalid-private-key' as const,
  message: '私钥格式无效。仅支持 0x 开头的 64 位十六进制专用测试私钥。',
})

const BALANCE_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'balance-unavailable' as const,
  message: '无法读取该账户的 Sepolia ETH 余额，请手动刷新。',
})

const ACCOUNT_NETWORK_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'network-unavailable' as const,
  message: 'Sepolia RPC 尚未连接，暂时无法导入专用测试账户。',
})

function freezeSnapshot(network: NetworkState, account: AccountState): EthereumToolSnapshot {
  const isNetworkBusy = network.status === 'connecting' || network.isValidatingRpc
  const canUseChainActions = network.status === 'connected' && network.chainId === SEPOLIA_CHAIN_ID
  const isAccountBusy = account.status === 'importing' || account.status === 'loading-balance'
  const hasActiveAccount = account.address !== null

  return Object.freeze({
    account: Object.freeze({
      ...account,
      canImport: canUseChainActions && !isAccountBusy,
      canLock: hasActiveAccount,
      canRefreshBalance: canUseChainActions && hasActiveAccount && !isAccountBusy,
    }),
    network: Object.freeze({
      ...network,
      canApplyRpcOverride: !isNetworkBusy,
      canReconnect:
        !isNetworkBusy && (network.status === 'connected' || network.status === 'error'),
      canUseChainActions,
    }),
  })
}

function isPrivateKey(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value)
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
  let accountState: AccountState = {
    address: null,
    error: null,
    ethBalance: null,
    status: 'locked',
  }
  let localAccount: PrivateKeyAccount | undefined
  let accountOperationId = 0
  let snapshot = freezeSnapshot(networkState, accountState)
  const listeners = new Set<(snapshot: EthereumToolSnapshot) => void>()

  function notify() {
    snapshot = freezeSnapshot(networkState, accountState)
    listeners.forEach((listener) => listener(snapshot))
  }

  function publishNetwork(networkPatch: Partial<NetworkState>) {
    networkState = { ...networkState, ...networkPatch }
    notify()
  }

  function publishAccount(accountPatch: Partial<AccountState>) {
    accountState = { ...accountState, ...accountPatch }
    notify()
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

    publishNetwork({
      chainId: null,
      connectionError: null,
      status: 'connecting',
    })

    const result = await probeSepolia(networkState.activeRpcUrl)

    if (result.kind === 'unreachable') {
      publishNetwork({
        chainId: null,
        connectionError: UNREACHABLE_PROBLEM,
        status: 'error',
      })
      return
    }

    if (result.kind === 'wrong-chain') {
      publishNetwork({
        chainId: null,
        connectionError: WRONG_CHAIN_PROBLEM,
        status: 'error',
      })
      return
    }

    publishNetwork({
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
      publishNetwork({
        isValidatingRpc: false,
        rpcOverrideError: INVALID_RPC_URL_PROBLEM,
      })
      return false
    }

    publishNetwork({
      isValidatingRpc: true,
      rpcOverrideError: null,
    })

    const result = await probeSepolia(normalizedRpcUrl)

    if (result.kind === 'unreachable') {
      publishNetwork({
        isValidatingRpc: false,
        rpcOverrideError: CANDIDATE_UNREACHABLE_PROBLEM,
      })
      return false
    }

    if (result.kind === 'wrong-chain') {
      publishNetwork({
        isValidatingRpc: false,
        rpcOverrideError: CANDIDATE_WRONG_CHAIN_PROBLEM,
      })
      return false
    }

    publishNetwork({
      activeRpcUrl: normalizedRpcUrl,
      chainId: result.chainId,
      connectionError: null,
      isValidatingRpc: false,
      status: 'connected',
    })
    return true
  }

  async function refreshBalanceFor(account: PrivateKeyAccount, operationId: number) {
    publishAccount({
      address: account.address,
      error: null,
      ethBalance: null,
      status: 'loading-balance',
    })

    try {
      const balance = await rpc.getEthBalance(networkState.activeRpcUrl, account.address)

      if (operationId !== accountOperationId || localAccount !== account) {
        return false
      }

      publishAccount({
        error: null,
        ethBalance: formatEther(balance),
        status: 'connected',
      })
      return true
    } catch {
      if (operationId !== accountOperationId || localAccount !== account) {
        return false
      }

      publishAccount({
        error: BALANCE_UNAVAILABLE_PROBLEM,
        ethBalance: null,
        status: 'balance-error',
      })
      return false
    }
  }

  async function importPrivateKey(privateKey: string) {
    const operationId = ++accountOperationId
    localAccount = undefined
    publishAccount({
      address: null,
      error: null,
      ethBalance: null,
      status: 'importing',
    })

    await Promise.resolve()

    if (!snapshot.network.canUseChainActions) {
      publishAccount({
        error: ACCOUNT_NETWORK_UNAVAILABLE_PROBLEM,
        status: 'import-error',
      })
      return false
    }

    if (!isPrivateKey(privateKey)) {
      publishAccount({
        error: INVALID_PRIVATE_KEY_PROBLEM,
        status: 'import-error',
      })
      return false
    }

    let nextAccount: PrivateKeyAccount

    try {
      nextAccount = privateKeyToAccount(privateKey)
    } catch {
      publishAccount({
        error: INVALID_PRIVATE_KEY_PROBLEM,
        status: 'import-error',
      })
      return false
    }

    if (operationId !== accountOperationId) {
      return false
    }

    localAccount = nextAccount
    await refreshBalanceFor(nextAccount, operationId)
    return operationId === accountOperationId && localAccount === nextAccount
  }

  function lock() {
    accountOperationId += 1
    localAccount = undefined
    publishAccount({
      address: null,
      error: null,
      ethBalance: null,
      status: 'locked',
    })
  }

  async function refreshBalance() {
    if (!localAccount || !snapshot.account.canRefreshBalance) {
      return false
    }

    const operationId = ++accountOperationId
    return refreshBalanceFor(localAccount, operationId)
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
    account: {
      importPrivateKey,
      lock,
      refreshBalance,
    },
  }
}
