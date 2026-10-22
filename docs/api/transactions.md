# Transactions Banking Domain APIs — M3

## Contract and boundaries

`contracts/openapi/customer.yaml` (1.3.0) is the only machine contract. Frontend types are generated with `pnpm api:generate`; API modules only alias those types. Overview remains a Web read model. Accounts and Transactions are Banking Domain APIs, currently served by MSW.

- `GET /customer/transactions`: returns `items`, `nextCursor` (nullable), `hasMore`.
- `GET /customer/transactions/{transactionId}`: returns TransactionDetail; an unknown ID returns HTTP 404 with `TRANSACTION_NOT_FOUND` in the shared ApiError schema.
- Invalid queries return HTTP 400 / `INVALID_QUERY`; unusable cursors return HTTP 400 / `INVALID_CURSOR`. Duplicate or unsupported query parameters are rejected.

No transaction execution or mutation is implemented.

## Query and cursor pagination

Optional filters: `accountId`, `from`, `to`, `status`, `direction`, `type`, `category`, `search`. Filters combine with AND and apply to the whole fixture collection before pagination. Search trims whitespace and matches title, merchant name or counterparty name as a case-insensitive substring. Maximum search length is 100 characters.

API `from` is inclusive and `to` exclusive, both ISO 8601 timestamps with offsets, filtering `occurredAt`. The Web uses inclusive calendar dates in URL parameters and converts them to UTC+08:00 midnight boundaries; the end date becomes the following midnight. Date controls and displayed times explicitly name this time zone.

`limit` defaults to 10 and accepts integers from 1 to 50. Start without `cursor`; pass the returned `nextCursor` unchanged for continuation. When `hasMore` is false, `nextCursor` is null. There is no page-number or offset interface.

Stable order: `occurredAt` instant descending, then opaque `id` ascending by code-point comparison for equal timestamps. The Mock uses keyset continuation after the last returned record, bound to the fixed fixture snapshot and normalized filters (including limit). Changed filters, stale snapshot tokens or missing anchors reject continuation. Fixtures include equal timestamps to test deterministic boundaries. Tests walk every page and assert no omissions or duplicates.

The frontend neither constructs nor decodes cursors and does not put them in the URL. Semantic filter state is URL-backed, supports reload/back/forward, and selects a TanStack Query cache entry. A new filter combination starts at its first page; revisiting a cached combination can restore its previously loaded pages. Load-more failures keep current rows and offer retry.

Mock tokens are opaque transport values, not authorization credentials. Production token signing, expiry and live-data snapshot consistency remain future backend work.

## Schemas and semantics

| Schema               | Purpose                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| TransactionSummary   | id, accountId, title, Money amount, direction, status, type, category, occurredAt, nullable bookedAt, optional merchant/counterparty |
| TransactionDetail    | Summary plus owning AccountSummary and optional reference                                                                            |
| TransactionPage      | Summary items, nullable nextCursor, hasMore                                                                                          |
| MerchantSummary      | Merchant ID/name, optional location and pre-masked card number                                                                       |
| CounterpartySummary  | Name and pre-masked account identifier                                                                                               |
| TransactionStatus    | PENDING, COMPLETED, FAILED, REVERSED, CANCELLED                                                                                      |
| TransactionDirection | CREDIT, DEBIT                                                                                                                        |
| TransactionType      | CARD_PAYMENT, BANK_TRANSFER, SALARY, DIRECT_DEBIT, CASH_WITHDRAWAL, FEE, INTEREST, FX_EXCHANGE                                       |
| TransactionCategory  | DINING, GROCERIES, SHOPPING, TRANSPORT, ENTERTAINMENT, SUBSCRIPTIONS, HOUSING, INCOME, TRANSFER, TRAVEL, HEALTH, OTHER               |

`amount.amount` is a non-negative decimal string with two fractional digits. `direction` carries the credit/debit meaning; UI formatting adds + or − without changing the API amount. Monetary arithmetic uses BigInt minor units, never floating-point amounts.

`occurredAt` records when the activity happened; `bookedAt` records ledger posting, and is null for pending/unposted items. They are distinct concepts even where a demo record uses the same instant. Type describes the payment mechanism; category describes spending/income classification. A merchant purchase carries `merchant`; a bank transfer carries `counterparty`. These are separate objects, never a mixed identifier field.

Pending debit transactions reserve funds and reduce available balance without changing posted balance. Failed/cancelled records do not post. Reversed demo records describe fully reversed historical activity with no net balance effect; reversal workflows are out of scope.

## Shared deterministic data and reconciliation

`src/mocks/data/transaction-fixtures.ts` builds 61 fixed records: the original 12 September and 36 selected August records across CNY Current, Savings and USD, plus 13 M6 historical records that reconcile analytics and provide recurring-pattern evidence. There is no random generation or dependence on the current clock. `demo-profile.ts` owns the shared profile and balances; `transaction-query.ts` supplies list/detail queries over the same collection. Pages never import fixtures.

The August sample is selected history, not a complete historical ledger. Its net effects are already included in September 1 opening snapshots; it is not posted again. Existing historical spending aggregates remain independent totals. September Current reconciles as 16810.31 + 12000.00 − 4968.00 = 23842.31. Savings and USD retain 8200.00 and 621.32 respectively.

Starbucks (`txn_coffee`) is a CNY 32.00 PENDING debit. The Current account has pendingAmount 32.00 and availableBalance 23810.31, satisfying balance − pendingAmount = availableBalance. Pending is excluded from posted spending and balance. Tests verify this relationship using the shared transaction collection and exact minor-unit arithmetic.

Overview and AccountDetail use the same summaries and stable ordering for their five recent records. TransactionDetail returns the same account balance/currency/status as Accounts. Cross-model consistency and clone isolation are tested.

## Privacy and UI

Sensitive identifiers are masked in the Mock/API layer. Fixtures only store masked account/card identifiers; no full account/card numbers, CVV, PIN or authentication secrets are returned. React displays already-masked strings.

`/app/transactions` provides search, account/date/status/direction/type/category filters, active filters, clear, date-grouped results and Load more. It implements loading, empty, error and retry. `/app/transactions/[transactionId]` provides account, amount, status, timestamps, merchant or counterparty, masked identifiers, reference, and loading/error/retry/not-found states.

Overview links via View all transactions. AccountDetail links via View all activity with `accountId` in the URL, while retaining its own recentTransactions read response. Transactions is not added to the primary sidebar.

Tests cover API filtering and cursor traversal, URL-backed component behavior, error recovery, detail variants, privacy, pending and read-model consistency. Playwright covers both entry journeys and 320/390/1440px layouts.

## M4 mutable state integration

All handlers now query MockBankingStore initialized from the fixtures. Successful domestic transfers append one BANK_TRANSFER transaction with a shared receipt reference. Store revision changes invalidate previous cursors; the frontend clears cached transaction pages after execution. The fixed-fixture ordering and query semantics remain unchanged. See [Payments](payments.md) for mutation and retry guarantees.

## M5 card attribution

Optional cardId and cardMaskedNumber identify known card purchases. The cardId API filter combines with all existing predicates before cursor pagination and is retained in Web URL state. Card details reuse this API rather than keeping separate activity fixtures. Freeze/control changes leave all transactions (including pending) and transaction cursor revision unchanged. See [Cards](cards.md) for attribution scope.

## M7 investment activity

TransactionType now also includes `INVESTMENT_PURCHASE`, and TransactionCategory includes `INVESTMENT`. A successful simulated order creates one COMPLETED DEBIT with the order's total debit (principal plus fee), order reference and account ID. Merchant/counterparty fields are omitted. The receipt links to the existing transaction detail; account/Overview recent activity use this same record. Existing API type/category filters support the new enums. These capital movements are excluded from Spending Analytics.

## M17R.2a transaction notes

The current Customer contract is version 1.19.0. `TransactionSummary` and `TransactionDetail` may return a nullable `note` (maximum 140 characters). Historical transactions remain `null`. A completed transfer preserves its confirmed intent note on the sender's debit transaction; the recipient's credit transaction does not expose it.

The authenticated, server-side `search` filter also matches notes owned by that customer. The Agent's existing `list_transactions(note_query)` maps to this search; it does not add an endpoint or tool. Notes are untrusted transaction data, never instructions or financial authorization. See [M17R.2a acceptance（历史资料）](../release-status.md#历史资料).
