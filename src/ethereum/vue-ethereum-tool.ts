import { inject, type InjectionKey } from 'vue'

import type { EthereumTool } from './ethereum-tool'

export const ethereumToolKey: InjectionKey<EthereumTool> = Symbol('EthereumTool')

export function useEthereumTool(): EthereumTool {
  const tool = inject(ethereumToolKey)

  if (!tool) {
    throw new Error('EthereumTool was not provided')
  }

  return tool
}
