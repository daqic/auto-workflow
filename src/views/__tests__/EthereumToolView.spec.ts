import { describe, expect, it } from 'vitest'

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
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="rpc-override-error"]').text()).toContain('已保留当前 RPC')
    expect(wrapper.get('[data-testid="active-rpc-url"]').text()).toContain(
      'https://ethereum-sepolia-rpc.publicnode.com',
    )
  })
})
