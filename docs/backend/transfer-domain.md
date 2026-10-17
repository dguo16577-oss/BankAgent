# Transfer domain — M14

## Scope and HTTP boundary

The frozen Customer 1.9.0 contract defines these operations:

| Method | Path                                  | Success |
| ------ | ------------------------------------- | ------- |
| GET    | /customer/recipients                  | 200     |
| POST   | /customer/transfer-intents            | 201     |
| GET    | /customer/transfer-intents/{intentId} | 200     |
| POST   | /customer/transfers                   | 200     |
| GET    | /customer/transfers/{transferId}      | 200     |

PaymentController implements generated interfaces. PaymentMapper maps immutable domain values to fresh generated DTOs. RequestBodyAdvice enforces the frozen JSON types and additionalProperties:false before DTO deserialization; generated Bean Validation retains transport constraints. Controllers contain no fee, hash, idempotency or monetary logic.

RecipientQueryService, TransferPreparationService and TransferExecutionService have distinct responsibilities. They depend on repository ports, AccountMutationPort, TransactionMutationPort and TransferExecutionBoundary. Account and Transaction remain their existing domains and hold their authoritative state. Payment has no separate account balance or transaction history.

## Recipient and identity

Recipients are customer-owned, pre-masked domain records. Local/test has the three frontend initial recipients: Zhang San, Li Si and Mom, with independent Java fixture definitions. The default profile has no recipients. A fourth recipient belongs to customer_other exclusively in tests.

CurrentCustomerProvider obtains CustomerId from authenticated Spring Security context. Application/domain code never reads SecurityContext. Lists and lookups are customer-scoped; foreign and unknown identifiers receive the same NOT_FOUND error. Recipient search trims whitespace and matches name/bank with Locale.ROOT lowercase literal substrings.

Runtime still has no login provider or demo identity bypass. CSRF remains enabled. Authenticated POST tests provide a valid CSRF token. Missing/invalid CSRF remains 403 for authenticated callers; an anonymous Transfer POST is rejected as 401 UNAUTHENTICATED even when CSRF is missing. This changes rejection presentation only, never authorizes a request.

## Preparation and immutable review

Preparation validates owned source and recipient, ACTIVE account, positive amount with exactly two wire decimals and at most twelve whole digits, matching CNY currency and sufficient available funds. The domestic fee policy returns CNY 0.00. It saves only a new Intent; account values, account as-of, transactions/revision, transfers and idempotency records remain unchanged.

IntentTerms is an immutable record holding owner, server ID, complete reviewed Account/Recipient snapshots, amount, fee, total debit, projected available balance, normalized note, createdAt and expiresAt. TransferIntent holds those terms, hash and lifecycle separately. Existing saved terms cannot be replaced. GET returns the saved snapshots, never a reconstruction from current Account/Recipient state.

Expiry is fifteen minutes after creation. At now >= expiresAt, an unexecuted Intent is logically EXPIRED. GET derives that status without persisting a financial/lifecycle mutation. Executed intents remain EXECUTED. All time comes from the injected M12 Clock; tests use a controllable Clock. Local uses the existing system UTC Clock, so expiry follows elapsed wall time, unlike the browser's simulated clock.

## Canonical hash

SHA-256 binds a versioned, fixed-order, UTF-8 representation. Each field has a binary length prefix, with an explicit null marker. It covers ID, customer, all reviewed source-account fields (including balance, pending/available and FX metadata), all recipient fields, amount, currency, fee, total debit, projected balance, note and both timestamps. It excludes lifecycle status and the hash itself.

Amounts use stripTrailingZeros().toPlainString(), with zero explicitly represented as 0. Thus 500, 500.0 and 500.00 have identical canonical money values. Java DTO field order and JSON formatting never enter the hash calculation. Account openedAt is not part of AccountSummary and is not a reviewed/hash-bound field.

The hash is an integrity binding, not authentication. Execution accepts only intentId and intentHash, plus the Idempotency-Key header; extra business fields are rejected.

## Execution and current-state checks

Under one execution boundary:

1. Look up completed idempotency result before one-use state checks.
2. Locate the customer's Intent; compare stored hash; reject executed/expired Intent.
3. Revalidate source existence, ownership, ACTIVE status, recipient existence/ownership, matching CNY currency and current available funds.
4. Compare recipient snapshot fields and masked source identifier. Changes require a new review via TRANSFER_INTENT_HASH_MISMATCH.
5. Apply Account.debit(totalDebit), create Transfer and one Transaction, mark Intent EXECUTED and record the completed idempotency result.

A balance change alone does not invalidate the snapshot. The frozen M4 rule rechecks affordability. The review retains its original projected balance; the receipt's source snapshot records the execution-time account before debit. Recipient has no invented version/status field; removal or changed existing fields is revalidated.

Account.debit returns a replacement immutable Account and protects positive debit, currency, ACTIVE status and sufficient available funds. Pending is unchanged; available remains derived from balance minus pending. Foreign-currency mutation is outside M14.

Successful transfer produces exactly one BANK_TRANSFER / TRANSFER / DEBIT / COMPLETED transaction with non-negative transfer amount, masked counterparty, reference, account ID and occurredAt/bookedAt. Both timestamps and receipt timestamps use the execution Clock instant; no artificial second is added to the backend Clock. The existing transaction query sees it immediately. Transfer is not a spending category; no Spending service is introduced.

## Idempotency

Scope is CustomerId + EXECUTE_TRANSFER + key. Keys match the frozen 1–128 ASCII alphanumeric/underscore/hyphen pattern. A completed record stores scope, canonical request fingerprint and transfer ID; completion is represented by the Completed record type.

Same scope and same intentId/hash returns the original receipt, including after expiry or later balance changes. Different request fingerprint returns 409 IDEMPOTENCY_KEY_REUSED. Different key for an executed Intent returns 409 TRANSFER_INTENT_ALREADY_EXECUTED. Failed execution consumes no key.

## Atomicity, readers and concurrency

InMemoryTransferExecutionBoundary uses one BankingMemoryLock (ReentrantLock). All live repositories share this lock. Revalidation, mutation and rollback occur inside it; locks are reentrant for calls into repository ports. Repository state is an immutable collection of immutable domain values.

Before execution the adapter checkpoints Account, Transaction, Intent, Transfer and Idempotency repositories. Each write replaces its repository state. If a runtime failure occurs, all five checkpoints are restored before unlocking; known business errors retain their codes and unexpected write failures map to PERSISTENCE_UNAVAILABLE. Preparation similarly restores its Intent checkpoint if saving fails.

Repository reads acquire the same lock. Account detail and transaction list/detail hold a consistent read scope across their related lookups; revision and transaction selection cannot straddle a commit. Readers cannot observe a debit without its receipt/transaction. Successful append advances the transaction snapshot revision, invalidating older cursors; rollback restores the old revision and replay does not advance it.

Tests inject failures using test repository subclasses after each of the five write stages; no failure hook or reset endpoint exists in the production HTTP API. Latch-coordinated concurrent tests verify same-key replay, different-key duplicate prevention, two intents competing for insufficient shared balance, and a reader blocked until rollback completes.

## Standard reconciliation

| CNY Current → Zhang San, amount 500.00, fee 0.00 | Before   | After    |
| ------------------------------------------------ | -------- | -------- |
| Balance                                          | 23842.31 | 23342.31 |
| Pending                                          | 32.00    | 32.00    |
| Available                                        | 23810.31 | 23310.31 |
| New transfers                                    | 0        | 1        |
| New BANK_TRANSFER transactions                   | 0        | 1        |

## Limits and PostgreSQL handoff

This guarantees in-process serialization and rollback for handled runtime failures. It does not provide durability or crash recovery. Process restart loses intents, transfers, idempotency records and mutations; local/test reload initial demo fixtures.

A future database milestone replaces the adapter boundary with Spring transactions, durable repository adapters, uniqueness constraints for scoped idempotency/intent execution, and row or optimistic locking. It must preserve current replay ordering, current-funds validation, immutable snapshots and cross-domain atomicity. Database isolation, crash recovery, cursor policy across restarts and multi-instance coordination remain deferred. No real authentication, frontend integration or other backend domain is added.
