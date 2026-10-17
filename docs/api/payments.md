# Payments / Domestic Bank Transfer — M4

## Boundary and contract

The sole machine contract is `contracts/openapi/customer.yaml` (1.4.0). Generate TypeScript with `pnpm api:generate`. Components, API clients and Mock services reference generated types; there is no second DTO model.

M4 supports immediate domestic CNY transfers to existing saved recipients. Fee is currently CNY 0.00. FX, international/scheduled/recurring transfers, recipient management, real authentication, OTP and external banking services are not implemented.

| API                                       | Behavior                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| GET /customer/recipients?search=          | Case-insensitive name/bank substring search in the API; masked identifiers only |
| POST /customer/transfer-intents           | Validate and prepare immutable review terms; 201                                |
| GET /customer/transfer-intents/{intentId} | Read exact saved terms and lifecycle status                                     |
| POST /customer/transfers                  | Explicitly execute intent with required Idempotency-Key; 200 receipt            |
| GET /customer/transfers/{transferId}      | Read the completed resource, including after refresh                            |

## Input → Prepare → Review → Confirm → Execute

CreateTransferIntentRequest contains sourceAccountId, recipientId, amount (Money) and optional note (maximum 140 characters). API amount is a positive decimal string with exactly two decimals and at most 12 whole digits. The Web accepts zero to two fractional digits and pads the string before submission; it never uses floating-point monetary arithmetic. React Hook Form and Zod provide UX validation; the service independently validates untrusted HTTP input and rejects unknown request fields.

TransferIntent contains id, status, sourceAccount, recipient, amount, fee, totalDebit, projectedAvailableBalance, note, intentHash, createdAt and expiresAt. Source and recipient are saved snapshots. Fee, debit and projected balance come from the service, never from a component calculation.

Prepared terms are immutable; only lifecycle status can change from PREPARED to EXECUTED. GET derives EXPIRED when the deterministic clock reaches expiresAt without changing terms or balances. SHA-256 binds the exact saved terms, including identifiers, snapshots, money, note and expiry; status is excluded. The hash is an integrity binding, not authorization or a secret.

Review fetches the intent by its opaque ID and renders that response. Confirmation sends **only** `{ intentId, intentHash }`. It cannot submit replacement amount, source account or recipient fields. Editing means preparing another intent. Preparing adds an intent resource but changes no account, transaction, balance, dashboard as-of or transfer resource.

## Idempotency and execution-time checks

POST /transfers requires an Idempotency-Key of 1–128 ASCII letters, digits, underscores or hyphens. Same key plus the same intentId/hash returns the original receipt, even after expiry or changes in available funds. Same key plus a different valid request returns 409 / IDEMPOTENCY_KEY_REUSED. Another key for an executed intent returns 409 / TRANSFER_INTENT_ALREADY_EXECUTED. Failed validation does not consume a key or mutate state.

The Web uses a stable confirmation key per intent, keeps it on retry and can recover an already completed receipt after reload. It displays processing, disables the button and has a synchronous click guard. The service remains the authority for duplicate prevention. An uncertain network outcome is retried with the same reference/key; it cannot create a second debit.

Before a first execution, the service validates source existence/ACTIVE status, recipient existence/eligibility, matching supported CNY currency, current available funds ≥ totalDebit, hash equality, expiry and unexecuted status. Changed recipient details or masked source identifier require a new review. The available-balance projection remains the original review snapshot; execution uses current funds. No asynchronous work occurs between these checks and committing the mutation.

## Shared mutable store and atomicity

`src/mocks/bank/store.ts` defines MockBankingStore; `clock.ts` defines its injectable deterministic clock; `transfer-service.ts` contains business rules. MSW handlers parse HTTP and delegate to the service. All M1–M4 banking handlers read the same store. Existing deterministic M3 fixtures initialize accounts, transactions and unchanged dashboard sections. Overview total and recent transactions are selected from current account/transaction state rather than maintained as independent balances.

The service validates a private cloned state, creates the receipt and one TransactionSummary, updates balance/availableBalance and intent status, then replaces the store in one commit. Pending remains unchanged. Browser persistence writes the entire snapshot before the in-memory replacement; a storage failure leaves the previous snapshot and clock untouched. This is an in-process Demo guarantee, not a substitute for future database transactions.

Browser state is stored in **sessionStorage** under `aster-banking-state-v1` (M5 migrates the legacy `aster-m4-banking-state-v1` snapshot). Intents, receipts, successful idempotency records, balances, transactions and revision survive same-tab reloads. Separate browsing sessions are independent; no cross-tab synchronization is promised. To reset a local Demo, remove the shared and legacy keys in browser developer tools and reload. Node tests call store.reset() before every test. No reset or clock-control banking endpoint is exposed.

Clock starts at `2026-09-27T10:30:00+08:00`; an intent lasts 15 simulated minutes. Successful execution advances it by one second, shared by occurredAt/bookedAt, receipt createdAt/completedAt and Overview asOf. Tests can advance/reset the injected clock explicitly. Waiting in real time does not expire a demo intent.

Each execution increments transaction snapshot revision. Previous cursors then return INVALID_CURSOR; the Web discards cached transaction pages and invalidates Accounts, Overview, Transaction Detail and Intent queries. This avoids combining pages across mutations.

## Transactions, spending and reconciliation

A successful transfer creates exactly one M3 transaction: BANK_TRANSFER / TRANSFER / DEBIT / COMPLETED, a non-negative Money amount, masked counterparty, occurredAt, bookedAt and the receipt reference. It does not create a payment-history model. Payments Recent Transfers queries `GET /customer/transactions?type=BANK_TRANSFER`; receipts link to `/app/transactions/{transactionId}`.

Ordinary transfers do not contribute to spending. M4 preserves the existing September MTD and previous-month comparison windows and spending aggregates; a later dashboard asOf reflects account activity, not a newly computed analytics window.

| CNY Current → Zhang San, CNY 500.00, fee 0.00 | Before   | After    |
| --------------------------------------------- | -------- | -------- |
| Balance                                       | 23842.31 | 23342.31 |
| Pending                                       | 32.00    | 32.00    |
| Available                                     | 23810.31 | 23310.31 |
| Total CNY equivalent                          | 36453.68 | 35953.68 |
| Monthly spending                              | 4968.00  | 4968.00  |

BigInt minor units are used throughout. Existing USD equivalents remain presentation-only demo estimates; transfer execution performs no FX.

## Error semantics

All errors use the shared ApiError `{ code, message }` schema.

| HTTP | Codes                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 400  | INVALID_REQUEST (malformed/extra fields, missing key), INVALID_QUERY                                             |
| 404  | ACCOUNT_NOT_FOUND, RECIPIENT_NOT_FOUND, TRANSFER_INTENT_NOT_FOUND, TRANSFER_NOT_FOUND                            |
| 409  | TRANSFER_INTENT_EXPIRED, TRANSFER_INTENT_HASH_MISMATCH, TRANSFER_INTENT_ALREADY_EXECUTED, IDEMPOTENCY_KEY_REUSED |
| 422  | ACCOUNT_NOT_ELIGIBLE, RECIPIENT_NOT_ELIGIBLE, INVALID_AMOUNT, CURRENCY_MISMATCH, INSUFFICIENT_FUNDS              |
| 500  | PERSISTENCE_UNAVAILABLE, INTERNAL_ERROR                                                                          |

Any failed validation leaves banking state unchanged. Resource 404s have dedicated UI; read failures support retry, prepare failures allow resubmission, execution failures retain the exact intent/key for safe retry. Expired intents require a new preparation.

## Privacy and tests

Saved recipients Zhang San, Li Si and Mom use fictional Demo banks. Only pre-masked account identifiers are stored and returned. No full account/card number, CVV, PIN, secret, OTP or authentication implementation is present.

Service/API tests cover the standard reconciliation, preparation isolation, immutable snapshots, parallel duplicates, changed-key requests, invalid amounts, expiry/hash mismatch, execution-time stale state, persistence failure and reload, resource 404s and cursor invalidation. RTL covers form validation, review, processing, uncertain-outcome retry, receipts and query recovery. Playwright runs the entire transfer journey, refresh recovery and Accounts/Overview verification at 320/390/1440px.

See [ADR 0002](../adr/0002-transfer-intent-execution.md). M4 stops here; production durability, concurrency, authorization and trusted execution are later work.

## M17R: prepared-intent cancellation

The PostgreSQL-backed Customer API now supports `POST /customer/transfer-intents/{intentId}/cancel` with a reason from the frozen `CancelTransferIntentRequest` enum. It returns the existing intent representation with `status: CANCELLED`. A repeated cancellation is idempotent. An executed intent cannot be cancelled, and an expired intent remains expired. The endpoint requires the authenticated customer, the same Spring session that prepared the intent, and CSRF protection. The service locks the intent row for cancellation and execution so those transitions cannot both succeed.

Agent v2 uses this endpoint through its trusted lifecycle coordinator when a user revises or cancels a transfer, or when planning fails after preparation. The cancellation API is not in the model-visible Tool Registry. A timeout or uncertain cancellation blocks further preparation until the bank state is known. See the frozen [Customer contract](../../contracts/openapi/customer.yaml) for request and response schemas.
