import { inject, onScopeDispose, shallowRef, type InjectionKey } from 'vue'

import type { EthereumTool, EthereumToolSnapshot } from './ethereum-tool'

export const ethereumToolKey: InjectionKey<EthereumTool> = Symbol('EthereumTool')

export function useEthereumTool(): EthereumTool {
  const tool = inject(ethereumToolKey)

  if (!tool) {
    throw new Error('EthereumTool was not provided')
  }

  return tool
}

export function useEthereumToolSnapshot(tool: EthereumTool) {
  const snapshot = shallowRef<EthereumToolSnapshot>(tool.read())
  const unsubscribe = tool.subscribe((nextSnapshot) => {
    snapshot.value = nextSnapshot
  })

  onScopeDispose(unsubscribe)
  return snapshot
}
