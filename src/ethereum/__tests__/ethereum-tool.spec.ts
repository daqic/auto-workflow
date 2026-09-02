import { describe, expect, it } from 'vitest'

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

    expect(tool.read()).toEqual({
      network: {
        activeRpcUrl: DEFAULT_SEPOLIA_RPC_URL,
        canApplyRpcOverride: true,
        canReconnect: true,
        canUseChainActions: true,
        chainId: 11_155_111,
        connectionError: null,
        isValidatingRpc: false,
        rpcOverrideError: null,
        status: 'connected',
      },
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
