import { describe, expect, it, vi } from 'vitest'
import { keccak256, type Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

import { DEFAULT_SEPOLIA_RPC_URL, createEthereumTool } from '@/ethereum/ethereum-tool'
import {
  RawTransactionRejectedError,
  type PreparedTokenTransfer,
  type SepoliaRpcAdapter,
} from '@/ethereum/sepolia-rpc-adapter'
import { createScriptedSepoliaRpcAdapter } from '@/ethereum/testing/scripted-sepolia-rpc-adapter'

describe('EthereumTool network', () => {
  it('connects only after the default RPC identifies Ethereum Sepolia', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }])
    const tool = createEthereumTool({ rpc })
    const observedStatuses: string[] = []

    const unsubscribe = tool.subscribe((snapshot) => {
      observedStatuses.push(snapshot.network.status)
    })

    await tool.network.initialize()
    unsubscribe()

    expect(tool.read().network).toEqual({
      activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
      canApplyRpcOverride: true,
      canReconnect: true,
      canUseChainActions: true,
      chainId: 11_155_111,
      connectionError: null,
      isValidatingRpc: false,
      rpcOverrideError: null,
      status: 'connected',
    })
    expect(observedStatuses).toEqual(['connecting', 'connected'])
    expect(Object.isFrozen(tool.read())).toBe(true)
    expect(Object.isFrozen(tool.read().network)).toBe(true)
  })

  it('keeps chain actions disabled when the RPC reports another chain', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([{ chainId: 1 }])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()

    expect(tool.read().network).toMatchObject({
      canUseChainActions: false,
      chainId: null,
      connectionError: {
        kind: 'wrong-chain',
        message: 'RPC 连接的网络不是 Ethereum Sepolia（chain ID 必须为 11155111）。',
      },
      status: 'error',
    })
  })

  it('opens in a recoverable error state without exposing the RPC failure detail', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([
      { error: new Error('request failed with super-secret-provider-token') },
    ])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()

    expect(tool.read().network).toMatchObject({
      canUseChainActions: false,
      chainId: null,
      connectionError: {
        kind: 'unreachable',
        message: '无法连接 Ethereum Sepolia RPC。链上操作暂不可用，请手动重连或更换 RPC。',
      },
      status: 'error',
    })
    expect(JSON.stringify(tool.read())).not.toContain('super-secret-provider-token')
  })

  it('atomically switches to a candidate RPC only after Sepolia validation succeeds', async () => {
    const candidateRpcUrl = 'https://backup.example/rpc'
    const rpc = createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }, { chainId: 11_155_111 }])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()

    const observedRpcState: Array<{ activeRpcUrl: string; isValidatingRpc: boolean }> = []
    const unsubscribe = tool.subscribe(({ network }) => {
      observedRpcState.push({
        activeRpcUrl: network.activeRpcUrl,
        isValidatingRpc: network.isValidatingRpc,
      })
    })

    const applied = await tool.network.applyRpcOverride(candidateRpcUrl)
    unsubscribe()

    expect(applied).toBe(true)
    expect(observedRpcState).toEqual([
      { activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL, isValidatingRpc: true },
      { activeRpcUrl: candidateRpcUrl, isValidatingRpc: false },
    ])
    expect(tool.read().network).toMatchObject({
      activeRpcUrl: candidateRpcUrl,
      canUseChainActions: true,
      chainId: 11_155_111,
      rpcOverrideError: null,
      status: 'connected',
    })
  })

  it('preserves the active connection when a candidate RPC reports another chain', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }, { chainId: 1 }])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()
    const applied = await tool.network.applyRpcOverride('https://mainnet.example/rpc')

    expect(applied).toBe(false)
    expect(tool.read().network).toMatchObject({
      activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
      canUseChainActions: true,
      chainId: 11_155_111,
      connectionError: null,
      isValidatingRpc: false,
      rpcOverrideError: {
        kind: 'wrong-chain',
        message: '候选 RPC 不是 Ethereum Sepolia，已保留当前 RPC。',
      },
      status: 'connected',
    })
  })

  it('rejects a non-HTTP RPC candidate without changing the active connection', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()
    const applied = await tool.network.applyRpcOverride('javascript:alert(1)')

    expect(applied).toBe(false)
    expect(tool.read().network).toMatchObject({
      activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
      canUseChainActions: true,
      isValidatingRpc: false,
      rpcOverrideError: {
        kind: 'invalid-url',
        message: '请输入有效的 HTTP(S) RPC 地址。',
      },
      status: 'connected',
    })
  })

  it('retries the active RPC only after an explicit reconnect intent', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([
      { error: new Error('temporary outage') },
      { chainId: 11_155_111 },
    ])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()
    expect(tool.read().network.status).toBe('error')

    await tool.network.reconnect()

    expect(tool.read().network).toMatchObject({
      activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
      canUseChainActions: true,
      chainId: 11_155_111,
      connectionError: null,
      status: 'connected',
    })
  })

  it('sanitizes a failed RPC override and retains the last valid endpoint', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([
      { chainId: 11_155_111 },
      { error: new Error('https://provider.example/super-secret-token') },
    ])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()
    const applied = await tool.network.applyRpcOverride('https://unavailable.example/rpc')

    expect(applied).toBe(false)
    expect(tool.read().network).toMatchObject({
      activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
      canUseChainActions: true,
      isValidatingRpc: false,
      rpcOverrideError: {
        kind: 'unreachable',
        message: '候选 RPC 无法连接，已保留当前 RPC。',
      },
      status: 'connected',
    })
    expect(JSON.stringify(tool.read())).not.toContain('super-secret-token')
  })

  it('disables chain actions if reconnecting reveals the active RPC changed chains', async () => {
    const rpc = createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }, { chainId: 1 }])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()
    await tool.network.reconnect()

    expect(tool.read().network).toMatchObject({
      canUseChainActions: false,
      chainId: null,
      connectionError: { kind: 'wrong-chain' },
      status: 'error',
    })
  })

  it('does not let reconnect race with an in-progress RPC override', async () => {
    const candidateRpcUrl = 'https://working-sepolia.example/rpc'
    const rpc = createScriptedSepoliaRpcAdapter([
      { chainId: 11_155_111 },
      { chainId: 11_155_111 },
      { error: new Error('stale reconnect result') },
    ])
    const tool = createEthereumTool({ rpc })

    await tool.network.initialize()

    const override = tool.network.applyRpcOverride(candidateRpcUrl)
    expect(tool.read().network).toMatchObject({
      canApplyRpcOverride: false,
      canReconnect: false,
      isValidatingRpc: true,
    })
    const reconnect = tool.network.reconnect()

    await Promise.all([override, reconnect])

    expect(tool.read().network).toMatchObject({
      activeRpcUrl: candidateRpcUrl,
      canUseChainActions: true,
      connectionError: null,
      status: 'connected',
    })
  })
})

describe('EthereumTool account session', () => {
  it('imports a runtime-generated private key and publishes only its public account state', async () => {
    const privateKey = generatePrivateKey()
    const rpc = createScriptedSepoliaRpcAdapter(
      [{ chainId: 11_155_111 }],
      [{ balance: 1_500_000_000_000_000_000n }],
    )
    const tool = createEthereumTool({ rpc })
    const observedStatuses: string[] = []
    const unsubscribe = tool.subscribe(({ account }) => observedStatuses.push(account.status))

    await tool.network.initialize()
    const imported = await tool.account.importPrivateKey(privateKey)
    unsubscribe()

    expect(imported).toBe(true)
    expect(tool.read().account).toMatchObject({
      address: expect.stringMatching(/^0x[0-9A-Fa-f]{40}$/),
      canLock: true,
      canRefreshBalance: true,
      ethBalance: '1.5',
      error: null,
      status: 'connected',
    })
    expect(JSON.stringify(tool.read())).not.toContain(privateKey)
    expect(Object.isFrozen(tool.read().account)).toBe(true)
    expect(observedStatuses).toContain('importing')
    expect(observedStatuses).toContain('loading-balance')
    expect(observedStatuses[observedStatuses.length - 1]).toBe('connected')
  })

  it.each([
    ['a mnemonic phrase is not supported', 'test test test test test test'],
    ['a key without the 0x prefix is not supported', generatePrivateKey().slice(2)],
    ['a keystore object is not supported', '{"crypto":{}}'],
  ])('rejects %s without retaining or echoing the input', async (_case, invalidInput) => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }]),
    })
    await tool.network.initialize()

    const imported = await tool.account.importPrivateKey(invalidInput)

    expect(imported).toBe(false)
    expect(tool.read().account).toMatchObject({
      address: null,
      canLock: false,
      error: {
        kind: 'invalid-private-key',
        message: '私钥格式无效。仅支持 0x 开头的 64 位十六进制专用测试私钥。',
      },
      ethBalance: null,
      status: 'import-error',
    })
    expect(JSON.stringify(tool.read())).not.toContain(invalidInput)
  })

  it('replaces the active account and clears the prior account-bound balance', async () => {
    const firstPrivateKey = generatePrivateKey()
    const secondPrivateKey = generatePrivateKey()
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }, { balance: 2_000_000_000_000_000_000n }],
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(firstPrivateKey)
    const firstAccount = tool.read().account

    await tool.account.importPrivateKey(secondPrivateKey)

    expect(tool.read().account.address).not.toBe(firstAccount.address)
    expect(tool.read().account).toMatchObject({
      ethBalance: '2',
      error: null,
      status: 'connected',
    })
    expect(firstAccount.ethBalance).toBe('1')
  })

  it('surfaces a sanitized balance error and recovers through manual refresh', async () => {
    const privateKey = generatePrivateKey()
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [
          { error: new Error(`failed to read ${privateKey}`) },
          { balance: 3_250_000_000_000_000_000n },
        ],
      ),
    })
    await tool.network.initialize()

    const imported = await tool.account.importPrivateKey(privateKey)

    expect(imported).toBe(true)
    expect(tool.read().account).toMatchObject({
      address: expect.stringMatching(/^0x/),
      canRefreshBalance: true,
      error: {
        kind: 'balance-unavailable',
        message: '无法读取该账户的 Sepolia ETH 余额，请手动刷新。',
      },
      ethBalance: null,
      status: 'balance-error',
    })
    expect(JSON.stringify(tool.read())).not.toContain(privateKey)

    const refreshed = await tool.account.refreshBalance()

    expect(refreshed).toBe(true)
    expect(tool.read().account).toMatchObject({
      ethBalance: '3.25',
      error: null,
      status: 'connected',
    })
  })

  it('locks the account session without changing the valid RPC connection', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 500_000_000_000_000_000n }],
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())

    tool.account.lock()

    expect(tool.read().account).toEqual({
      address: null,
      canImport: true,
      canLock: false,
      canRefreshBalance: false,
      error: null,
      ethBalance: null,
      status: 'locked',
    })
    expect(tool.read().network).toMatchObject({
      activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
      canUseChainActions: true,
      chainId: 11_155_111,
      status: 'connected',
    })
  })
})

describe('EthereumTool Token Inspector', () => {
  it('activates a compatible Token after public inspection without an account', async () => {
    const tokenAddress = '0x1111111111111111111111111111111111111111'
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [{ bytecode: '0x6000' }],
        tokenDecimals: [{ decimals: 6 }],
        tokenNames: [{ name: 'Demo USD' }],
        tokenSymbols: [{ symbol: 'DUSD' }],
      }),
    })
    await tool.network.initialize()

    const inspected = await tool.token.inspect(tokenAddress)

    expect(inspected).toBe(true)
    expect(tool.read().token).toEqual({
      address: tokenAddress,
      balance: null,
      canInspect: true,
      canTransfer: false,
      decimals: 6,
      error: null,
      name: 'Demo USD',
      status: 'compatible',
      symbol: 'DUSD',
    })
  })

  it('normalizes the Token address and requires a readable account balance', async () => {
    const privateKey = generatePrivateKey()
    const tokenAddress = '0x52908400098527886e0f7030069857d2e4169ee7'
    const checksumAddress = '0x52908400098527886E0F7030069857D2E4169EE7'
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 1_234_500n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(privateKey)

    const inspected = await tool.token.inspect(tokenAddress)

    expect(inspected).toBe(true)
    expect(tool.read().token).toMatchObject({
      address: checksumAddress,
      balance: '1.2345',
      canTransfer: true,
      decimals: 6,
      status: 'compatible',
    })
  })

  it.each([
    ['a bytecode lookup failure', { error: new Error('provider detail') }, 'bytecode-unavailable'],
    ['an address without bytecode', { bytecode: undefined }, 'no-bytecode'],
  ])('distinguishes %s', async (_case, bytecodeResponse, expectedKind) => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [bytecodeResponse],
      }),
    })
    await tool.network.initialize()

    const inspected = await tool.token.inspect('0x1111111111111111111111111111111111111111')

    expect(inspected).toBe(false)
    expect(tool.read().token).toMatchObject({
      address: null,
      canTransfer: false,
      error: { kind: expectedKind },
      status: 'error',
    })
    expect(JSON.stringify(tool.read())).not.toContain('provider detail')
  })

  it.each([0, 18])('accepts the supported decimals boundary %i', async (decimals) => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [{ bytecode: '0x6000' }],
        tokenDecimals: [{ decimals }],
        tokenNames: [{ name: 'Boundary Token' }],
        tokenSymbols: [{ symbol: 'BOUND' }],
      }),
    })
    await tool.network.initialize()

    expect(await tool.token.inspect('0x1111111111111111111111111111111111111111')).toBe(true)
    expect(tool.read().token.decimals).toBe(decimals)
  })

  it.each([
    ['an out-of-range value', { decimals: 19 }, 'invalid-decimals'],
    ['an unparseable value', { decimals: Number.NaN }, 'invalid-decimals'],
    ['a failed call', { error: new Error('decode failed') }, 'decimals-unavailable'],
  ])('does not activate a Token with %s for decimals', async (_case, response, expectedKind) => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [{ bytecode: '0x6000' }],
        tokenDecimals: [response],
      }),
    })
    await tool.network.initialize()

    expect(await tool.token.inspect('0x1111111111111111111111111111111111111111')).toBe(false)
    expect(tool.read().token).toMatchObject({
      address: null,
      canTransfer: false,
      error: { kind: expectedKind },
      status: 'error',
    })
  })

  it('falls back to the checksum address when optional metadata is unavailable', async () => {
    const tokenAddress = '0x52908400098527886E0F7030069857D2E4169EE7'
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [{ bytecode: '0x6000' }],
        tokenDecimals: [{ decimals: 18 }],
        tokenNames: [{ error: new Error('name unavailable') }],
        tokenSymbols: [{ symbol: '' }],
      }),
    })
    await tool.network.initialize()

    expect(await tool.token.inspect(tokenAddress)).toBe(true)
    expect(tool.read().token).toMatchObject({
      address: tokenAddress,
      name: tokenAddress,
      symbol: tokenAddress,
    })
  })

  it('does not make a Token transferable when balanceOf fails for the active account', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ error: new Error('balance provider detail') }],
          tokenDecimals: [{ decimals: 18 }],
          tokenNames: [{ name: 'Demo Token' }],
          tokenSymbols: [{ symbol: 'DEMO' }],
        },
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())

    expect(await tool.token.inspect('0x1111111111111111111111111111111111111111')).toBe(false)
    expect(tool.read().token).toMatchObject({
      balance: null,
      canTransfer: false,
      error: { kind: 'balance-unavailable' },
      status: 'error',
    })
    expect(JSON.stringify(tool.read())).not.toContain('balance provider detail')
  })

  it('clears the prior Token result synchronously when a new query starts', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [{ bytecode: '0x6000' }, { bytecode: undefined }],
        tokenDecimals: [{ decimals: 6 }],
        tokenNames: [{ name: 'Old Token' }],
        tokenSymbols: [{ symbol: 'OLD' }],
      }),
    })
    await tool.network.initialize()
    await tool.token.inspect('0x1111111111111111111111111111111111111111')

    const nextInspection = tool.token.inspect('0x2222222222222222222222222222222222222222')

    expect(tool.read().token).toMatchObject({
      address: null,
      balance: null,
      decimals: null,
      name: null,
      status: 'inspecting',
      symbol: null,
    })
    await nextInspection
  })

  it('automatically checks the active Token balance after account import', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 42_500_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
    })
    await tool.network.initialize()
    await tool.token.inspect('0x1111111111111111111111111111111111111111')

    await tool.account.importPrivateKey(generatePrivateKey())

    expect(tool.read().token).toMatchObject({
      balance: '42.5',
      canTransfer: true,
      error: null,
      status: 'compatible',
    })
  })

  it('retains public Token metadata but clears its account balance after lock', async () => {
    const tokenAddress = '0x1111111111111111111111111111111111111111'
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 25_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    tool.account.lock()

    expect(tool.read().token).toMatchObject({
      address: tokenAddress,
      balance: null,
      canTransfer: false,
      decimals: 6,
      error: null,
      name: 'Demo USD',
      status: 'compatible',
      symbol: 'DUSD',
    })
  })

  it('returns to the empty state when lock cancels an in-progress public inspection', async () => {
    let resolveBytecode: (() => void) | undefined
    const rpc = createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
      tokenDecimals: [{ decimals: 6 }],
      tokenNames: [{ name: 'Demo USD' }],
      tokenSymbols: [{ symbol: 'DUSD' }],
    })
    rpc.getBytecode = async () => {
      await new Promise<void>((resolve) => {
        resolveBytecode = resolve
      })
      return '0x6000'
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()

    const inspection = tool.token.inspect('0x1111111111111111111111111111111111111111')
    expect(tool.read().token.status).toBe('inspecting')

    tool.account.lock()

    expect(tool.read().token).toMatchObject({
      address: null,
      canInspect: true,
      error: null,
      status: 'idle',
    })
    resolveBytecode?.()
    await inspection
    expect(tool.read().token.status).toBe('idle')
  })

  it('refreshes the active Token balance with an explicit account balance refresh', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }, { balance: 2_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 25_000_000n }, { balance: 50_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect('0x1111111111111111111111111111111111111111')
    expect(tool.read().token.balance).toBe('25')

    await tool.account.refreshBalance()

    expect(tool.read().account.ethBalance).toBe('2')
    expect(tool.read().token).toMatchObject({
      balance: '50',
      canTransfer: true,
      status: 'compatible',
    })
  })
})

describe('EthereumTool Token Transfer', () => {
  const tokenAddress = '0x1111111111111111111111111111111111111111'
  const recipient = '0x2222222222222222222222222222222222222222'
  const preparedTransaction: PreparedTokenTransfer = {
    chainId: 11_155_111,
    data: '0xa9059cbb',
    gas: 50_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    nonce: 0,
    to: tokenAddress,
    type: 'eip1559',
    value: 0n,
  }

  function auditTransferRpcStages(rpc: SepoliaRpcAdapter) {
    const stages: string[] = []
    const auditedRpc: SepoliaRpcAdapter = {
      ...rpc,
      async prepareTokenTransfer(...args) {
        stages.push('prepare')
        return rpc.prepareTokenTransfer(...args)
      },
      async sendRawTransaction(...args) {
        stages.push('broadcast')
        return rpc.sendRawTransaction(...args)
      },
    }

    return { rpc: auditedRpc, stages }
  }

  async function createTransferReadyTool() {
    const audit = auditTransferRpcStages(
      createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 1_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
    )
    const tool = createEthereumTool({ rpc: audit.rpc })
    const statuses: string[] = []
    tool.subscribe(({ transfer }) => statuses.push(transfer.status))
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)
    return { stages: audit.stages, statuses, tool }
  }

  function expectStoppedBeforeSigning(stages: string[], statuses: string[]) {
    expect(statuses).not.toContain('signing')
    expect(stages).toEqual([])
  }

  it('rejects the active account as the recipient before signing', async () => {
    const { stages, statuses, tool } = await createTransferReadyTool()

    const submitted = await tool.transfer.submit({
      amount: '1',
      recipient: tool.read().account.address ?? '',
    })

    expect(submitted).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      error: {
        kind: 'self-recipient',
        message: '收款地址不能是当前专用测试账户地址。',
      },
      status: 'editing',
    })
    expectStoppedBeforeSigning(stages, statuses)
  })

  it('rejects an amount with more precision than the active Token supports', async () => {
    const { stages, statuses, tool } = await createTransferReadyTool()

    const submitted = await tool.transfer.submit({
      amount: '0.0000001',
      recipient,
    })

    expect(submitted).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      error: {
        kind: 'invalid-amount',
        message: '展示金额最多支持当前 Token 的 6 位小数。',
      },
      status: 'editing',
    })
    expectStoppedBeforeSigning(stages, statuses)
  })

  it.each([
    ['zero', '0'],
    ['a negative value', '-1'],
    ['scientific notation', '1e3'],
    ['more than the readable balance', '1.000001'],
  ])('rejects %s as the transfer amount', async (_case, amount) => {
    const { stages, statuses, tool } = await createTransferReadyTool()

    expect(
      await tool.transfer.submit({
        amount,
        recipient,
      }),
    ).toBe(false)
    expect(tool.read().transfer.status).toBe('editing')
    expect(tool.read().transfer.error?.kind).toMatch(/invalid-amount|amount-exceeds-balance/)
    expectStoppedBeforeSigning(stages, statuses)
  })

  it.each([
    ['a malformed address', 'not-an-address', 'invalid-recipient'],
    ['the zero address', '0x0000000000000000000000000000000000000000', 'zero-recipient'],
  ])('rejects %s before transfer simulation', async (_case, recipient, expectedKind) => {
    const { stages, statuses, tool } = await createTransferReadyTool()

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      error: { kind: expectedKind },
      status: 'editing',
    })
    expectStoppedBeforeSigning(stages, statuses)
  })

  it('stops before preparation and signing when transfer simulation does not return true', async () => {
    let preparationCalls = 0
    let rawTransactionSubmissions = 0
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 1_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transferSimulations: [{ result: false }],
        },
      ),
      async prepareTokenTransfer() {
        preparationCalls += 1
        throw new Error('must not prepare')
      },
      async sendRawTransaction() {
        rawTransactionSubmissions += 1
        throw new Error('must not broadcast')
      },
    }
    const tool = createEthereumTool({ rpc })
    const observedStatuses: string[] = []
    tool.subscribe(({ transfer }) => observedStatuses.push(transfer.status))
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect('0x1111111111111111111111111111111111111111')

    expect(
      await tool.transfer.submit({
        amount: '1',
        recipient: '0x2222222222222222222222222222222222222222',
      }),
    ).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      error: { kind: 'simulation-failed' },
      hash: null,
      status: 'editing',
    })
    expect(observedStatuses).not.toContain('signing')
    expect(preparationCalls).toBe(0)
    expect(rawTransactionSubmissions).toBe(0)
  })

  it.each([
    ['no return value', new Error('empty contract return data')],
    ['undecodable return value', new Error('cannot decode bool')],
    ['a failed call', new Error('execution reverted with sensitive details')],
  ])('sanitizes %s from transfer simulation before signing', async (_case, simulationError) => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 1_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transferSimulations: [{ error: simulationError }],
        },
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      error: {
        kind: 'simulation-failed',
        message: 'Token transfer 模拟未返回 true，已在签名前停止。',
      },
      hash: null,
      status: 'editing',
    })
    expect(JSON.stringify(tool.read())).not.toContain(simulationError.message)
  })

  it('reports each missing transfer prerequisite through the public snapshot', async () => {
    const wrongChainAudit = auditTransferRpcStages(
      createScriptedSepoliaRpcAdapter([{ chainId: 1 }]),
    )
    const wrongChainTool = createEthereumTool({
      rpc: wrongChainAudit.rpc,
    })
    await wrongChainTool.network.initialize()
    expect(await wrongChainTool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(wrongChainTool.read().transfer).toMatchObject({
      error: { kind: 'network-unavailable' },
      isFormVisible: false,
      unavailableReason: 'Sepolia 网络当前不可用，请先恢复正确的链连接。',
    })
    expect(wrongChainAudit.stages).toEqual([])

    const missingAccountAudit = auditTransferRpcStages(
      createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }]),
    )
    const missingAccountTool = createEthereumTool({
      rpc: missingAccountAudit.rpc,
    })
    await missingAccountTool.network.initialize()
    expect(await missingAccountTool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(missingAccountTool.read().transfer).toMatchObject({
      error: { kind: 'account-unavailable' },
      isFormVisible: false,
      unavailableReason: '缺少活动的专用测试账户，请先导入账户。',
    })
    expect(missingAccountAudit.stages).toEqual([])

    const missingTokenAudit = auditTransferRpcStages(
      createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
      ),
    )
    const missingTokenTool = createEthereumTool({
      rpc: missingTokenAudit.rpc,
    })
    await missingTokenTool.network.initialize()
    await missingTokenTool.account.importPrivateKey(generatePrivateKey())
    expect(await missingTokenTool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(missingTokenTool.read().transfer).toMatchObject({
      error: { kind: 'token-unavailable' },
      isFormVisible: false,
      unavailableReason: '尚未激活可转账的目标 Token，请先查询 Token。',
    })
    expect(missingTokenAudit.stages).toEqual([])

    const missingTokenBalanceAudit = auditTransferRpcStages(
      createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ error: new Error('provider token leaked here') }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
    )
    const missingTokenBalanceTool = createEthereumTool({
      rpc: missingTokenBalanceAudit.rpc,
    })
    await missingTokenBalanceTool.network.initialize()
    await missingTokenBalanceTool.account.importPrivateKey(generatePrivateKey())
    await missingTokenBalanceTool.token.inspect(tokenAddress)
    expect(await missingTokenBalanceTool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(missingTokenBalanceTool.read().transfer).toMatchObject({
      error: { kind: 'token-balance-unavailable' },
      hash: null,
      isFormVisible: false,
      status: 'editing',
      unavailableReason: '无法读取当前账户的 Token 余额，不能进行转账预检查。',
    })
    expect(missingTokenBalanceAudit.stages).toEqual([])
  })

  it('stops before signing when the prepared maximum fee exceeds the ETH balance', async () => {
    const audit = auditTransferRpcStages(
      createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [{ balance: 1n }], {
        bytecodes: [{ bytecode: '0x6000' }],
        preparedTransfers: [{ transaction: preparedTransaction }],
        tokenBalances: [{ balance: 1_000_000n }],
        tokenDecimals: [{ decimals: 6 }],
        tokenNames: [{ name: 'Demo USD' }],
        tokenSymbols: [{ symbol: 'DUSD' }],
        transferSimulations: [{ result: true }],
      }),
    )
    const tool = createEthereumTool({
      rpc: audit.rpc,
    })
    const statuses: string[] = []
    tool.subscribe(({ transfer }) => statuses.push(transfer.status))
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    expect(
      await tool.transfer.submit({
        amount: '1',
        recipient: '0x2222222222222222222222222222222222222222',
      }),
    ).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      error: { kind: 'insufficient-eth' },
      hash: null,
      status: 'editing',
    })
    expect(statuses).not.toContain('signing')
    expect(audit.stages).toEqual(['prepare'])
  })

  it('keeps an ambiguous broadcast attached to its original hash and blocks replacement intents', async () => {
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          preparedTransfers: [{ transaction: preparedTransaction }],
          tokenBalances: [{ balance: 1_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transferSimulations: [{ result: true }],
        },
      ),
      async sendRawTransaction() {
        throw new Error('ambiguous provider failure')
      },
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)
    const accountAddress = tool.read().account.address

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      canReplay: true,
      canSubmit: false,
      error: {
        kind: 'broadcast-uncertain',
        message: expect.stringContaining('交易可能已到达网络'),
      },
      hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      requiresRecovery: true,
      status: 'broadcast-error',
    })

    expect(await tool.token.inspect('0x3333333333333333333333333333333333333333')).toBe(false)
    expect(tool.read().account).toMatchObject({ address: accountAddress, canLock: true })
    expect(tool.account.lock()).toBe(false)
    expect(tool.read().account.address).toBe(accountAddress)
    expect(tool.read().transfer).toMatchObject({
      hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      requiresRecovery: true,
      status: 'broadcast-error',
    })

    expect(tool.account.lock({ discardUnresolvedTransaction: true })).toBe(true)
    expect(tool.read().account.address).toBeNull()
    expect(tool.read().transfer).toMatchObject({
      hash: null,
      requiresRecovery: false,
      status: 'editing',
    })
  })

  it('queries the original ambiguous hash and unlocks new work after a successful receipt', async () => {
    const queriedHashes: Hex[] = []
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }, { balance: 750_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          preparedTransfers: [{ transaction: preparedTransaction }],
          tokenBalances: [{ balance: 1_000_000n }, { balance: 500_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transferSimulations: [{ result: true }],
        },
      ),
      async getTransactionStatus(_rpcUrl: string, transactionHash: Hex) {
        queriedHashes.push(transactionHash)
        return { confirmations: 1, status: 'success' as const }
      },
      async sendRawTransaction() {
        throw new Error('ambiguous provider failure')
      },
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    const originalHash = tool.read().transfer.hash
    expect(originalHash).toMatch(/^0x[0-9a-f]{64}$/)

    expect(await tool.transfer.queryStatus()).toBe(true)
    expect(queriedHashes).toEqual([originalHash])
    expect(tool.read().transfer).toMatchObject({
      canSubmit: false,
      error: null,
      hash: originalHash,
      status: 'success',
    })
    expect(tool.read().account.ethBalance).toBe('0.75')
    expect(tool.read().token.balance).toBe('0.5')

    tool.transfer.startNew()
    expect(tool.read().transfer).toMatchObject({ canSubmit: true, hash: null, status: 'editing' })
  })

  it('keeps recovery attached to the original hash while that transaction is pending', async () => {
    let queryCount = 0
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          preparedTransfers: [{ transaction: preparedTransaction }],
          tokenBalances: [{ balance: 1_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transferSimulations: [{ result: true }],
        },
      ),
      async getTransactionStatus() {
        queryCount += 1
        return { status: 'pending' as const }
      },
      async sendRawTransaction() {
        throw new Error('ambiguous provider failure')
      },
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    const originalHash = tool.read().transfer.hash
    expect(await tool.transfer.queryStatus()).toBe(false)
    expect(queryCount).toBe(1)
    expect(tool.read().transfer).toMatchObject({
      canQueryStatus: true,
      canReplay: true,
      error: null,
      hash: originalHash,
      requiresRecovery: true,
      status: 'confirming',
    })
  })

  it('replays the exact signed bytes without simulating, preparing, or signing a replacement', async () => {
    const submittedPayloads: Hex[] = []
    const queriedHashes: Hex[] = []
    const transferStages: string[] = []
    let simulationCount = 0
    let preparationCount = 0
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }, { balance: 750_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 1_000_000n }, { balance: 500_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
      async getTransactionStatus(_rpcUrl: string, transactionHash: Hex) {
        queriedHashes.push(transactionHash)
        return { confirmations: 1, status: 'success' as const }
      },
      async prepareTokenTransfer() {
        preparationCount += 1
        return preparedTransaction
      },
      async sendRawTransaction(_rpcUrl: string, signedTransaction: Hex) {
        submittedPayloads.push(signedTransaction)

        if (submittedPayloads.length === 1) {
          throw new Error('ambiguous provider failure')
        }

        return keccak256(signedTransaction)
      },
      async simulateTokenTransfer() {
        simulationCount += 1
        return true
      },
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)
    const unsubscribe = tool.subscribe(({ transfer }) => transferStages.push(transfer.status))

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    const originalHash = tool.read().transfer.hash

    expect(await tool.transfer.replay()).toBe(true)
    unsubscribe()

    expect(submittedPayloads).toHaveLength(2)
    expect(submittedPayloads[1]).toBe(submittedPayloads[0])
    expect(keccak256(submittedPayloads[1] ?? '0x')).toBe(originalHash)
    expect(queriedHashes).toEqual([originalHash])
    expect(simulationCount).toBe(1)
    expect(preparationCount).toBe(1)
    expect(transferStages.filter((status) => status === 'checking')).toHaveLength(1)
    expect(transferStages.filter((status) => status === 'signing')).toHaveLength(1)
    expect(transferStages.filter((status) => status === 'replaying')).toHaveLength(1)
    expect(tool.read().transfer).toMatchObject({
      canSubmit: false,
      error: null,
      hash: originalHash,
      status: 'success',
    })
    expect(JSON.stringify(tool.read())).not.toContain(submittedPayloads[0])
  })

  it('reports a reverted receipt as an execution failure and retains the submitted hash', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          preparedTransfers: [{ transaction: preparedTransaction }],
          tokenBalances: [{ balance: 1_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transactionReceipts: [{ confirmations: 1, status: 'reverted' }],
          transferSimulations: [{ result: true }],
        },
      ),
    })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      canSubmit: false,
      error: {
        kind: 'execution-failed',
        message: '交易已被 Sepolia 收录，但链上执行失败。',
      },
      hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      status: 'failed',
    })

    tool.transfer.startNew()
    expect(tool.read().transfer).toMatchObject({ error: null, hash: null, status: 'editing' })
  })

  it('becomes unknown after the 120-second observation window and requeries the same hash', async () => {
    const queriedHashes: Hex[] = []
    const scriptedRpc = createScriptedSepoliaRpcAdapter(
      [{ chainId: 11_155_111 }],
      [{ balance: 1_000_000_000_000_000_000n }],
      {
        bytecodes: [{ bytecode: '0x6000' }],
        preparedTransfers: [{ transaction: preparedTransaction }],
        tokenBalances: [{ balance: 1_000_000n }],
        tokenDecimals: [{ decimals: 6 }],
        tokenNames: [{ name: 'Demo USD' }],
        tokenSymbols: [{ symbol: 'DUSD' }],
        transferSimulations: [{ result: true }],
      },
    )
    let observedTimeoutMs = 0
    let queryCount = 0
    const rpc = {
      ...scriptedRpc,
      async getTransactionStatus(_rpcUrl: string, transactionHash: Hex) {
        queriedHashes.push(transactionHash)
        queryCount += 1
        return queryCount === 1 ? null : { confirmations: 1, status: 'reverted' as const }
      },
      async waitForTransactionReceipt(_rpcUrl: string, _hash: Hex, timeoutMs: number) {
        observedTimeoutMs = timeoutMs
        return null
      },
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    const originalHash = tool.read().transfer.hash
    expect(observedTimeoutMs).toBe(120_000)
    expect(tool.read().transfer).toMatchObject({
      canQueryStatus: true,
      error: { kind: 'confirmation-unknown' },
      hash: originalHash,
      status: 'unknown',
    })

    expect(await tool.transfer.queryStatus()).toBe(false)
    expect(tool.read().transfer.status).toBe('unknown')
    expect(await tool.transfer.queryStatus()).toBe(false)
    expect(queriedHashes).toEqual([originalHash, originalHash])
    expect(tool.read().transfer).toMatchObject({
      error: { kind: 'execution-failed' },
      hash: originalHash,
      status: 'failed',
    })
  })

  it('does not leave confirming early when receipt observation fails before the deadline', async () => {
    vi.useFakeTimers()

    try {
      const rpc = {
        ...createScriptedSepoliaRpcAdapter(
          [{ chainId: 11_155_111 }],
          [{ balance: 1_000_000_000_000_000_000n }],
          {
            bytecodes: [{ bytecode: '0x6000' }],
            preparedTransfers: [{ transaction: preparedTransaction }],
            tokenBalances: [{ balance: 1_000_000n }],
            tokenDecimals: [{ decimals: 6 }],
            tokenNames: [{ name: 'Demo USD' }],
            tokenSymbols: [{ symbol: 'DUSD' }],
            transferSimulations: [{ result: true }],
          },
        ),
        async waitForTransactionReceipt() {
          throw new Error('temporary receipt provider failure')
        },
      }
      const tool = createEthereumTool({ rpc })
      await tool.network.initialize()
      await tool.account.importPrivateKey(generatePrivateKey())
      await tool.token.inspect(tokenAddress)

      const submission = tool.transfer.submit({ amount: '1', recipient })
      await vi.advanceTimersByTimeAsync(0)
      expect(tool.read().transfer.status).toBe('confirming')

      await vi.advanceTimersByTimeAsync(119_999)
      expect(tool.read().transfer.status).toBe('confirming')

      await vi.advanceTimersByTimeAsync(1)
      await expect(submission).resolves.toBe(false)
      expect(tool.read().transfer).toMatchObject({
        error: { kind: 'confirmation-unknown' },
        status: 'unknown',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports an explicitly rejected raw transaction without retrying or retaining signed bytes', async () => {
    let rawTransactionSubmissions = 0
    let receiptObservations = 0
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          preparedTransfers: [{ transaction: preparedTransaction }],
          tokenBalances: [{ balance: 1_000_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transferSimulations: [{ result: true }],
        },
      ),
      async sendRawTransaction() {
        rawTransactionSubmissions += 1
        throw new RawTransactionRejectedError()
      },
      async waitForTransactionReceipt() {
        receiptObservations += 1
        return null
      },
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)

    expect(await tool.transfer.submit({ amount: '1', recipient })).toBe(false)
    expect(rawTransactionSubmissions).toBe(1)
    expect(receiptObservations).toBe(0)
    expect(tool.read().transfer).toMatchObject({
      canSubmit: false,
      error: { kind: 'broadcast-failed', message: expect.stringContaining('不会自动重试') },
      hash: null,
      status: 'broadcast-failed',
    })

    tool.transfer.startNew()
    expect(tool.read().transfer).toMatchObject({ canSubmit: true, status: 'editing' })
  })

  it('submits the exact minimum-unit amount and reports success only after confirmation', async () => {
    const privateKey = generatePrivateKey()
    const transferCalls: string[] = []
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }, { balance: 750_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          tokenBalances: [{ balance: 1_500_000n }, { balance: 265_500n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
        },
      ),
      async prepareTokenTransfer(_rpcUrl: string, input: { amount: bigint }) {
        transferCalls.push(`prepare:${input.amount}`)
        return preparedTransaction
      },
      async sendRawTransaction(_rpcUrl: string, signedTransaction: Hex) {
        transferCalls.push('send')
        return keccak256(signedTransaction)
      },
      async simulateTokenTransfer(_rpcUrl: string, input: { amount: bigint }) {
        transferCalls.push(`simulate:${input.amount}`)
        return true
      },
      async waitForTransactionReceipt() {
        transferCalls.push('receipt')
        return { confirmations: 1, status: 'success' as const }
      },
    }
    const tool = createEthereumTool({ rpc })
    await tool.network.initialize()
    await tool.account.importPrivateKey(privateKey)
    await tool.token.inspect(tokenAddress)
    const observedSnapshots: ReturnType<typeof tool.read>[] = []
    const unsubscribe = tool.subscribe((snapshot) => observedSnapshots.push(snapshot))

    const submitted = await tool.transfer.submit({ amount: '1.2345', recipient })
    unsubscribe()

    expect(submitted).toBe(true)
    expect(transferCalls).toEqual(['simulate:1234500', 'prepare:1234500', 'send', 'receipt'])
    expect(
      observedSnapshots
        .map(({ transfer }) => transfer.status)
        .filter((status, index, statuses) => status !== statuses[index - 1]),
    ).toEqual(['checking', 'signing', 'submitting', 'confirming', 'success'])
    expect(observedSnapshots.find(({ transfer }) => transfer.status === 'checking')).toMatchObject({
      account: { address: expect.stringMatching(/^0x/), ethBalance: '1' },
      network: { chainId: 11_155_111, status: 'connected' },
      token: { address: tokenAddress, balance: '1.5', canTransfer: true },
    })
    expect(observedSnapshots.find(({ transfer }) => transfer.status === 'success')).toMatchObject({
      account: { ethBalance: '0.75' },
      token: { balance: '0.2655' },
    })
    expect(tool.read().transfer).toMatchObject({
      canSubmit: false,
      error: null,
      hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      status: 'success',
    })
    expect(tool.read().account.ethBalance).toBe('0.75')
    expect(tool.read().token.balance).toBe('0.2655')
    expect(JSON.stringify(tool.read())).not.toContain(privateKey)

    expect(await tool.transfer.submit({ amount: '0.1', recipient })).toBe(false)
    expect(transferCalls).toHaveLength(4)

    expect(await tool.token.inspect('0x3333333333333333333333333333333333333333')).toBe(false)
    expect(tool.read().transfer).toMatchObject({
      hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      recipient,
      status: 'success',
    })

    tool.transfer.startNew()
    expect(tool.read().transfer).toMatchObject({
      canSubmit: true,
      error: null,
      hash: null,
      recipient,
      status: 'editing',
    })
  })
})
