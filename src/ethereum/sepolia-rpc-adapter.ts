import type { Hex } from 'viem'

export interface SepoliaRpcAdapter {
  getChainId(rpcUrl: string): Promise<number>
  getEthBalance(rpcUrl: string, address: `0x${string}`): Promise<bigint>
  getBytecode(rpcUrl: string, address: `0x${string}`): Promise<Hex | undefined>
  getTokenBalance(
    rpcUrl: string,
    tokenAddress: `0x${string}`,
    accountAddress: `0x${string}`,
  ): Promise<bigint>
  getTokenDecimals(rpcUrl: string, tokenAddress: `0x${string}`): Promise<number>
  getTokenName(rpcUrl: string, tokenAddress: `0x${string}`): Promise<string>
  getTokenSymbol(rpcUrl: string, tokenAddress: `0x${string}`): Promise<string>
}
