import {
  formatEther,
  formatUnits,
  getAddress,
  keccak256,
  parseUnits,
  zeroAddress,
  type Hex,
  type TransactionSerializable,
} from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'

import {
  RawTransactionRejectedError,
  type ObservedTransactionReceipt,
  type SepoliaRpcAdapter,
} from './sepolia-rpc-adapter'

export const DEFAULT_SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
export const SEPOLIA_CHAIN_ID = 11_155_111
export const TRANSFER_CONFIRMATION_TIMEOUT_MS = 120_000

type NetworkStatus = 'idle' | 'connecting' | 'connected' | 'error'
type AccountStatus =
  'locked' | 'importing' | 'loading-balance' | 'connected' | 'import-error' | 'balance-error'
type TokenStatus = 'idle' | 'inspecting' | 'compatible' | 'error'
type TransferStatus =
  | 'editing'
  | 'checking'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'querying'
  | 'success'
  | 'failed'
  | 'unknown'
  | 'broadcast-failed'
  | 'broadcast-error'

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

interface TransferProblem {
  readonly kind:
    | 'network-unavailable'
    | 'account-unavailable'
    | 'token-unavailable'
    | 'token-balance-unavailable'
    | 'eth-balance-unavailable'
    | 'invalid-recipient'
    | 'zero-recipient'
    | 'self-recipient'
    | 'invalid-amount'
    | 'amount-exceeds-balance'
    | 'simulation-failed'
    | 'preparation-failed'
    | 'insufficient-eth'
    | 'signing-failed'
    | 'broadcast-failed'
    | 'broadcast-uncertain'
    | 'execution-failed'
    | 'confirmation-unknown'
  readonly message: string
}

interface TransferSnapshot {
  readonly canQueryStatus: boolean
  readonly canStartNew: boolean
  readonly canSubmit: boolean
  readonly error: TransferProblem | null
  readonly hash: Hex | null
  readonly isFormVisible: boolean
  readonly isStatusQueryVisible: boolean
  readonly recipient: `0x${string}` | null
  readonly status: TransferStatus
  readonly unavailableReason: string | null
}

type NetworkState = Omit<
  NetworkSnapshot,
  'canApplyRpcOverride' | 'canReconnect' | 'canUseChainActions'
>

export interface EthereumToolSnapshot {
  readonly account: AccountSnapshot
  readonly network: NetworkSnapshot
  readonly token: TokenSnapshot
  readonly transfer: TransferSnapshot
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
  readonly transfer: {
    queryStatus(): Promise<boolean>
    startNew(): void
    submit(input: { readonly amount: string; readonly recipient: string }): Promise<boolean>
  }
}

type SepoliaProbeResult =
  | { readonly kind: 'valid'; readonly chainId: typeof SEPOLIA_CHAIN_ID }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'wrong-chain' }

type AccountState = Omit<AccountSnapshot, 'canImport' | 'canLock' | 'canRefreshBalance'>
type TokenState = Omit<TokenSnapshot, 'canInspect' | 'canTransfer'>
type TransferState = Omit<
  TransferSnapshot,
  | 'canQueryStatus'
  | 'canStartNew'
  | 'canSubmit'
  | 'isFormVisible'
  | 'isStatusQueryVisible'
  | 'unavailableReason'
>

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

const INVALID_TRANSFER_RECIPIENT_PROBLEM = Object.freeze({
  kind: 'invalid-recipient' as const,
  message: '请输入有效的 Ethereum 收款地址。',
})

const TRANSFER_NETWORK_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'network-unavailable' as const,
  message: 'Sepolia 网络当前不可用，请先恢复正确的链连接。',
})

const TRANSFER_ACCOUNT_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'account-unavailable' as const,
  message: '缺少活动的专用测试账户，请先导入账户。',
})

const TRANSFER_TOKEN_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'token-unavailable' as const,
  message: '尚未激活可转账的目标 Token，请先查询 Token。',
})

const TRANSFER_TOKEN_BALANCE_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'token-balance-unavailable' as const,
  message: '无法读取当前账户的 Token 余额，不能进行转账预检查。',
})

const TRANSFER_ETH_BALANCE_UNAVAILABLE_PROBLEM = Object.freeze({
  kind: 'eth-balance-unavailable' as const,
  message: '无法读取当前账户的 Sepolia ETH 余额，不能检查交易费用。',
})

const SELF_TRANSFER_RECIPIENT_PROBLEM = Object.freeze({
  kind: 'self-recipient' as const,
  message: '收款地址不能是当前专用测试账户地址。',
})

const ZERO_TRANSFER_RECIPIENT_PROBLEM = Object.freeze({
  kind: 'zero-recipient' as const,
  message: '收款地址不能是零地址。',
})

const INVALID_TRANSFER_AMOUNT_PROBLEM = Object.freeze({
  kind: 'invalid-amount' as const,
  message: '展示金额必须是大于 0 的普通十进制，不支持负数或科学计数法。',
})

const TRANSFER_AMOUNT_EXCEEDS_BALANCE_PROBLEM = Object.freeze({
  kind: 'amount-exceeds-balance' as const,
  message: '展示金额超过当前可读 Token 余额。',
})

const TRANSFER_SIMULATION_FAILED_PROBLEM = Object.freeze({
  kind: 'simulation-failed' as const,
  message: 'Token transfer 模拟未返回 true，已在签名前停止。',
})

const TRANSFER_PREPARATION_FAILED_PROBLEM = Object.freeze({
  kind: 'preparation-failed' as const,
  message: '无法准备 Token 转账，已在签名前停止。',
})

const INSUFFICIENT_ETH_PROBLEM = Object.freeze({
  kind: 'insufficient-eth' as const,
  message: 'Sepolia ETH 余额不足以支付预计的交易费用。',
})

const TRANSFER_SIGNING_FAILED_PROBLEM = Object.freeze({
  kind: 'signing-failed' as const,
  message: '无法在浏览器内完成本地签名。',
})

const TRANSFER_BROADCAST_FAILED_PROBLEM = Object.freeze({
  kind: 'broadcast-failed' as const,
  message: 'RPC 已明确拒绝原始交易，且未查询到该交易；不会自动重试。',
})

const TRANSFER_BROADCAST_UNCERTAIN_PROBLEM = Object.freeze({
  kind: 'broadcast-uncertain' as const,
  message: 'RPC 未明确接受已签名交易；交易可能已到达网络，不能创建或签名另一笔转账。',
})

const TRANSFER_EXECUTION_FAILED_PROBLEM = Object.freeze({
  kind: 'execution-failed' as const,
  message: '交易已被 Sepolia 收录，但链上执行失败。',
})

const TRANSFER_CONFIRMATION_UNKNOWN_PROBLEM = Object.freeze({
  kind: 'confirmation-unknown' as const,
  message: '等待 120 秒仍未取得回执，交易状态未知。请手动查询原交易。',
})

const TRANSFER_CONFIRMATION_QUERY_FAILED_PROBLEM = Object.freeze({
  kind: 'confirmation-unknown' as const,
  message: '回执查询当前不可用，交易状态未知。请稍后手动查询原交易。',
})

function calculateMaximumTransactionCost(transaction: TransactionSerializable): bigint | null {
  const gasPrice = transaction.maxFeePerGas ?? transaction.gasPrice

  if (transaction.gas === undefined || gasPrice === undefined) {
    return null
  }

  return transaction.gas * gasPrice + (transaction.value ?? 0n)
}

function isTransferInteractionLocked(status: TransferStatus): boolean {
  return (
    status === 'checking' ||
    status === 'signing' ||
    status === 'submitting' ||
    status === 'confirming' ||
    status === 'querying' ||
    status === 'broadcast-error'
  )
}

function canStartNewTransfer(status: TransferStatus): boolean {
  return (
    status === 'success' ||
    status === 'failed' ||
    status === 'unknown' ||
    status === 'broadcast-failed'
  )
}

function freezeSnapshot(
  network: NetworkState,
  account: AccountState,
  token: TokenState,
  transfer: TransferState,
): EthereumToolSnapshot {
  const isNetworkBusy = network.status === 'connecting' || network.isValidatingRpc
  const canUseChainActions = network.status === 'connected' && network.chainId === SEPOLIA_CHAIN_ID
  const isAccountBusy = account.status === 'importing' || account.status === 'loading-balance'
  const hasActiveAccount = account.address !== null
  const isTokenBusy = token.status === 'inspecting'
  const isTransferLocked = isTransferInteractionLocked(transfer.status)
  const isFormVisible =
    hasActiveAccount &&
    ((token.status === 'compatible' && token.balance !== null) || transfer.status !== 'editing')
  let unavailableReason: string | null = null

  if (!isFormVisible) {
    if (!canUseChainActions) {
      unavailableReason = TRANSFER_NETWORK_UNAVAILABLE_PROBLEM.message
    } else if (!hasActiveAccount) {
      unavailableReason = TRANSFER_ACCOUNT_UNAVAILABLE_PROBLEM.message
    } else if (!token.address) {
      unavailableReason = TRANSFER_TOKEN_UNAVAILABLE_PROBLEM.message
    } else if (token.balance === null) {
      unavailableReason = TRANSFER_TOKEN_BALANCE_UNAVAILABLE_PROBLEM.message
    }
  }

  return Object.freeze({
    account: Object.freeze({
      ...account,
      canImport: canUseChainActions && !isAccountBusy && !isTransferLocked,
      canLock: hasActiveAccount && (!isTransferLocked || transfer.status === 'broadcast-error'),
      canRefreshBalance:
        canUseChainActions && hasActiveAccount && !isAccountBusy && !isTransferLocked,
    }),
    network: Object.freeze({
      ...network,
      canApplyRpcOverride: !isNetworkBusy && !isTransferLocked,
      canReconnect:
        !isNetworkBusy &&
        !isTransferLocked &&
        (network.status === 'connected' || network.status === 'error'),
      canUseChainActions,
    }),
    token: Object.freeze({
      ...token,
      canInspect: canUseChainActions && !isTokenBusy && transfer.status === 'editing',
      canTransfer:
        canUseChainActions &&
        hasActiveAccount &&
        token.status === 'compatible' &&
        token.balance !== null,
    }),
    transfer: Object.freeze({
      ...transfer,
      canQueryStatus:
        transfer.hash !== null &&
        (transfer.status === 'unknown' || transfer.status === 'broadcast-error'),
      canStartNew: canStartNewTransfer(transfer.status),
      canSubmit:
        canUseChainActions &&
        hasActiveAccount &&
        token.status === 'compatible' &&
        token.balance !== null &&
        transfer.status === 'editing',
      isFormVisible,
      isStatusQueryVisible:
        transfer.hash !== null &&
        (transfer.status === 'unknown' ||
          transfer.status === 'broadcast-error' ||
          transfer.status === 'querying'),
      unavailableReason,
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
  let transferState: TransferState = {
    error: null,
    hash: null,
    recipient: null,
    status: 'editing',
  }
  let localAccount: PrivateKeyAccount | undefined
  let unresolvedSignedTransaction: Hex | undefined
  let ethBalanceMinimumUnits: bigint | null = null
  let tokenBalanceMinimumUnits: bigint | null = null
  let accountOperationId = 0
  let tokenOperationId = 0
  let snapshot = freezeSnapshot(networkState, accountState, tokenState, transferState)
  const listeners = new Set<(snapshot: EthereumToolSnapshot) => void>()

  function notify() {
    snapshot = freezeSnapshot(networkState, accountState, tokenState, transferState)
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

  function publishTransfer(transferPatch: Partial<TransferState>) {
    transferState = { ...transferState, ...transferPatch }
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
    if (
      networkState.status === 'connecting' ||
      networkState.isValidatingRpc ||
      isTransferInteractionLocked(transferState.status)
    ) {
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
    if (
      networkState.status === 'connecting' ||
      networkState.isValidatingRpc ||
      isTransferInteractionLocked(transferState.status)
    ) {
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

      ethBalanceMinimumUnits = balance
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

      ethBalanceMinimumUnits = null
      publishAccount({
        error: BALANCE_UNAVAILABLE_PROBLEM,
        ethBalance: null,
        status: 'balance-error',
      })
      return false
    }
  }

  function cancelAccountBoundTokenOperation() {
    tokenOperationId += 1
    tokenBalanceMinimumUnits = null

    if (tokenState.address && tokenState.decimals !== null) {
      publishToken({ balance: null, error: null, status: 'compatible' })
      return
    }

    if (tokenState.status === 'inspecting') {
      publishToken({
        address: null,
        balance: null,
        decimals: null,
        error: null,
        name: null,
        status: 'idle',
        symbol: null,
      })
    }
  }

  async function importPrivateKey(privateKey: string) {
    if (isTransferInteractionLocked(transferState.status)) {
      return false
    }

    const operationId = ++accountOperationId
    localAccount = undefined
    ethBalanceMinimumUnits = null
    publishTransfer({ error: null, hash: null, recipient: null, status: 'editing' })
    cancelAccountBoundTokenOperation()
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
    if (transferState.status === 'broadcast-error' && !unresolvedSignedTransaction) {
      return
    }

    if (
      isTransferInteractionLocked(transferState.status) &&
      transferState.status !== 'broadcast-error'
    ) {
      return
    }

    accountOperationId += 1
    cancelAccountBoundTokenOperation()
    localAccount = undefined
    unresolvedSignedTransaction = undefined
    ethBalanceMinimumUnits = null
    publishTransfer({ error: null, hash: null, recipient: null, status: 'editing' })
    publishAccount({
      address: null,
      error: null,
      ethBalance: null,
      status: 'locked',
    })
  }

  async function refreshBalancesForAccount(account: PrivateKeyAccount) {
    const operationId = ++accountOperationId
    const refreshed = await refreshBalanceFor(account, operationId)

    if (
      operationId === accountOperationId &&
      localAccount === account &&
      tokenState.address &&
      tokenState.decimals !== null &&
      (tokenState.status === 'compatible' || tokenState.error?.kind === 'balance-unavailable')
    ) {
      const tokenBalanceOperationId = ++tokenOperationId
      await refreshTokenBalanceFor(account, tokenBalanceOperationId)
    }

    return refreshed
  }

  async function refreshBalance() {
    if (!localAccount || !snapshot.account.canRefreshBalance) {
      return false
    }

    return refreshBalancesForAccount(localAccount)
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

      tokenBalanceMinimumUnits = balance
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

      tokenBalanceMinimumUnits = null
      publishToken({
        balance: null,
        error: TOKEN_BALANCE_UNAVAILABLE_PROBLEM,
        status: 'error',
      })
      return false
    }
  }

  async function inspectToken(tokenAddress: string) {
    if (transferState.status !== 'editing') {
      return false
    }

    const operationId = ++tokenOperationId
    tokenBalanceMinimumUnits = null
    publishTransfer({ error: null, hash: null, recipient: null, status: 'editing' })
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

  async function submitTransfer({ amount, recipient }: { amount: string; recipient: string }) {
    if (transferState.status !== 'editing') {
      return false
    }

    if (!snapshot.network.canUseChainActions) {
      publishTransfer({ error: TRANSFER_NETWORK_UNAVAILABLE_PROBLEM })
      return false
    }

    if (!localAccount) {
      publishTransfer({ error: TRANSFER_ACCOUNT_UNAVAILABLE_PROBLEM })
      return false
    }

    if (!tokenState.address || tokenState.decimals === null) {
      publishTransfer({ error: TRANSFER_TOKEN_UNAVAILABLE_PROBLEM })
      return false
    }

    if (tokenState.balance === null || tokenBalanceMinimumUnits === null) {
      publishTransfer({ error: TRANSFER_TOKEN_BALANCE_UNAVAILABLE_PROBLEM })
      return false
    }

    if (!snapshot.transfer.canSubmit) {
      return false
    }

    let normalizedRecipient: `0x${string}`

    try {
      normalizedRecipient = getAddress(recipient.trim())
    } catch {
      publishTransfer({ error: INVALID_TRANSFER_RECIPIENT_PROBLEM })
      return false
    }

    if (normalizedRecipient === localAccount.address) {
      publishTransfer({ error: SELF_TRANSFER_RECIPIENT_PROBLEM })
      return false
    }

    if (normalizedRecipient === zeroAddress) {
      publishTransfer({ error: ZERO_TRANSFER_RECIPIENT_PROBLEM })
      return false
    }

    const normalizedAmount = amount.trim()
    const decimalMatch = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/.exec(normalizedAmount)

    if (!decimalMatch) {
      publishTransfer({ error: INVALID_TRANSFER_AMOUNT_PROBLEM })
      return false
    }

    const decimalPlaces = decimalMatch[1]?.length ?? 0

    if (decimalPlaces > tokenState.decimals) {
      publishTransfer({
        error: Object.freeze({
          kind: 'invalid-amount' as const,
          message: `展示金额最多支持当前 Token 的 ${tokenState.decimals} 位小数。`,
        }),
      })
      return false
    }

    const minimumUnitAmount = parseUnits(normalizedAmount, tokenState.decimals)

    if (minimumUnitAmount <= 0n) {
      publishTransfer({ error: INVALID_TRANSFER_AMOUNT_PROBLEM })
      return false
    }

    if (
      tokenBalanceMinimumUnits === null ||
      minimumUnitAmount > tokenBalanceMinimumUnits ||
      minimumUnitAmount > parseUnits(tokenState.balance, tokenState.decimals)
    ) {
      publishTransfer({ error: TRANSFER_AMOUNT_EXCEEDS_BALANCE_PROBLEM })
      return false
    }

    if (ethBalanceMinimumUnits === null) {
      publishTransfer({ error: TRANSFER_ETH_BALANCE_UNAVAILABLE_PROBLEM })
      return false
    }

    const account = localAccount
    const tokenAddress = tokenState.address

    const transferRequest = {
      accountAddress: account.address,
      amount: minimumUnitAmount,
      recipient: normalizedRecipient,
      tokenAddress,
    }
    publishTransfer({
      error: null,
      hash: null,
      recipient: normalizedRecipient,
      status: 'checking',
    })

    let simulationPassed: boolean

    try {
      simulationPassed = await rpc.simulateTokenTransfer(networkState.activeRpcUrl, transferRequest)
    } catch {
      simulationPassed = false
    }

    if (!simulationPassed) {
      publishTransfer({ error: TRANSFER_SIMULATION_FAILED_PROBLEM, status: 'editing' })
      return false
    }

    let preparedTransaction: TransactionSerializable

    try {
      preparedTransaction = await rpc.prepareTokenTransfer(
        networkState.activeRpcUrl,
        transferRequest,
      )
    } catch {
      publishTransfer({ error: TRANSFER_PREPARATION_FAILED_PROBLEM, status: 'editing' })
      return false
    }

    const maximumTransactionCost = calculateMaximumTransactionCost(preparedTransaction)

    if (
      maximumTransactionCost === null ||
      ethBalanceMinimumUnits === null ||
      maximumTransactionCost > ethBalanceMinimumUnits
    ) {
      publishTransfer({ error: INSUFFICIENT_ETH_PROBLEM, status: 'editing' })
      return false
    }

    publishTransfer({ status: 'signing' })

    let signedTransaction: Hex

    try {
      signedTransaction = await account.signTransaction(preparedTransaction)
    } catch {
      publishTransfer({ error: TRANSFER_SIGNING_FAILED_PROBLEM, status: 'editing' })
      return false
    }

    unresolvedSignedTransaction = signedTransaction
    const localTransactionHash = keccak256(signedTransaction)
    publishTransfer({ status: 'submitting' })

    let submittedHash: Hex

    try {
      submittedHash = await rpc.sendRawTransaction(networkState.activeRpcUrl, signedTransaction)
    } catch (error) {
      if (error instanceof RawTransactionRejectedError) {
        unresolvedSignedTransaction = undefined
        publishTransfer({
          error: TRANSFER_BROADCAST_FAILED_PROBLEM,
          hash: null,
          status: 'broadcast-failed',
        })
        return false
      }

      publishTransfer({
        error: TRANSFER_BROADCAST_UNCERTAIN_PROBLEM,
        hash: localTransactionHash,
        status: 'broadcast-error',
      })
      return false
    }

    if (submittedHash.toLowerCase() !== localTransactionHash.toLowerCase()) {
      publishTransfer({
        error: TRANSFER_BROADCAST_UNCERTAIN_PROBLEM,
        hash: localTransactionHash,
        status: 'broadcast-error',
      })
      return false
    }

    unresolvedSignedTransaction = undefined
    publishTransfer({ hash: submittedHash, status: 'confirming' })

    let receipt: ObservedTransactionReceipt | null = null
    let receiptQueryFailed = false
    const confirmationStartedAt = Date.now()

    try {
      receipt = await rpc.waitForTransactionReceipt(
        networkState.activeRpcUrl,
        submittedHash,
        TRANSFER_CONFIRMATION_TIMEOUT_MS,
      )
    } catch {
      receiptQueryFailed = true
      const remainingWaitMs = Math.max(
        0,
        TRANSFER_CONFIRMATION_TIMEOUT_MS - (Date.now() - confirmationStartedAt),
      )

      if (remainingWaitMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, remainingWaitMs)
        })
      }
    }

    if (!receipt || receipt.confirmations < 1) {
      publishTransfer({
        error: receiptQueryFailed
          ? TRANSFER_CONFIRMATION_QUERY_FAILED_PROBLEM
          : TRANSFER_CONFIRMATION_UNKNOWN_PROBLEM,
        status: 'unknown',
      })
      return false
    }

    return applyConfirmedTransferReceipt(receipt, account)
  }

  async function applyConfirmedTransferReceipt(
    receipt: ObservedTransactionReceipt,
    account: PrivateKeyAccount | undefined,
  ) {
    if (receipt.status === 'reverted') {
      publishTransfer({ error: TRANSFER_EXECUTION_FAILED_PROBLEM, status: 'failed' })
      return false
    }

    if (account) {
      await refreshBalancesForAccount(account)
    }
    publishTransfer({ error: null, status: 'success' })
    return true
  }

  async function queryTransferStatus() {
    const previousStatus = transferState.status
    const transactionHash = transferState.hash

    if (
      !transactionHash ||
      (previousStatus !== 'unknown' && previousStatus !== 'broadcast-error')
    ) {
      return false
    }

    publishTransfer({ error: null, status: 'querying' })

    let receipt: ObservedTransactionReceipt | null
    let receiptQueryFailed = false

    try {
      receipt = await rpc.getTransactionStatus(networkState.activeRpcUrl, transactionHash)
    } catch {
      receipt = null
      receiptQueryFailed = true
    }

    if (!receipt || receipt.confirmations < 1) {
      publishTransfer({
        error:
          previousStatus === 'broadcast-error'
            ? TRANSFER_BROADCAST_UNCERTAIN_PROBLEM
            : receiptQueryFailed
              ? TRANSFER_CONFIRMATION_QUERY_FAILED_PROBLEM
              : TRANSFER_CONFIRMATION_UNKNOWN_PROBLEM,
        status: previousStatus,
      })
      return false
    }

    unresolvedSignedTransaction = undefined

    return applyConfirmedTransferReceipt(receipt, localAccount)
  }

  function startNewTransfer() {
    if (!canStartNewTransfer(transferState.status)) {
      return
    }

    publishTransfer({ error: null, hash: null, status: 'editing' })
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
    transfer: {
      queryStatus: queryTransferStatus,
      startNew: startNewTransfer,
      submit: submitTransfer,
    },
  }
}
