# Separate transaction signing from broadcasting

ERC-20 transfers will be simulated, prepared, signed, and hashed locally before the signed raw transaction is sent to the RPC endpoint. This is deliberately more explicit than a one-step contract write because an unclear broadcast outcome may be retried only by resending the exact same signed bytes and transaction hash; the application must never respond to an ambiguous network failure by silently creating and signing a replacement transfer. A definite RPC rejection accepts no hash or receipt and permits a new transfer, so it does not enter this recovery path.

While the broadcast outcome is unclear, the signed bytes remain only in the Module's private memory and block creation of another transfer; the available recoveries are to rebroadcast those exact bytes or query the existing hash. Locking the account or refreshing the page clears the bytes, but the UI must warn that the transaction may already have reached the network.
