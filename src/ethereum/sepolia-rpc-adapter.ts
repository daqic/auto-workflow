import type { Hex, TransactionSerializableEIP1559 } from 'viem'

export type PreparedTokenTransfer = TransactionSerializableEIP1559 & {
  readonly gas: bigint
  readonly maxFeePerGas: bigint
  readonly maxPriorityFeePerGas: bigint
  readonly nonce: number
}

export interface TokenTransferRequest {
  readonly accountAddress: `0x${string}`
  readonly amount: bigint
  readonly recipient: `0x${string}`
  readonly tokenAddress: `0x${string}`
}

export interface ObservedTransactionReceipt {
  readonly confirmations: number
  readonly status: 'success' | 'reverted'
}

export type ObservedTransactionStatus = ObservedTransactionReceipt | { readonly status: 'pending' }

export class RawTransactionRejectedError extends Error {
  constructor() {
    super('The RPC explicitly rejected the raw transaction.')
    this.name = 'RawTransactionRejectedError'
  }
}

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
  getTransactionStatus(
    rpcUrl: string,
    transactionHash: Hex,
  ): Promise<ObservedTransactionStatus | null>
  prepareTokenTransfer(
    rpcUrl: string,
    request: TokenTransferRequest,
  ): Promise<PreparedTokenTransfer>
  sendRawTransaction(rpcUrl: string, signedTransaction: Hex): Promise<Hex>
  simulateTokenTransfer(rpcUrl: string, request: TokenTransferRequest): Promise<boolean>
  waitForTransactionReceipt(
    rpcUrl: string,
    transactionHash: Hex,
    timeoutMs: number,
  ): Promise<ObservedTransactionReceipt | null>
}
