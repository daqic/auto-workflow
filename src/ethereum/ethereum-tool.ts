import { formatEther, formatUnits, getAddress, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'

import type { SepoliaRpcAdapter } from './sepolia-rpc-adapter'

export const DEFAULT_SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
export const SEPOLIA_CHAIN_ID = 11_155_111

type NetworkStatus = 'idle' | 'connecting' | 'connected' | 'error'
type AccountStatus =
  'locked' | 'importing' | 'loading-balance' | 'connected' | 'import-error' | 'balance-error'
type TokenStatus = 'idle' | 'inspecting' | 'compatible' | 'error'

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

interface TokenProblem {
  readonly kind:
    | 'invalid-address'
    | 'network-unavailable'
    | 'bytecode-unavailable'
    | 'no-bytecode'
    | 'decimals-unavailable'
    | 'invalid-decimals'
    | 'balance-unavailable'
  readonly message: string
}

interface TokenSnapshot {
  readonly address: `0x${string}` | null
  readonly balance: string | null
  readonly canInspect: boolean
  readonly canTransfer: boolean
  readonly decimals: number | null
  readonly error: TokenProblem | null
  readonly name: string | null
  readonly status: TokenStatus
  readonly symbol: string | null
}

type NetworkState = Omit<
  NetworkSnapshot,
  'canApplyRpcOverride' | 'canReconnect' | 'canUseChainActions'
>

export interface EthereumToolSnapshot {
  readonly account: AccountSnapshot
  readonly network: NetworkSnapshot
  readonly token: TokenSnapshot
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
  readonly token: {
    inspect(tokenAddress: string): Promise<boolean>
  }
}

type SepoliaProbeResult =
  | { readonly kind: 'valid'; readonly chainId: typeof SEPOLIA_CHAIN_ID }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'wrong-chain' }

type AccountState = Omit<AccountSnapshot, 'canImport' | 'canLock' | 'canRefreshBalance'>
type TokenState = Omit<TokenSnapshot, 'canInspect' | 'canTransfer'>

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

const TOKEN_NETWORK_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'network-unavailable' as const,
  message: 'Sepolia RPC 尚未连接，暂时无法查询 Token。',
})

const INVALID_TOKEN_ADDRESS_PROBLEM = Object.freeze({
  kind: 'invalid-address' as const,
  message: 'Token 地址格式无效，请输入有效的 Ethereum 合约地址。',
})

const TOKEN_BYTECODE_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'bytecode-unavailable' as const,
  message: '无法检查该地址的合约字节码，请确认 RPC 可用后重试。',
})

const TOKEN_HAS_NO_BYTECODE_PROBLEM = Object.freeze({
  kind: 'no-bytecode' as const,
  message: '该地址未检测到合约字节码，不能作为目标 Token。',
})

const TOKEN_DECIMALS_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'decimals-unavailable' as const,
  message: '无法读取 Token decimals，兼容性检查未通过。',
})

const TOKEN_DECIMALS_INVALID_PROBLEM = Object.freeze({
  kind: 'invalid-decimals' as const,
  message: 'Token decimals 必须是 0 至 18 的整数，兼容性检查未通过。',
})

const TOKEN_BALANCE_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'balance-unavailable' as const,
  message: '无法读取当前账户的 Token 余额，Token 暂不可转账。',
})

function freezeSnapshot(
  network: NetworkState,
  account: AccountState,
  token: TokenState,
): EthereumToolSnapshot {
  const isNetworkBusy = network.status === 'connecting' || network.isValidatingRpc
  const canUseChainActions = network.status === 'connected' && network.chainId === SEPOLIA_CHAIN_ID
  const isAccountBusy = account.status === 'importing' || account.status === 'loading-balance'
  const hasActiveAccount = account.address !== null
  const isTokenBusy = token.status === 'inspecting'

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
    token: Object.freeze({
      ...token,
      canInspect: canUseChainActions && !isTokenBusy,
      canTransfer:
        canUseChainActions &&
        hasActiveAccount &&
        token.status === 'compatible' &&
        token.balance !== null,
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
  let tokenState: TokenState = {
    address: null,
    balance: null,
    decimals: null,
    error: null,
    name: null,
    status: 'idle',
    symbol: null,
  }
  let localAccount: PrivateKeyAccount | undefined
  let accountOperationId = 0
  let tokenOperationId = 0
  let snapshot = freezeSnapshot(networkState, accountState, tokenState)
  const listeners = new Set<(snapshot: EthereumToolSnapshot) => void>()

  function notify() {
    snapshot = freezeSnapshot(networkState, accountState, tokenState)
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

  function publishToken(tokenPatch: Partial<TokenState>) {
    tokenState = { ...tokenState, ...tokenPatch }
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
    tokenOperationId += 1
    publishAccount({
      address: null,
      error: null,
      ethBalance: null,
      status: 'importing',
    })
    if (tokenState.address && tokenState.decimals !== null) {
      publishToken({ balance: null, error: null, status: 'compatible' })
    }

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

    if (
      operationId === accountOperationId &&
      localAccount === nextAccount &&
      tokenState.address &&
      tokenState.decimals !== null &&
      tokenState.status === 'compatible'
    ) {
      const tokenBalanceOperationId = ++tokenOperationId
      await refreshTokenBalanceFor(nextAccount, tokenBalanceOperationId)
    }

    return operationId === accountOperationId && localAccount === nextAccount
  }

  function lock() {
    accountOperationId += 1
    tokenOperationId += 1
    localAccount = undefined
    publishAccount({
      address: null,
      error: null,
      ethBalance: null,
      status: 'locked',
    })
    if (tokenState.address && tokenState.decimals !== null) {
      publishToken({ balance: null, error: null, status: 'compatible' })
    }
  }

  async function refreshBalance() {
    if (!localAccount || !snapshot.account.canRefreshBalance) {
      return false
    }

    const operationId = ++accountOperationId
    return refreshBalanceFor(localAccount, operationId)
  }

  async function refreshTokenBalanceFor(
    account: PrivateKeyAccount,
    operationId: number,
  ): Promise<boolean> {
    const { address, decimals } = tokenState

    if (!address || decimals === null) {
      return false
    }

    publishToken({ balance: null, error: null, status: 'inspecting' })

    try {
      const balance = await rpc.getTokenBalance(networkState.activeRpcUrl, address, account.address)

      if (operationId !== tokenOperationId || localAccount !== account) {
        return false
      }

      publishToken({
        balance: formatUnits(balance, decimals),
        error: null,
        status: 'compatible',
      })
      return true
    } catch {
      if (operationId !== tokenOperationId || localAccount !== account) {
        return false
      }

      publishToken({
        balance: null,
        error: TOKEN_BALANCE_UNAVAILABLE_PROBLEM,
        status: 'error',
      })
      return false
    }
  }

  async function inspectToken(tokenAddress: string) {
    const operationId = ++tokenOperationId
    publishToken({
      address: null,
      balance: null,
      decimals: null,
      error: null,
      name: null,
      status: 'inspecting',
      symbol: null,
    })

    if (!snapshot.network.canUseChainActions) {
      publishToken({ error: TOKEN_NETWORK_UNAVAILABLE_PROBLEM, status: 'error' })
      return false
    }

    let address: `0x${string}`

    try {
      address = getAddress(tokenAddress.trim())
    } catch {
      publishToken({ error: INVALID_TOKEN_ADDRESS_PROBLEM, status: 'error' })
      return false
    }

    let bytecode: Hex | undefined

    try {
      bytecode = await rpc.getBytecode(networkState.activeRpcUrl, address)
    } catch {
      if (operationId !== tokenOperationId) {
        return false
      }
      publishToken({ error: TOKEN_BYTECODE_UNAVAILABLE_PROBLEM, status: 'error' })
      return false
    }

    if (operationId !== tokenOperationId) {
      return false
    }

    if (!bytecode || bytecode === '0x') {
      publishToken({ error: TOKEN_HAS_NO_BYTECODE_PROBLEM, status: 'error' })
      return false
    }

    let decimals: number

    try {
      decimals = await rpc.getTokenDecimals(networkState.activeRpcUrl, address)
    } catch {
      if (operationId !== tokenOperationId) {
        return false
      }
      publishToken({ error: TOKEN_DECIMALS_UNAVAILABLE_PROBLEM, status: 'error' })
      return false
    }

    if (operationId !== tokenOperationId) {
      return false
    }

    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      publishToken({ error: TOKEN_DECIMALS_INVALID_PROBLEM, status: 'error' })
      return false
    }

    const [nameResult, symbolResult] = await Promise.allSettled([
      rpc.getTokenName(networkState.activeRpcUrl, address),
      rpc.getTokenSymbol(networkState.activeRpcUrl, address),
    ])

    if (operationId !== tokenOperationId) {
      return false
    }
    const name =
      nameResult.status === 'fulfilled' && nameResult.value.trim() ? nameResult.value : address
    const symbol =
      symbolResult.status === 'fulfilled' && symbolResult.value.trim()
        ? symbolResult.value
        : address

    if (localAccount) {
      const account = localAccount
      publishToken({ address, decimals, name, symbol })
      return refreshTokenBalanceFor(account, operationId)
    }

    publishToken({
      address,
      balance: null,
      decimals,
      error: null,
      name,
      status: 'compatible',
      symbol,
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
    account: {
      importPrivateKey,
      lock,
      refreshBalance,
    },
    token: {
      inspect: inspectToken,
    },
  }
}
