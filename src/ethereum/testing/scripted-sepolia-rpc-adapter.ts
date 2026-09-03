import type { SepoliaRpcAdapter } from '../sepolia-rpc-adapter'
import type { PreparedTokenTransfer } from '../sepolia-rpc-adapter'
import { keccak256, type Hex } from 'viem'

interface ChainIdResponse {
  readonly chainId: number
}

interface ErrorResponse {
  readonly error: Error
}

interface EthBalanceResponse {
  readonly balance: bigint
}

interface BytecodeResponse {
  readonly bytecode: Hex | undefined
}

interface TokenBalanceResponse {
  readonly balance: bigint
}

interface TokenDecimalsResponse {
  readonly decimals: number
}

interface TokenNameResponse {
  readonly name: string
}

interface TokenSymbolResponse {
  readonly symbol: string
}

interface TransferSimulationResponse {
  readonly result: boolean
}

interface PreparedTransferResponse {
  readonly transaction: PreparedTokenTransfer
}

interface TransactionReceiptResponse {
  readonly confirmations: number
  readonly status: 'success' | 'reverted'
}

interface TransactionReceiptPendingResponse {
  readonly pending: true
}

interface TokenResponses {
  readonly bytecodes?: readonly (BytecodeResponse | ErrorResponse)[]
  readonly tokenBalances?: readonly (TokenBalanceResponse | ErrorResponse)[]
  readonly tokenDecimals?: readonly (TokenDecimalsResponse | ErrorResponse)[]
  readonly tokenNames?: readonly (TokenNameResponse | ErrorResponse)[]
  readonly tokenSymbols?: readonly (TokenSymbolResponse | ErrorResponse)[]
  readonly transferSimulations?: readonly (TransferSimulationResponse | ErrorResponse)[]
  readonly preparedTransfers?: readonly (PreparedTransferResponse | ErrorResponse)[]
  readonly transactionReceipts?: readonly (
    TransactionReceiptResponse | TransactionReceiptPendingResponse | ErrorResponse
  )[]
}

export function createScriptedSepoliaRpcAdapter(
  chainIdResponses: readonly (ChainIdResponse | ErrorResponse)[],
  ethBalanceResponses: readonly (EthBalanceResponse | ErrorResponse)[] = [],
  tokenResponses: TokenResponses = {},
): SepoliaRpcAdapter {
  const remainingChainIdResponses = [...chainIdResponses]
  const remainingEthBalanceResponses = [...ethBalanceResponses]
  const remainingBytecodeResponses = [...(tokenResponses.bytecodes ?? [])]
  const remainingTokenBalanceResponses = [...(tokenResponses.tokenBalances ?? [])]
  const remainingTokenDecimalsResponses = [...(tokenResponses.tokenDecimals ?? [])]
  const remainingTokenNameResponses = [...(tokenResponses.tokenNames ?? [])]
  const remainingTokenSymbolResponses = [...(tokenResponses.tokenSymbols ?? [])]
  const remainingTransferSimulationResponses = [...(tokenResponses.transferSimulations ?? [])]
  const remainingPreparedTransferResponses = [...(tokenResponses.preparedTransfers ?? [])]
  const remainingTransactionReceiptResponses = [...(tokenResponses.transactionReceipts ?? [])]

  function takeResponse<T extends object>(queue: Array<T | ErrorResponse>): T {
    const response = queue.shift()

    if (!response) {
      throw new Error('Scripted RPC response missing')
    }

    if ('error' in response) {
      throw response.error
    }

    return response
  }

  return {
    async getChainId() {
      return takeResponse(remainingChainIdResponses).chainId
    },
    async getEthBalance() {
      return takeResponse(remainingEthBalanceResponses).balance
    },
    async getBytecode() {
      return takeResponse(remainingBytecodeResponses).bytecode
    },
    async getTokenBalance() {
      return takeResponse(remainingTokenBalanceResponses).balance
    },
    async getTokenDecimals() {
      return takeResponse(remainingTokenDecimalsResponses).decimals
    },
    async getTokenName() {
      return takeResponse(remainingTokenNameResponses).name
    },
    async getTokenSymbol() {
      return takeResponse(remainingTokenSymbolResponses).symbol
    },
    async getTransactionStatus() {
      const response = takeResponse(remainingTransactionReceiptResponses)
      return 'pending' in response ? { status: 'pending' as const } : response
    },
    async prepareTokenTransfer() {
      return takeResponse(remainingPreparedTransferResponses).transaction
    },
    async sendRawTransaction(_rpcUrl, signedTransaction) {
      return keccak256(signedTransaction)
    },
    async simulateTokenTransfer() {
      return takeResponse(remainingTransferSimulationResponses).result
    },
    async waitForTransactionReceipt() {
      const response = takeResponse(remainingTransactionReceiptResponses)
      return 'pending' in response ? null : response
    },
  }
}
