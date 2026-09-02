export interface SepoliaRpcAdapter {
  getChainId(rpcUrl: string): Promise<number>
}
