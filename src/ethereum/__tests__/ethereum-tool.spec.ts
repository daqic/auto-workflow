import { describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'

import { DEFAULT_SEPOLIA_RPC_URL, createEthereumTool } from '@/ethereum/ethereum-tool'
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
