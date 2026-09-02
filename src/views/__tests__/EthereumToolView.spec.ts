import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { flushPromises, mount } from '@vue/test-utils'

import { createEthereumTool } from '@/ethereum/ethereum-tool'
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
