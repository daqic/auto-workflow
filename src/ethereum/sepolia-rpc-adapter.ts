export interface SepoliaRpcAdapter {
  getChainId(rpcUrl: string): Promise<number>
  getEthBalance(rpcUrl: string, address: `0x${string}`): Promise<bigint>
}
