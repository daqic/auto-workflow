import { describe, expect, it, vi } from 'vitest'
import { keccak256, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { flushPromises, mount } from '@vue/test-utils'

import { createEthereumTool } from '@/ethereum/ethereum-tool'
import type { PreparedTokenTransfer } from '@/ethereum/sepolia-rpc-adapter'
import { createScriptedSepoliaRpcAdapter } from '@/ethereum/testing/scripted-sepolia-rpc-adapter'
import { ethereumToolKey } from '@/ethereum/vue-ethereum-tool'
import EthereumToolView from '@/views/EthereumToolView.vue'

describe('EthereumToolView network status', () => {
  it('shows the active Sepolia connection after startup validation succeeds', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }]),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })

    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Ethereum Sepolia 工具 Demo')
    expect(wrapper.get('[data-testid="network-status"]').text()).toContain('已连接')
    expect(wrapper.text()).toContain('https://ethereum-sepolia-rpc.publicnode.com')
    expect(wrapper.get('[data-testid="transfer-unavailable"]').text()).toContain(
      '缺少活动的专用测试账户',
    )
  })

  it('keeps recovery controls available after startup fails and reconnects on demand', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([
        { error: new Error('offline') },
        { chainId: 11_155_111 },
      ]),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })

    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('链上操作暂不可用')
    expect(wrapper.get('[data-testid="network-status"]').text()).toContain('连接失败')
    expect(wrapper.get('[data-testid="transfer-unavailable"]').text()).toContain(
      'Sepolia 网络当前不可用',
    )

    await wrapper.get('button[name="reconnect"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="network-status"]').text()).toContain('已连接')
  })

  it('keeps the active endpoint visible when an RPC override fails validation', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }, { chainId: 1 }]),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })

    await flushPromises()
    await wrapper.get('input[name="rpc-url"]').setValue('https://mainnet.example/rpc')
    await wrapper.get('form.rpc-form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="rpc-override-error"]').text()).toContain('已保留当前 RPC')
    expect(wrapper.get('[data-testid="active-rpc-url"]').text()).toContain(
      'https://ethereum-sepolia-rpc.publicnode.com',
    )
  })
})

describe('EthereumToolView account session', () => {
  it('clears the private-key field and exposes only the public account controls', async () => {
    const privateKey = generatePrivateKey()
    const address = privateKeyToAccount(privateKey).address
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_500_000_000_000_000_000n }, { balance: 2_000_000_000_000_000_000n }],
      ),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })
    await flushPromises()

    const privateKeyInput = wrapper.get<HTMLInputElement>('input[name="private-key"]')
    expect(privateKeyInput.attributes()).toMatchObject({
      autocomplete: 'off',
      spellcheck: 'false',
      type: 'password',
    })

    await privateKeyInput.setValue(privateKey)
    await wrapper.get('form[data-testid="account-import-form"]').trigger('submit')
    await flushPromises()

    const accountLink = wrapper.get('[data-testid="account-address"]')
    expect(accountLink.text()).toBe(address)
    expect(accountLink.attributes()).toMatchObject({
      href: `https://sepolia.etherscan.io/address/${address}`,
      rel: 'noopener noreferrer',
      target: '_blank',
    })
    expect(wrapper.get('[data-testid="eth-balance"]').text()).toBe('1.5 ETH')
    expect(wrapper.text()).not.toContain(privateKey)

    await wrapper.get('button[name="refresh-account-balance"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="eth-balance"]').text()).toBe('2 ETH')

    await wrapper.get('button[name="lock-account"]').trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('input[name="private-key"]').element.value).toBe('')
    expect(wrapper.get('[data-testid="account-status"]').text()).toContain('已锁定')
  })

  it('keeps the active account visible when balance loading fails and allows refresh', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [
          { error: new Error('provider detail must stay private') },
          { balance: 250_000_000_000_000_000n },
        ],
      ),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })
    await flushPromises()
    await wrapper.get('input[name="private-key"]').setValue(generatePrivateKey())
    await wrapper.get('form[data-testid="account-import-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="account-status"]').text()).toContain('余额读取错误')
    expect(wrapper.get('[data-testid="account-error"]').text()).toContain('请手动刷新')
    expect(wrapper.get('[data-testid="account-error"]').text()).not.toContain('provider detail')

    await wrapper.get('button[name="refresh-account-balance"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="account-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="eth-balance"]').text()).toBe('0.25 ETH')
  })
})

describe('EthereumToolView Token Inspector', () => {
  it('waits for an explicit query and renders the compatible public Token result', async () => {
    const tokenAddress = '0x1111111111111111111111111111111111111111'
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [{ bytecode: '0x6000' }],
        tokenDecimals: [{ decimals: 6 }],
        tokenNames: [{ name: 'Demo USD' }],
        tokenSymbols: [{ symbol: 'DUSD' }],
      }),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })
    await flushPromises()

    const input = wrapper.get('input[name="token-address"]')
    await input.setValue(tokenAddress)

    expect(wrapper.get('[data-testid="token-empty-state"]').text()).toContain('尚未查询')
    expect(tool.read().token.status).toBe('idle')

    await wrapper.get('form[data-testid="token-inspector-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="token-compatibility"]').text()).toContain('兼容性检查通过')
    expect(wrapper.get('[data-testid="token-name"]').text()).toBe('Demo USD')
    expect(wrapper.get('[data-testid="token-symbol"]').text()).toBe('DUSD')
    expect(wrapper.get('[data-testid="token-decimals"]').text()).toBe('6')
    expect(wrapper.get('[data-testid="token-balance"]').text()).toContain('余额尚不可用')
    expect(wrapper.get('[data-testid="token-address"]').attributes()).toMatchObject({
      href: `https://sepolia.etherscan.io/token/${tokenAddress}`,
      rel: 'noopener noreferrer',
      target: '_blank',
    })
  })

  it('renders a specific inline error when the address has no bytecode', async () => {
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [], {
        bytecodes: [{ bytecode: undefined }],
      }),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })
    await flushPromises()

    await wrapper
      .get('input[name="token-address"]')
      .setValue('0x1111111111111111111111111111111111111111')
    await wrapper.get('form[data-testid="token-inspector-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="token-error"]').text()).toContain('未检测到合约字节码')
    expect(wrapper.find('[data-testid="token-compatibility"]').exists()).toBe(false)
  })
})

describe('EthereumToolView Token Transfer', () => {
  it('uses Max and keeps a confirmed transfer locked until a new transfer starts', async () => {
    const tokenAddress = '0x1111111111111111111111111111111111111111'
    const recipient = '0x52908400098527886e0f7030069857d2e4169ee7'
    const checksumRecipient = '0x52908400098527886E0F7030069857D2E4169EE7'
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
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }, { balance: 750_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          preparedTransfers: [{ transaction: preparedTransaction }],
          tokenBalances: [{ balance: 1_500_000n }, { balance: 0n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transactionReceipts: [{ confirmations: 1, status: 'success' }],
          transferSimulations: [{ result: true }],
        },
      ),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })
    await flushPromises()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)
    await flushPromises()

    await wrapper.get('button[name="transfer-max"]').trigger('click')
    expect(wrapper.get<HTMLInputElement>('input[name="transfer-amount"]').element.value).toBe('1.5')
    await wrapper.get('input[name="transfer-recipient"]').setValue(recipient)
    await wrapper.get('form[data-testid="token-transfer-form"]').trigger('submit')
    await flushPromises()

    const transactionLink = wrapper.get('[data-testid="transaction-hash"]')
    expect(transactionLink.text()).toMatch(/^0x[0-9a-f]{64}$/)
    expect(transactionLink.attributes()).toMatchObject({
      href: `https://sepolia.etherscan.io/tx/${transactionLink.text()}`,
      rel: 'noopener noreferrer',
      target: '_blank',
    })
    expect(wrapper.get('[data-testid="transfer-status"]').text()).toContain('执行成功')
    expect(wrapper.get<HTMLInputElement>('input[name="transfer-amount"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('input[name="transfer-recipient"]').element.value).toBe(
      checksumRecipient,
    )
    expect(
      wrapper.get('button[type="submit"][name="submit-transfer"]').attributes(),
    ).toHaveProperty('disabled')

    await wrapper.get('button[name="new-transfer"]').trigger('click')
    expect(wrapper.find('[data-testid="transaction-hash"]').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('input[name="transfer-recipient"]').element.value).toBe(
      checksumRecipient,
    )
    expect(
      wrapper.get('button[type="submit"][name="submit-transfer"]').attributes(),
    ).not.toHaveProperty('disabled')
  })

  it('associates field errors and offers only the official faucet directory for insufficient ETH', async () => {
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
    const tool = createEthereumTool({
      rpc: createScriptedSepoliaRpcAdapter([{ chainId: 11_155_111 }], [{ balance: 1n }], {
        bytecodes: [{ bytecode: '0x6000' }],
        preparedTransfers: [{ transaction: preparedTransaction }],
        tokenBalances: [{ balance: 1_500_000n }],
        tokenDecimals: [{ decimals: 6 }],
        tokenNames: [{ name: 'Demo USD' }],
        tokenSymbols: [{ symbol: 'DUSD' }],
        transferSimulations: [{ result: true }],
      }),
    })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })
    await flushPromises()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)
    await flushPromises()

    await wrapper.get('input[name="transfer-recipient"]').setValue('not-an-address')
    await wrapper.get('input[name="transfer-amount"]').setValue('1')
    await wrapper.get('form[data-testid="token-transfer-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="transfer-recipient-error"]').text()).toContain(
      '有效的 Ethereum 收款地址',
    )
    expect(wrapper.get('input[name="transfer-recipient"]').attributes()).toMatchObject({
      'aria-describedby': 'transfer-recipient-help transfer-recipient-error',
      'aria-invalid': 'true',
    })

    await wrapper.get('input[name="transfer-recipient"]').setValue(recipient)
    await wrapper.get('form[data-testid="token-transfer-form"]').trigger('submit')
    await flushPromises()

    const faucetLink = wrapper.get('a[href="https://ethereum.org/developers/docs/networks/"]')
    expect(wrapper.get('[data-testid="transfer-error"]').text()).toContain('Sepolia ETH 余额不足')
    expect(faucetLink.text()).toContain('ethereum.org Sepolia faucet 目录')
    expect(faucetLink.attributes()).toMatchObject({
      rel: 'noopener noreferrer',
      target: '_blank',
    })
  })

  it('shows explicit ambiguous-broadcast recovery and warns before discarding it', async () => {
    const tokenAddress = '0x1111111111111111111111111111111111111111'
    const recipient = '0x2222222222222222222222222222222222222222'
    const submittedPayloads: Hex[] = []
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
    const rpc = {
      ...createScriptedSepoliaRpcAdapter(
        [{ chainId: 11_155_111 }],
        [{ balance: 1_000_000_000_000_000_000n }],
        {
          bytecodes: [{ bytecode: '0x6000' }],
          preparedTransfers: [{ transaction: preparedTransaction }],
          tokenBalances: [{ balance: 1_500_000n }],
          tokenDecimals: [{ decimals: 6 }],
          tokenNames: [{ name: 'Demo USD' }],
          tokenSymbols: [{ symbol: 'DUSD' }],
          transferSimulations: [{ result: true }],
        },
      ),
      async getTransactionStatus() {
        return null
      },
      async sendRawTransaction(_rpcUrl: string, signedTransaction: Hex) {
        submittedPayloads.push(signedTransaction)

        if (submittedPayloads.length === 1) {
          throw new Error('ambiguous provider failure')
        }

        return keccak256(signedTransaction)
      },
    }
    const tool = createEthereumTool({ rpc })
    const wrapper = mount(EthereumToolView, {
      global: {
        provide: {
          [ethereumToolKey]: tool,
        },
      },
    })
    await flushPromises()
    await tool.account.importPrivateKey(generatePrivateKey())
    await tool.token.inspect(tokenAddress)
    await flushPromises()

    await wrapper.get('input[name="transfer-recipient"]').setValue(recipient)
    await wrapper.get('input[name="transfer-amount"]').setValue('1')
    await wrapper.get('form[data-testid="token-transfer-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="transfer-recovery-warning"]').text()).toContain(
      '交易可能已经到达网络',
    )
    expect(wrapper.get('button[name="submit-transfer"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.find('button[name="query-transfer-status"]').exists()).toBe(true)
    expect(wrapper.get('button[name="replay-transfer"]').text()).toContain('重播原交易')

    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnloadEvent)
    expect(beforeUnloadEvent.defaultPrevented).toBe(true)

    await wrapper.get('button[name="replay-transfer"]').trigger('click')
    await flushPromises()
    expect(submittedPayloads).toHaveLength(2)
    expect(submittedPayloads[1]).toBe(submittedPayloads[0])

    const confirmDiscard = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await wrapper.get('button[name="lock-account"]').trigger('click')
    expect(tool.read().account.address).not.toBeNull()
    expect(confirmDiscard).toHaveBeenCalledWith(expect.stringContaining('恢复材料将丢失'))

    confirmDiscard.mockReturnValueOnce(true)
    await wrapper.get('button[name="lock-account"]').trigger('click')
    expect(tool.read().account.address).toBeNull()
    expect(tool.read().transfer.requiresRecovery).toBe(false)
    confirmDiscard.mockRestore()
    wrapper.unmount()
  })
})
