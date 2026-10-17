# M14 — Transfer Domain and atomic mutation

## Scope and architecture

Five generated Customer operations are added to the four M13 reads:

| Operation            | Path                                      | Success |
| -------------------- | ----------------------------------------- | ------- |
| getRecipients        | GET /customer/recipients                  | 200     |
| createTransferIntent | POST /customer/transfer-intents           | 201     |
| getTransferIntent    | GET /customer/transfer-intents/{intentId} | 200     |
| executeTransfer      | POST /customer/transfers                  | 200     |
| getTransferReceipt   | GET /customer/transfers/{transferId}      | 200     |

Generated interface → PaymentController/PaymentMapper → separate recipient query, preparation and execution services → domain objects / application ports → in-memory adapters.

No PostgreSQL, persistence framework, real authentication, frontend integration or other business domain is added. Frontend remains MSW and its business code is unchanged.

## Changed files

Under services/banking-core:

- customer/payment/domain: RecipientId, Recipient, IntentTerms, TransferIntent, Transfer, IntentHasher and TransferFeePolicy.
- customer/payment/application: RecipientQueryService, TransferPreparationService, TransferExecutionService, TransferValidation, PrepareTransfer, PaymentFailure, IdGenerator; Recipient/Intent/Transfer/Idempotency repository ports and TransferExecutionBoundary.
- customer/payment/adapter/inmemory: separate recipient, intent, transfer and idempotency repositories plus InMemoryTransferExecutionBoundary.
- customer/payment/adapter/web: PaymentController, PaymentMapper, PaymentExceptionAdvice, PaymentBodyValidation and PaymentQueryGuard.
- Account domain debit behavior, AccountMutationPort and updated InMemoryAccountRepository.
- TransactionMutationPort and updated InMemoryTransactionRepository; consistent read scopes on Account/Transaction query services and repository ports.
- shared/application/ConsistentRead, shared/adapter/inmemory/BankingMemoryLock, PaymentDomainConfiguration, ReadDomainConfiguration and SecurityConfiguration.
- New tests TransferFixtures, TransferDomainTest and TransferEndpointsTest; updated ArchitectureTest, DefaultProfileDataTest and the nine-operation assertion in ReadEndpointsTest.
- Payment package documentation, POM description and service README.

Repository documentation: root README, backend Account/Transaction/Demo documents, new transfer-domain.md, ADR 0011, implementation matrix/status JSON and this report. Frozen YAML, freeze hashes and generated TypeScript are unchanged. No new dependency was installed.

## Recipient and Intent

Local/test recipients reproduce Zhang San, Li Si and Mom with masked identifiers. Default profile contains no recipients. A second customer's recipient exists only in tests.

IntentTerms is immutable and separate from lifecycle status. It retains exact Account/Recipient review snapshots, Money values, normalized note, ID/owner, timestamps and expiry. Preparation changes only the Intent repository. GET derives EXPIRED at now >= expiresAt without rewriting terms or financial state.

SHA-256 covers a versioned, length-prefixed canonical representation of all reviewed immutable fields. Money canonicalization treats 500, 500.0 and 500.00 as the same amount. Hashing never depends on DTO property order or arbitrary JSON serialization. The server computes the hash; execute accepts only the saved ID/hash.

## Validation, mutation and idempotency

Prepare validates owned active source, owned recipient, positive contract-conforming domestic CNY amount, compatible currencies and available funds. The explicit fee policy returns 0.00.

Execute revalidates current ownership, hash, lifecycle, expiry, source and recipient, currency, masked source identity and sufficient funds inside the atomic boundary. Recipient changes require a new review; balance-only changes recheck affordability. Account.debit owns the positive/currency/status/funds invariants. Pending stays unchanged and available derives from balance minus pending.

Execution creates one Transfer receipt and one existing-domain BANK_TRANSFER / TRANSFER / DEBIT / COMPLETED Transaction. Existing Account and Transaction queries immediately see the result. Transfers do not represent spending; no Spending backend is added.

Idempotency scope is customer + operation + key. Completed records retain canonical request fingerprint and receipt ID. Lookup precedes one-time executable-state checks. Same request replays the original receipt, even after expiry; changed request conflicts. Failed execution leaves no completed key.

## Atomicity and test design

One shared adapter ReentrantLock spans revalidation and all five writes: Account, Transaction, Transfer, Intent lifecycle and Idempotency. Repository state checkpoints are immutable. Handled runtime failures restore all checkpoints before unlocking. Reads use the same lock, and composite read queries hold it across related lookups.

Failure injection is test-only repository subclass behavior after each write stage, including after idempotency save. Tests compare all five states and prove safe same-key retry. A separate reader test blocks after a tentative debit and verifies that only the restored balance becomes visible.

Latch-coordinated concurrent scenarios:

- Same Intent, same key: two callers receive the same receipt, one debit/transaction.
- Same Intent, different keys: one success and one already-executed conflict.
- Two 500.00 intents, available 600.00: one success, one insufficient-funds failure, final available 100.00.

Ownership tests cover both customer directions and matching unknown/foreign NOT_FOUND responses. HTTP tests run the actual Spring Security chain with test identities and valid CSRF tokens. Anonymous Transfer requests remain 401; authenticated missing/invalid CSRF remains 403.

## Standard 500.00 scenario

| Field                   | Before   | After    |
| ----------------------- | -------- | -------- |
| Balance                 | 23842.31 | 23342.31 |
| Pending                 | 32.00    | 32.00    |
| Available               | 23810.31 | 23310.31 |
| Transfer count added    | 0        | 1        |
| Transaction count added | 0        | 1        |

The full HTTP consistency test reads Account, Intent, Transfer and Transaction after execution, then repeats the same request and checks no further mutation.

## Validation results

| Check                                               | Result                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| pnpm contract:check before and after implementation | PASS; Customer/Public hashes unchanged                                                               |
| pnpm lint                                           | PASS; ESLint and Prettier                                                                            |
| pnpm typecheck                                      | PASS; generated types and TypeScript                                                                 |
| pnpm test                                           | PASS; 359 Vitest tests across 24 files plus 3 contract hash tests                                    |
| mvnw.cmd clean verify                               | PASS; 150 tests, zero failures/errors/skips; package and Spotless pass                               |
| Architecture tests                                  | 3 PASS, covering Payment and existing domains/application boundaries                                 |
| New Transfer tests                                  | 30 domain/application tests and 33 authenticated HTTP/security tests                                 |
| Initial fixture parity                              | PASS; 3 accounts and 61 transactions still match frontend initial data                               |
| Live local HTTP                                     | Health 200 UP; anonymous recipients GET and both Transfer POST operations return 401 UNAUTHENTICATED |

The existing 87 backend tests remain passing. The five rollback stages, three concurrency cases, reader isolation, preparation isolation, canonical hash, immutable snapshots, ownership, expiry, stale state and idempotent replay are included. No M14 test was skipped.

Validation used JDK 21 and per-command JVM memory limits: Maven -Xms32m -Xmx512m with SerialGC and two active processors; Surefire -Xms32m -Xmx384m with the same GC/processor settings. Initial attempts hit Windows commit-memory exhaustion; verification succeeded after the user freed memory. No system settings or dependency versions changed.

The local backend was launched using spring-boot:run with the local profile, probed without authentication (including a forged identity header, which grants no access), and stopped. Business success is proven by MockMvc with Spring Security Test and valid CSRF headers, not a runtime auth bypass.

## Frozen contract and implementation matrix

Customer 1.9.0:
`602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`

Public 1.2.0:
`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

The matrix contains 9 Customer IMPLEMENTED_IN_MEMORY, 30 Customer NOT_IMPLEMENTED and 9 Public NOT_IMPLEMENTED. The status JSON preserves these marks during manifest regeneration.

## Limits and deferred work

State is process-local. Restart loses Intents, Transfers, mutations and idempotency records; there is no crash recovery guarantee. The shared lock serializes demo reads and mutations and is unsuitable as a multi-instance coordination mechanism.

Future PostgreSQL work must add durability, transaction isolation, scoped uniqueness constraints, persistent idempotency and row/optimistic locking. Real authentication, other domain operations, frontend integration and Agent remain deferred. Cursor restart/durability policies remain future work.

See [Transfer domain](../backend/transfer-domain.md) and [ADR 0011](../adr/0011-transfer-intent-and-atomic-execution.md).

**Stop at M14. Do not enter M15.**
