# Wealth / Investment — M7

All products, risk profiles, valuations and orders are **SIMULATED**. These APIs demonstrate a banking workflow; they do not submit securities orders, use live NAV/market data, provide recommendations or perform real authentication.

## Endpoints

| Method | Path                                            | Purpose                                     |
| ------ | ----------------------------------------------- | ------------------------------------------- |
| GET    | `/customer/wealth/portfolio`                    | Portfolio and positions                     |
| GET    | `/customer/wealth/products`                     | Catalog; server filters `type`, `riskLevel` |
| GET    | `/customer/wealth/products/{productId}`         | Product terms and disclaimer                |
| GET    | `/customer/wealth/risk-profile`                 | Demo user risk profile                      |
| POST   | `/customer/wealth/suitability-checks`           | Create suitability evidence, HTTP 201       |
| GET    | `/customer/wealth/suitability-checks/{checkId}` | Retrieve evidence                           |
| POST   | `/customer/investment-order-intents`            | Prepare immutable review, HTTP 201          |
| GET    | `/customer/investment-order-intents/{intentId}` | Retrieve review                             |
| POST   | `/customer/investment-orders`                   | Execute exact intent using Idempotency-Key  |
| GET    | `/customer/investment-orders/{orderId}`         | Reloadable receipt                          |

No redemption APIs are implemented. OpenAPI is the only DTO source; frontend types are generated. Monetary, yield and percentage fields are decimal strings. Financial arithmetic uses BigInt minor units, with no floating-point amount calculations.

## Products and portfolio

| Product               | Type          | Risk | CNY minimum | Alex R2 result |
| --------------------- | ------------- | ---- | ----------- | -------------- |
| Aster Cash Reserve    | MONEY_MARKET  | R1   | 100.00      | SUITABLE       |
| Aster Stable Bond     | BOND_FUND     | R2   | 1000.00     | SUITABLE       |
| Aster Balanced Growth | BALANCED_FUND | R3   | 1000.00     | NOT_SUITABLE   |
| Aster Equity Select   | EQUITY_FUND   | R4   | 2000.00     | NOT_SUITABLE   |

Catalog filters use AND semantics, with no client-side substitute. Invalid, repeated, empty or unsupported query parameters return `INVALID_QUERY`. Product details include currency, status, minimum, purchase fee, indicative yield, liquidity, performance description, disclaimer and version. Yields are illustrative fixed demo values, not return promises or forecasts.

The portfolio starts from the existing profile: Money Market 10000.00, Bond Fund 5320.00 and Cash Management 3000.00 CNY. Total is 18320.00. Invested amounts are 10000.00, 5100.00 and 3000.00; the demo gain is 220.00. Cash Management is an existing position without a purchasable catalog product.

Valuation basis is `SIMULATED_COST_ADDITION`: new purchases add exactly their principal to current value and invested amount, without units, market execution or live NAV. Total and gain/loss are recalculated from positions. Fixed demo monthly change remains 220.00 / 1.22%; new principal appears separately in `monthlyNetContributions` and does not become a performance gain. This is a demo statement convention, not a time-weighted or money-weighted return calculation.

Initial purchase fees are 0.00 CNY. The service computes `totalDebit = amount + fees`, debits this total from deposits, and adds principal only to the portfolio. The investment transaction records the total debit; its receipt separates principal and fee. All initial products are CNY; cross-currency execution is rejected rather than converted.

## Suitability prerequisite

Alex Chen's simulated risk profile is R2. Wealth Service freezes the rule: product risk less than or equal to user risk means `SUITABLE`; greater risk means `NOT_SUITABLE`. React only renders the service result and never compares risk ranks to authorize purchase.

Create-check request contains only `productId`. The stored check includes product/user IDs, risk levels, product/risk-profile versions, result, reasons, creation and expiry. Checks last 30 minutes on the shared deterministic clock. GET preserves the evidence and its timestamps; expiry is enforced at prepare and execute. The risk profile also has an expiry and must exist and remain valid.

An investment intent must reference `suitabilityCheckId` for the exact product and user. Missing, expired, mismatched, unsuitable or stale evidence cannot prepare an executable intent. Execution recomputes suitability from current domain state as well as validating the evidence. A future Agent must use the same Banking Core APIs and cannot bypass this prerequisite.

## Immutable order intent

Prepare request: `productId`, `sourceAccountId`, `amount`, `suitabilityCheckId`.

Validate product existence/availability, ACTIVE source account, matching CNY currency, positive exact amount, minimum investment, available funds including fee, valid risk profile and suitable evidence. The amount permits at most 12 whole digits and exactly two decimals at the API boundary. UI input may omit decimals and normalizes them as strings.

The stored intent snapshots complete product and source-account terms, amount, fee, total debit, suitability evidence, projected available balance, SHA-256 hash, timestamps and CONFIRMATION requirement. Preparing adds only the intent; it does not reserve/debit funds or change the portfolio. Intent lifetime is 15 demo-clock minutes. Review displays both intent and suitability expiry; the earlier prerequisite expiry can prevent execution.

Execute accepts only `intentId`, `intentHash` and required `Idempotency-Key`. It revalidates all prerequisites, compares complete relevant product/account/evidence snapshots, then commits once without an intervening await. A balance change from another transfer makes the investment review stale even if funds remain sufficient, because its projected available balance would no longer be exact.

## Atomic execution and integration

One successful order changes source balance and available balance, position/current principal, portfolio aggregates, order resource, intent state and transaction revision. The existing pending amount remains unchanged. Overview derives its Wealth summary from the same stored portfolio. Transaction list/detail and Account Detail use the same newly created transaction.

Transaction additions are `INVESTMENT_PURCHASE`, category `INVESTMENT`, direction `DEBIT`, status `COMPLETED`. They contain no fabricated merchant or transfer counterparty. Spending explicitly excludes investment types/categories, including any purchase fee represented in the total investment debit.

Standard zero-fee 1000.00 CNY Stable Bond order:

| Value                         | Before   | After    |
| ----------------------------- | -------- | -------- |
| Current balance               | 23842.31 | 22842.31 |
| Current available             | 23810.31 | 22810.31 |
| Pending hold                  | 32.00    | 32.00    |
| Bank deposits, CNY equivalent | 36453.68 | 35453.68 |
| Bond position                 | 5320.00  | 6320.00  |
| Portfolio total               | 18320.00 | 19320.00 |
| Current completed spending    | 4968.00  | 4968.00  |

Financial `asOf` advances with execution; the current and comparison windows remain explicit. Cards, recurring instructions, unrelated accounts and historical transactions are untouched. Portfolio gain and historical spending remain unchanged. Cache invalidation refreshes portfolio/accounts/Overview/transaction details/spending/intent; old cursor pages are removed because the transaction snapshot revision changes.

## Idempotency, persistence and errors

Same key + same request returns the same receipt, including after expiry. Same key + different intent/hash returns 409 `IDEMPOTENCY_KEY_REUSED`. A different key cannot execute an already executed intent. Keys are scoped to investment orders, separate from transfers, cards and recurring actions. Review retains `confirm_{intentId}` on retries and reloads.

The store persists the entire next state before replacing in-memory state. Persistence failure leaves all balances, portfolio, transactions, intent, orders and clock unchanged. Store v7 migrates M4–M6 sessions, preserving existing account/card/recurring mutations while adding initial Wealth state. Tests reset the same injected clock and store. Session storage is a per-tab simulator, not a durable banking backend.

404: `INVESTMENT_PRODUCT_NOT_FOUND`, `RISK_PROFILE_NOT_FOUND`, `SUITABILITY_CHECK_NOT_FOUND`, `INVESTMENT_INTENT_NOT_FOUND`, `INVESTMENT_ORDER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`.

409: `RISK_PROFILE_EXPIRED`, `SUITABILITY_CHECK_EXPIRED`, `SUITABILITY_CHECK_MISMATCH`, `INVESTMENT_INTENT_EXPIRED`, `INVESTMENT_INTENT_HASH_MISMATCH`, `INVESTMENT_INTENT_ALREADY_EXECUTED`, `INVESTMENT_STATE_CHANGED`, `IDEMPOTENCY_KEY_REUSED`.

422: `INVESTMENT_PRODUCT_UNAVAILABLE`, `PRODUCT_NOT_SUITABLE`, `INVESTMENT_AMOUNT_BELOW_MINIMUM`, `INSUFFICIENT_FUNDS`, `CURRENCY_MISMATCH`, `INVALID_AMOUNT`, `ACCOUNT_NOT_ELIGIBLE`.

Malformed/extra request fields or invalid idempotency keys return 400 `INVALID_REQUEST`. Failed persistence returns 500 `PERSISTENCE_UNAVAILABLE`. Known terminal failures require a fresh review; uncertain network/server outcomes may safely retry the original request/key.
