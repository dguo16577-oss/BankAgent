# Spending Analytics — M18

## Frozen read API

GET /customer/spending/summary implements getSpendingSummary from Customer 1.9.0. Query parameters are from, to, compareFrom, compareTo and accountId. All require an authenticated Customer session. CustomerId comes from CurrentCustomerProvider; customerId overrides, unknown/repeated/empty parameters and invalid periods return INVALID_QUERY / 400. Unknown or foreign account IDs both return ACCOUNT_NOT_FOUND / 404.

The read model is derived from authoritative transactions. There is no spending_transactions or spending_totals table and no permanent totals cache.

## Architecture and SQL

SpendingController → SpendingQueryService → TransactionAnalyticsPort → PostgreSqlTransactionAnalytics.

Domain/application have no HTTP, generated DTO, JPA or persistence-adapter dependency. The query adapter uses bound SQL parameters, a repeatable-read transaction, and the existing transaction/account tables. PostgreSQL performs eligibility/date/customer/account filters, SUM, COUNT, category GROUP BY, merchant GROUP BY and UTC+08 daily GROUP BY. Java only assembles final DTO-independent results and fills at most 367 clipped daily buckets with zeros. It never loads all transaction rows for Java aggregation. ArchUnit prevents Spending from depending on TransactionRepository or Transaction persistence adapters.

The existing customer/occurred_at and customer/account/occurred_at indexes support bounded reporting windows. No additional Spending index is warranted by the current dataset.

## Eligibility

All must hold:

- COMPLETED and DEBIT.
- Type is CARD_PAYMENT, DIRECT_DEBIT or FEE.
- Category is neither TRANSFER nor INVESTMENT.
- Transaction and owned account currency match the selected reporting currency.

Transfers, withdrawals, credits/income, FX exchanges, investment purchases and PENDING/FAILED/REVERSED/CANCELLED records are excluded. INVESTMENT_PURCHASE already exists in the frozen Transaction enum and is explicitly covered by the regression suite. Investment principal does not become consumer spending.

Without accountId, scope is all owned CNY accounts. An account filter uses that account's original currency, including USD; no implicit FX conversion occurs. accountIds are ordered by ID using PostgreSQL C collation.

## Time and comparison

Parameters are offset timestamps, not date-only strings. Every window is [from,to), based on occurredAt, not bookedAt. Each boundary pair must be complete, real and strictly increasing; the maximum duration is 366 days.

Default period is month start in UTC+08 through injected Clock time. The response asOf also comes from Clock. The standard deterministic clock is 2026-09-27T10:30:00+08:00. For real local HTTP verification use explicit standard windows, since the runtime clock advances.

Comparison defaults to both boundaries shifted one calendar month earlier in UTC+08, clamped to the previous month's last day. If clamping collapses the window, the comparison ends at the next local midnight after its start. Explicit comparison windows override inference.

SQL daily buckets use Etc/GMT-8 (fixed UTC+08), avoiding historical daylight-saving changes as well as host timezone differences. Returned daily intervals are clipped to exact requested boundaries, include zero days, and are ordered without gaps or overlaps. Reporting does not depend on the host/JVM timezone. Database instants remain TIMESTAMPTZ. Wire timestamps retain seconds and offset.

## Decimal calculations and ordering

SQL NUMERIC and Java BigDecimal perform all amounts and percentage calculations. Money output is decimal string. Absolute change is signed; percentage is numerator × 100 / comparison total, scale 2, HALF_UP (half away from zero). A zero comparison yields null; zero-total category shares are 0.00. Independently rounded category shares need not sum to exactly 100.00.

Categories sort by category code. Merchants group by merchant ID, sort amount descending then ID using C collation; a deterministic minimum name is used if historical names differ. Entries with no merchant still contribute to total/category/trend/count but never to merchant totals. Counterparties are never used as merchants. The API returns all merchant groups; Web's existing presentation can select six.

Category amounts and trend amounts each sum to totalSpend; their counts each sum to transactionCount.

## Standard fixture and mutation behavior

| Period (UTC+08, exclusive end)         |        Amount |
| -------------------------------------- | ------------: |
| Sep 1 00:00:00 — Sep 27 10:30:00, 2026 |       4968.00 |
| Aug 1 00:00:00 — Aug 27 10:30:00, 2026 |       4800.00 |
| Full August                            |       5400.00 |
| Change / percentage                    | 168.00 / 3.50 |

Existing backend-owned 61-transaction seed already matches these totals; it was not changed.

A CNY 500 transfer adds BANK_TRANSFER activity but leaves Spending unchanged. Card freeze/unfreeze produces no transaction. Netflix stop changes future recurring state only. Tests compare the entire analytics result under a fixed Clock across these operations. Updating/inserting eligible historical transaction data changes analytics immediately; no snapshot total masks it.

With a live Clock, asOf advances independently of mutations. Compare explicit windows and aggregate fields when checking historical invariance over real HTTP.

See [Recurring domain](recurring-payments-domain.md), [M18 report（历史资料）](../release-status.md#历史资料) and [ADR 0015](../adr/0015-recurring-payments-and-derived-spending.md).
