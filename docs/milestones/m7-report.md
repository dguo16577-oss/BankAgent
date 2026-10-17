# M7 delivery: Wealth / Investment

## Outcome

M7 adds Wealth Portfolio, an API-filtered Product Catalog, service-owned Suitability and immutable Investment Order execution to the existing frontend/OpenAPI/MSW simulator. No next milestone was started.

The existing three holdings total CNY 18320.00. Four fictional products cover MONEY_MARKET, BOND_FUND, BALANCED_FUND and EQUITY_FUND. Alex Chen's simulated profile is R2; the service returns SUITABLE for R1/R2 and NOT_SUITABLE for R3/R4. React renders that result and cannot authorize an unsuitable order.

All yields, valuations and orders are SIMULATED. New purchases add cost to current value and invested principal, without generating a performance gain. Initial fees are zero. There is no real market execution, NAV, advice, identity verification, authentication or redemption.

## Contract and domain behavior

- Ten endpoints added: portfolio; catalog/detail; risk profile; suitability create/read; investment-intent create/read; investment-order execute/read.
- OpenAPI v1.7.0 defines PortfolioSummary/Position, InvestmentProductSummary/Detail/Type, RiskLevel, UserRiskProfile, SuitabilityCheck/Result, InvestmentOrderIntent/Status and InvestmentOrderReceipt/OrderStatus, plus request schemas. TypeScript was regenerated; there are no duplicate handwritten DTOs.
- Product type/risk filters execute in WealthService. All monetary/percentage/yield values are decimal strings; BigInt minor units perform financial calculations.
- Valid suitability evidence is bound to the product/user and current product/risk-profile versions. It lasts 30 demo-clock minutes. Investment intents last 15 minutes and snapshot exact product, source account, amount, fee, total debit, suitability, projected available balance and hash.
- Confirmation posts only intentId/intentHash plus Idempotency-Key. Execution revalidates all prerequisites and the relevant snapshots, then commits account, portfolio, receipt, intent and transaction atomically.
- Same key/request returns the same receipt; changed request with the same key is rejected. Expired, hash-mismatched, unsuitable or stale requests cannot partially execute. Persistence failure preserves all domain state and clock.
- Store v7 owns all Wealth resources and migrates M4–M6 sessions without losing existing transfers, card actions or stopped recurring payments. Portfolio and Overview share the same state.
- TransactionType adds INVESTMENT_PURCHASE; category adds INVESTMENT. The single completed debit records total cash outflow, while the receipt separates principal and fee. Spending excludes it explicitly.

See [Wealth API](../api/wealth.md) and [ADR 0005](../adr/0005-investment-suitability-and-order-intent.md).

## Standard verified order

Purchase Aster Stable Bond, R2, from CNY Current for CNY 1000.00 with zero fee:

| Value                  | Before   | After    |
| ---------------------- | -------- | -------- |
| Current balance        | 23842.31 | 22842.31 |
| Available balance      | 23810.31 | 22810.31 |
| Pending hold           | 32.00    | 32.00    |
| Portfolio              | 18320.00 | 19320.00 |
| Bond position          | 5320.00  | 6320.00  |
| Deposit CNY equivalent | 36453.68 | 35453.68 |
| Completed spending     | 4968.00  | 4968.00  |

One order and one investment transaction are created. Existing transactions, cards and recurring instructions remain unchanged. Portfolio gain and monthly valuation change remain 220.00; new principal is recorded separately as a contribution.

## Files added or updated

### Contract, API and integration

- `contracts/openapi/customer.yaml`
- `apps/web/src/generated/customer-api.d.ts`
- `apps/web/src/lib/api/wealth.ts`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/transaction-options.ts`
- `apps/web/src/mocks/wealth-handlers.ts`
- `apps/web/src/mocks/handlers.ts`
- `apps/web/src/mocks/data/wealth-fixtures.ts`
- `apps/web/src/mocks/bank/wealth-service.ts`
- `apps/web/src/mocks/bank/store.ts`
- `apps/web/src/mocks/bank/spending-analytics.ts`
- `apps/web/src/features/overview/overview-dashboard.tsx`

### Pages and feature components

- `apps/web/src/app/app/wealth/page.tsx`
- `apps/web/src/app/app/wealth/products/[productId]/page.tsx`
- `apps/web/src/app/app/wealth/products/[productId]/invest/page.tsx`
- `apps/web/src/app/app/wealth/orders/review/[intentId]/page.tsx`
- `apps/web/src/app/app/wealth/orders/[orderId]/page.tsx`
- `apps/web/src/features/wealth/use-wealth.ts`
- `apps/web/src/features/wealth/wealth-ui.tsx`
- `apps/web/src/features/wealth/wealth-dashboard.tsx`
- `apps/web/src/features/wealth/product-catalog.tsx`
- `apps/web/src/features/wealth/product-detail.tsx`
- `apps/web/src/features/wealth/new-investment.tsx`
- `apps/web/src/features/wealth/investment-review.tsx`
- `apps/web/src/features/wealth/investment-receipt.tsx`

### Tests

- `apps/web/src/mocks/bank/wealth-service.test.ts`
- `apps/web/src/features/wealth/wealth.test.tsx`
- `apps/web/e2e/wealth.spec.ts`
- `apps/web/src/mocks/bank/recurring-service.test.ts` updates the expected migrated store version.

### Documentation

- `docs/api/wealth.md`
- `docs/adr/0005-investment-suitability-and-order-intent.md`
- `docs/api/spending.md`
- `docs/api/transactions.md`
- `docs/api/README.md`
- `docs/architecture/overview.md`
- `README.md`
- This delivery report and `docs/screenshots/m7-*.png`.

## Validation

| Command                     | Result                                            |
| --------------------------- | ------------------------------------------------- |
| `pnpm lint`                 | Passed, ESLint and formatting                     |
| `pnpm typecheck`            | Passed, including generated-contract freshness    |
| `pnpm test`                 | 261 tests passed across 18 files; 54 new M7 tests |
| `pnpm build`                | Passed, production App Router build               |
| `pnpm exec playwright test` | 38 passed using installed Edge; 3 new M7 journeys |

Coverage includes suitable/unsuitable products, missing/expired evidence, minimum/currency/funds, no financial mutation during preparation, immutable review, successful orders, fees/cent arithmetic, conservation of deposits plus portfolio at zero fee, unchanged pending/spending, transaction/Overview consistency, idempotent concurrent requests, uncertainty retries, stale state after a transfer, expiry, 404, atomic persistence failure and independent reset/migration.

E2E walks Login → Wealth → Stable Bond → SUITABLE → amount → review → confirmation → reloadable receipt → transaction → updated portfolio. It also verifies reduced account balance, unchanged spending and R3 NOT_SUITABLE blocking. Document width is checked at 320, 390 and 1440px. Production screenshot capture additionally verifies no page errors or horizontal overflow.

## Screenshots

| Page                  | 1440px                                                   | 390px                                                  | 320px                                                  |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Portfolio/catalog     | [Desktop](../screenshots/m7-wealth-desktop.png)          | [Mobile](../screenshots/m7-wealth-mobile.png)          | [Narrow](../screenshots/m7-wealth-narrow.png)          |
| Suitable product      | [Desktop](../screenshots/m7-product-desktop.png)         | [Mobile](../screenshots/m7-product-mobile.png)         | [Narrow](../screenshots/m7-product-narrow.png)         |
| Amount input          | [Desktop](../screenshots/m7-invest-desktop.png)          | [Mobile](../screenshots/m7-invest-mobile.png)          | [Narrow](../screenshots/m7-invest-narrow.png)          |
| Exact review          | [Desktop](../screenshots/m7-review-desktop.png)          | [Mobile](../screenshots/m7-review-mobile.png)          | [Narrow](../screenshots/m7-review-narrow.png)          |
| Receipt               | [Desktop](../screenshots/m7-receipt-desktop.png)         | [Mobile](../screenshots/m7-receipt-mobile.png)         | [Narrow](../screenshots/m7-receipt-narrow.png)         |
| Portfolio after order | [Desktop](../screenshots/m7-portfolio-after-desktop.png) | [Mobile](../screenshots/m7-portfolio-after-mobile.png) | [Narrow](../screenshots/m7-portfolio-after-narrow.png) |
| Unsuitable product    | [Desktop](../screenshots/m7-unsuitable-desktop.png)      | [Mobile](../screenshots/m7-unsuitable-mobile.png)      | [Narrow](../screenshots/m7-unsuitable-narrow.png)      |

## Remaining scope

No unresolved M7 validation failures. Redemption was optional and is not implemented. Real order routing/settlement, valuation feeds, authentication/KYC, personalized advice, Agent and backend/database work remain outside this delivery; future milestone scope is not assumed.

Start with `pnpm dev` in `D:\BankProject`, then visit `http://localhost:3000/app/wealth`. Stop at M7 and await the next instruction.
