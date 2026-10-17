# Recurring payments — M6

## Endpoints

| Method | Path                                                    | Purpose                                   |
| ------ | ------------------------------------------------------- | ----------------------------------------- |
| GET    | `/customer/recurring-payments`                          | Summaries                                 |
| GET    | `/customer/recurring-payments/{recurringPaymentId}`     | Detail and Transaction IDs                |
| POST   | `/customer/recurring-payment-action-intents`            | Prepare immutable review, HTTP 201        |
| GET    | `/customer/recurring-payment-action-intents/{intentId}` | Retrieve prepared/executed/expired review |
| POST   | `/customer/recurring-payment-actions`                   | Confirm and execute using Idempotency-Key |
| GET    | `/customer/recurring-payment-actions/{actionId}`        | Durable demo receipt                      |

Generated OpenAPI types are the only DTOs. All endpoints use the existing API client and unified MSW store.

## Model, source and provenance

Types: `CARD_SUBSCRIPTION`, `DIRECT_DEBIT`, `STANDING_ORDER`, `DETECTED_RECURRING_PAYMENT`. Statuses: `ACTIVE`, `STOPPED`, `ENDED`. Frequencies: `WEEKLY`, `MONTHLY`, `QUARTERLY`, `YEARLY`, `IRREGULAR`.

`BANK_MANAGED` denotes an explicit bank-side authorization/schedule. `DETECTED_PATTERN` denotes deterministic historical evidence, not a mandate. The service returns `managementCapability` (`STOP_FUTURE_PAYMENTS` or `NONE`); the UI does not infer this from merchant name, type or source.

Netflix 88, Spotify 65, Adobe 238 and ChatGPT 145 CNY are monthly bank-managed card subscriptions linked to Visa Debit. Rent 3000 CNY is a monthly bank-managed direct debit. Amounts and payment dates reuse the profile and its transaction fixtures. Detail holds related Transaction IDs, not a parallel transaction model. History links open M3 Transaction Detail.

Bookshop is a detected-only monthly pattern based on three completed CNY 68 payments in June, July and August. `matchedTransactionIds`, `observedOccurrences`, `firstObservedAt` and `lastObservedAt` expose machine-readable evidence. No confirmed next date is asserted, no ML is used, and no executable Stop button is shown. The UI explicitly says it cannot currently be managed through Aster Bank.

## Protective stop flow

Only `STOP_FUTURE_PAYMENTS` is supported:

- Card subscription: block future recurring merchant payments through the bank.
- Direct debit: revoke the bank-side mandate.
- Standing order: cancel future scheduled bank payments.

**Stopping future payments through the bank may not terminate the user's external service contract.** Review, detail and receipt all display this limitation. There is no external merchant cancellation, restart, amount/schedule editing, refund or authentication implementation.

Prepare accepts `recurringPaymentId` and `actionType`. It snapshots the recurring detail, before/after status, next date, capability and version; stores an effect description, SHA-256 hash and 15-minute demo-clock expiry. Domain state is untouched. Authorization is always `CONFIRMATION` for this protective action.

Execute accepts only `intentId` and `intentHash`, plus required `Idempotency-Key`. Revalidate intent existence/hash/expiry/not-executed, payment existence, complete reviewed snapshot/version, ACTIVE status and bank-managed capability. Any changed reviewed term returns HTTP 409 `RECURRING_PAYMENT_STATE_CHANGED`. The store persists the complete replacement before changing in-memory state; there is no await between revalidation and commit. Persistence failure returns 500 without any partial mutation or clock advance.

The existing idempotency convention applies: same key and exact request returns the original receipt, even after expiry; changed request with that key returns 409 `IDEMPOTENCY_KEY_REUSED`. Keys are scoped to this action endpoint, separate from transfer/card actions. Review keeps `confirm_{intentId}` across retries and reloads. Receipt contains STOPPED after-state, effective time, action reference and payment link.

## Cross-domain guarantees

Successful Netflix stop sets `status=STOPPED`, `nextExpectedAt=null`. Overview derives upcoming payments from active bank-managed records, so Netflix disappears from the future list. All historical Netflix transactions, analytics totals, account balances/pending holds, card states and wealth remain unchanged. No transaction is created or deleted. Cache invalidation affects recurring list/detail/intents and Overview only.

Store schema v6 adds recurring state, intents, receipts and endpoint-scoped idempotency. Existing M4/M5 saved sessions migrate without losing transfers or card changes; historical additions are deduplicated by ID. Persistence remains per-tab `sessionStorage` with the shared demo reset behavior. The injected demo clock and reset isolate tests; no real banking persistence or scheduler is implied.

## Errors and states

404: `RECURRING_PAYMENT_NOT_FOUND`, `RECURRING_PAYMENT_INTENT_NOT_FOUND`, `RECURRING_PAYMENT_ACTION_NOT_FOUND`.

409: `RECURRING_PAYMENT_ALREADY_STOPPED`, `RECURRING_PAYMENT_STATE_CHANGED`, `RECURRING_PAYMENT_INTENT_EXPIRED`, `RECURRING_PAYMENT_INTENT_HASH_MISMATCH`, `RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED`, `IDEMPOTENCY_KEY_REUSED`.

422: `RECURRING_PAYMENT_NOT_MANAGEABLE`. Malformed/extra fields or invalid keys return 400 `INVALID_REQUEST`; failed persistence returns 500 `PERSISTENCE_UNAVAILABLE`.

Pages cover loading, success, empty sections, errors/retry and not found. Review distinguishes preparing/processing, expired/stale state, success and failure. Terminal validation failures direct the user back to prepare a fresh review; network/server failures can retry the same request safely.
