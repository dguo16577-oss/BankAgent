# Wealth, suitability and investment execution — M19

## Frozen HTTP surface

The Customer contract is unchanged. WealthController implements ten generated interfaces:

| Method | Path                                          | operationId                 |
| ------ | --------------------------------------------- | --------------------------- |
| GET    | /customer/wealth/portfolio                    | getWealthPortfolio          |
| GET    | /customer/wealth/products                     | listInvestmentProducts      |
| GET    | /customer/wealth/products/{productId}         | getInvestmentProduct        |
| GET    | /customer/wealth/risk-profile                 | getRiskProfile              |
| POST   | /customer/wealth/suitability-checks           | createSuitabilityCheck      |
| GET    | /customer/wealth/suitability-checks/{checkId} | getSuitabilityCheck         |
| POST   | /customer/investment-order-intents            | createInvestmentOrderIntent |
| GET    | /customer/investment-order-intents/{intentId} | getInvestmentOrderIntent    |
| POST   | /customer/investment-orders                   | executeInvestmentOrder      |
| GET    | /customer/investment-orders/{orderId}         | getInvestmentOrder          |

All require the authenticated customer session. All POSTs retain CSRF protection. Check/intent creation returns 201; execution returns 200 and requires Idempotency-Key. There is no investment Step-Up: frozen authorizationRequirement is CONFIRMATION. Ownership comes exclusively from CurrentCustomerProvider. Foreign customer resources use the same 404 codes as missing resources.

Products are shared bank reference data, not customer holdings or Public marketing catalog entries. Optional type/riskLevel filters are conjunctive PostgreSQL predicates. Empty, repeated, unknown or invalid enum query parameters return INVALID_QUERY. No Java findAll/filter pipeline.

## Layers and storage

- domain: product, risk level/profile, suitability evidence, position/portfolio, intent/order, explicit canonical hash and failure codes.
- application: WealthService orchestrates the existing AccountRepository, AccountMutationPort, TransactionMutationPort and IdempotencyRepository. PortfolioQuery exposes customer-scoped reads without Overview-specific DTOs.
- adapter.web: generated interfaces/DTOs, strict JSON validation, frozen status/error mapping.
- adapter.persistence: PostgreSqlWealthStore, JDBC row mapping, versioned JSON snapshot mapper, transaction boundary and local/test seed.

Domain/application depend on no Spring, JPA, generated contract, HTTP or persistence implementation. One existing JpaTransactionManager binds JDBC and JPA work to the same connection/transaction. There is no parallel account or transaction store.

Flyway V5 owns six Wealth tables and extends idempotency_records with an owned order FK. V1–V4 remain unchanged. See [database schema](database-schema.md).

## Reference fixtures and risk

DemoWealthSeed is registered only in local/test, inserts missing rows and never resets existing positions, products, risk profiles or executed orders. No TypeScript file is loaded at runtime. Products match M7:

| Product               | Type          | Risk | Minimum CNY | Demo yield |
| --------------------- | ------------- | ---- | ----------- | ---------- |
| Aster Cash Reserve    | MONEY_MARKET  | R1   | 100.00      | 1.80       |
| Aster Stable Bond     | BOND_FUND     | R2   | 1000.00     | 2.60       |
| Aster Balanced Growth | BALANCED_FUND | R3   | 1000.00     | 3.40       |
| Aster Equity Select   | EQUITY_FUND   | R4   | 2000.00     | 4.20       |

All start AVAILABLE, version 0, fee 0.00, dataSource SIMULATED, with the frozen disclaimer and no return guarantee. Default/production creates schema but does not seed demo products or customers.

Alex is R2, assessed 2026-09-01, expires 2027-09-01. Suitability means product risk <= current customer risk. It is eligibility evidence, never a recommendation. R2/R2 is SUITABLE; R2/R3 and R2/R4 are NOT_SUITABLE.

Each check persists owner/product, both risk levels, both versions, result, reasons and timestamps. Checks are immutable historical evidence; changing reference data never rewrites them. Validity is 30 minutes; at/after expiresAt it cannot authorize a new investment. Current profile expiry is also enforced. Clock is injected throughout.

## Portfolio accounting

Initial positions: holding_market -> product_cash 10000.00; holding_bond -> product_bond 5320.00 (cost 5100.00); holding_cash has no purchasable product and is 3000.00. Total value 18320.00; invested 18100.00; gain 220.00.

Only current-customer positions are loaded. BigDecimal sums produce totals. No redundant portfolio header is needed: version is the sum of position versions; asOf is their maximum updated_at (Clock for an empty portfolio). Monthly change is stored per position; net contributions accumulate separately. The frozen demo percent uses monthly change / (current value - monthly contributions - monthly change), rounded to two decimals. This preserves 1.22% when principal is added. This is a fixed demo valuation basis, not a live return calculation.

Purchases add principal to current value, invested amount and monthly contributions; gains and monthly change remain unchanged. Fees reduce cash, never increase position value. A new product position is inserted when needed. Unique(customer_id, product_id) prevents duplicate positions.

All financial columns use NUMERIC(24,2), domain calculations use BigDecimal/Money, wire values use decimal strings. No floating-point amount math, NAV, quantity engine or market data.

## Prepare, hash and execution

Prepare validates owned ACTIVE account, AVAILABLE product, current risk profile, owned unexpired check matching product/current versions and risk levels, suitable result, positive amount (at most 12 whole and 2 fractional digits), minimum, matching CNY currencies and sufficient available balance including fees.

Prepare writes only an immutable intent. Review terms capture complete product, source account, suitability, principal, fees, total debit, projected available balance, timestamps and CONFIRMATION semantics. The intent lives 15 minutes. The hash uses ordered, length-prefixed fields, normalized Money values and instant-normalized timestamps, with a versioned domain separator. It never hashes arbitrary JSON. Equivalent decimal representations produce the same hash for identical terms.

Execution accepts only intentId + intentHash and the idempotency header:

1. Begin READ_COMMITTED write transaction and lock the owned customer row FOR NO KEY UPDATE, following existing Transfer/Card/Recurring ordering.
2. Check (customer, operation, key) replay first. Same fingerprint returns the original order even after intent/check expiry; another fingerprint returns IDEMPOTENCY_KEY_REUSED.
3. Load owned intent; validate supplied/recomputed hash, PREPARED status and expiry.
4. Lock product reference FOR SHARE and current risk/account rows; load original check and revalidate evidence, availability and all financial prerequisites.
5. Compare current product/account/check with immutable terms. A balance or pending change invalidates the old review even if funds remain sufficient.
6. Debit through Account.debit / AccountMutationPort, preserving pending amount; add principal to the owned position.
7. Append one DEBIT / COMPLETED / INVESTMENT_PURCHASE / INVESTMENT transaction with positive totalDebit (including fees), no invented merchant/counterparty. Existing transaction revision/cursor semantics are retained.
8. Persist order receipt, mark intent EXECUTED and persist idempotency completion; commit once.

Any failure rolls back all eight financial/persistence effects. The receipt retains the source account review snapshot; GET Account provides the post-execution balance. Snapshots use version-1 persistence envelopes; unknown snapshot versions fail closed.

## Concurrency, isolation and Spending

Database owner locks serialize mutation across existing domains. Product/risk locks prevent prerequisites changing midway through execution. Positions also use expected business versions; the database guarantees one order per intent, one transaction per order and owned composite FKs. No JVM global lock or database trigger orchestrates this flow.

Two prepared intents from the same account cannot both use a stale balance snapshot. The no-lost-update test instead prepares one investment from Current and one from Savings into the same Bond position: both are independently valid and commit 5320 -> 7320. Competing 1000 purchases against 1500 available permit only one.

Spending continues to query the canonical transaction table and excludes investment principal movement. With fees, the same investment transaction carries totalDebit and remains excluded under the frozen M18 eligibility rules. Fixed-window tests compare every Spending aggregate before/after. Card state, recurring state/history and unrelated accounts remain unchanged.

## Verification and local smoke

WealthPostgreSqlIT uses an isolated PostgreSQL 17 Testcontainer, deterministic Clock, real HTTP session/CSRF requests, concurrency, fault injection at five stages, actual constraint failure and full Spring context restart. Existing M12–M18 suites continue to run.

Run the [smoke script](wealth-smoke.ps1) against local profile on port 18080 with a fresh isolated demo database for the exact baseline. It creates persistent investment state and does not reset it. The full validation results and database used are recorded in [M19 report（历史资料）](../release-status.md#历史资料).

No Overview/Public backend, frontend runtime switch, redemption, KYC, investment recommendation, real brokerage or M20 work is included.
