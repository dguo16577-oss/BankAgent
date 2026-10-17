# Customer Overview read model — M20

## Contract and scope

GET /customer/overview implements getOverview from frozen Customer 1.9.0. It is the 39th and final Customer operation. Public remains 0/9; Next.js still uses MSW.

Overview owns no financial state, persistence entity, table, migration, cache or materialized projection. It is rebuilt from PostgreSQL-backed application capabilities on every request. It introduces no new mutation or financial product.

Required fields are asOf, baseCurrency, totalBalance and user. The backend returns all optional fragments using empty arrays/zero totals when there are no records. A missing Wealth risk profile is irrelevant: this read uses PortfolioQuery only. A failed source query fails the entire response with HTTP 500 / PERSISTENCE_UNAVAILABLE. It does not return partial success or Mock fallback.

## Sources and mapping

| Frozen field        | Source and policy                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| user                | CustomerProfileQuery reads non-secret id/display name from the existing customers row                                             |
| asOf                | Injected Clock at read-model construction; not a last-financial-mutation timestamp                                                |
| baseCurrency        | CNY, matching AccountSnapshot base-value semantics                                                                                |
| totalBalance        | AccountSnapshot.totalBalance(), never recalculated with new FX rules                                                              |
| balanceNote         | Estimated CNY equivalent; deposits only; no claim of executable/live FX                                                           |
| exchangeEquivalents | Account's existing DEMO_RATE values, rate and conversionAsOf                                                                      |
| accounts            | AccountQueryService.list; common AccountSummary mapper                                                                            |
| spending            | SpendingDashboardQuery composes M18 SpendingQueryService and its shared SQL eligibility                                           |
| recentTransactions  | TransactionReadPort.recent(owner, null, 5); existing occurredAt DESC / id ASC ordering                                            |
| cards               | CardService.list; existing CardSummary mapper and current status                                                                  |
| upcomingPayments    | RecurringUpcomingQuery; ACTIVE + BANK_MANAGED + nextExpectedAt strictly after asOf; due time ASC / ID code-point ASC; SQL limit 4 |
| wealth              | PortfolioQuery; total, monthly change/percent and position summaries from M19                                                     |

CardSummary does not include controls; those remain available from Card Detail. No extra fields are invented. The backend has no persistent credit-card bill source. CARD_BILL is an allowed item type, not a required item; no M1 Mock credit bill is copied. Current upcoming entries are owned Recurring schedules. Detected patterns, STOPPED/ENDED schedules, null or elapsed dates do not appear. Management capability is not used as a substitute for schedule eligibility.

Spending windows are MTD and previous-month same-day/same-time, UTC+08, [from,to). Six trend buckets contain five complete preceding months and the current partial month. All six use the same M18 eligibility predicate; investment/transfer principal, pending transactions and foreign-currency spending do not enter the CNY dashboard. SQL sums are BigDecimal, amounts/rates/percentages remain decimal strings at the HTTP boundary.

## Dependency direction

OverviewQueryService depends on Account, Transaction, Spending, Card, Recurring and Wealth application capabilities plus the shared customer display query and ConsistentRead. CustomerOverviewView is an internal Java record, not a generated DTO. OverviewMapper alone maps it to the frozen response.

Other domains do not depend on Overview. No Overview repository/entity/domain aggregate was added. The wiring lives in shared/config, following existing composition-root conventions. ArchUnit prohibits Overview application dependencies on Spring/JPA/adapters/generated contracts and prohibits reverse dependencies from the source domains.

Two small read capabilities avoid excessive queries:

- MonthlySpendingPort adds one grouped monthly query to the existing PostgreSqlTransactionAnalytics adapter. The exact ELIGIBLE SQL constant is shared with M18 daily analytics; no second eligibility rule exists.
- RecurringUpcomingQuery projects only id/title/date/amount from recurring_payments, with filtering/order/limit in SQL. It never loads transaction-history links or calls Recurring detail once per item.

## Customer identity and failure policy

CurrentCustomerProvider supplies the authenticated CustomerId once; every fragment uses that ID. Neither query, header nor body provides a customer selection input. Unspecified GET inputs are not bound or interpreted, so spoofed customerId/X-Customer-Id cannot change identity; tests verify the resulting body remains the authenticated customer's. No new 400 response is added to this frozen 200/401/500 endpoint.

Session authentication runs before the controller; anonymous requests return 401. GET requires no CSRF token. Existing login/logout and mutations retain their security configuration.

Profiles, accounts, transactions, cards, recurring and holdings are owner-scoped. Products being shared reference data never relaxes Wealth ownership. API output has only existing masked identifiers. Exception detail is not echoed.

## Snapshot and asOf

The production composition root supplies the PostgreSQL AccountRepository's existing ConsistentRead boundary. It opens one read-only REPEATABLE_READ transaction through DatabaseScope before any fragment is queried. All nested JPA/JDBC application reads join that transaction through the shared JpaTransactionManager and DataSource. PostgreSQL establishes the snapshot at the first SELECT.

READ COMMITTED would allow separate SELECTs in one request to see different committed states. REPEATABLE READ prevents a response showing an old account balance alongside a newly purchased position. A concurrency test pauses after the first profile SELECT, commits an investment on another connection, then resumes the overview: all fragments still show the old snapshot; the next request shows the committed investment. The test asserts transaction_isolation=repeatable read and transaction_read_only=on.

No system-wide isolation change, write lock, distributed transaction or cache is introduced. Source writes continue using their existing transaction/locking rules.

asOf is construction time from Clock. It is not a live FX quote timestamp, a last ledger event or a guarantee of external-market freshness. Foreign-account conversionAsOf stays independently preserved. Unlike the original fixed MSW clock, local backend reporting windows move with its configured Clock; reproducible tests inject the M18 fixture instant.

## Query baseline

Measured through a real authenticated HTTP request using pg_stat_statements in an isolated PostgreSQL 17 Testcontainer. The extension exists only in that test container; production runtime needs no extension or schema migration.

The domain SELECT count is 16:

| Source                                | SELECTs |
| ------------------------------------- | ------: |
| Customer display context              |       1 |
| Accounts + account as-of              |       2 |
| M18 Spending summary                  |       7 |
| Six-month Spending trend              |       1 |
| Transaction revision + limited window |       2 |
| Cards                                 |       1 |
| Upcoming schedules                    |       1 |
| Portfolio positions                   |       1 |

Authentication/Session bookkeeping and transaction-control statements are excluded from this domain count. Transaction pagination reads at most 6 rows for a five-item result (existing one-row lookahead). Upcoming reads at most 4 rows. Account/Card/Portfolio queries load the current customer's collections in one query each.

The test adds 25 accounts, 25 cards and 25 schedules and measures again. Query count remains constant; there is no per-account/card/recurring-detail history lookup in Overview. The full Spending read still computes its existing category/merchant/day aggregates; optimizing that fixed cost is outside M20.

## Tests and manual smoke

OverviewPostgreSqlIT covers baseline/direct-domain parity; separate Transfer, Card, Recurring and Investment mutations; a combined mutation scenario; six-month direct Spending parity; stable transaction/upcoming ordering; source failure; empty state without risk profile; nonempty second-customer isolation; HTTP security/privacy; concurrent snapshot consistency; SQL-count growth; restart and all-39 runtime operation closure.

[overview-smoke.ps1](overview-smoke.ps1) logs in against local :18080 and compares Overview with current direct API responses. It does not assume initial account/portfolio/card/recurring state and executes no financial mutation. It derives exact Spending windows from the Overview response before querying the direct Spending API.

See [M20 report](../milestones/m20-report.md) for actual validation and local state. Customer Banking Backend COMPLETE means frozen Customer API coverage, not entire-backend or production completion. Public and frontend integration remain separate future work.
