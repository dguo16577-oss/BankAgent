# M6 delivery: Spending Analytics + Recurring Payments

## Outcome

M6 implements frontend, OpenAPI and mutable MSW behavior only. Aster Bank's existing layout, API client, Query Provider, generated DTO workflow, transfer/card services and Transaction Domain remain in use. No M7 implementation was started.

- Analytics API computes exact decimal totals from shared transactions; standard MTD is CNY 4968.00 vs CNY 4800.00, change 3.50%.
- Eligibility is COMPLETED + DEBIT + CARD_PAYMENT/DIRECT_DEBIT/FEE, excluding TRANSFER category. All other types/statuses/directions are excluded.
- Spending supports current/previous month, custom dates and account selection, daily chart, categories, merchants and Transaction Domain drilldown.
- Five bank-managed recurring payments reuse the financial profile. A sixth, Bookshop, exposes three matched transaction IDs and observation dates with capability NONE.
- Netflix stop uses immutable prepare/review/confirm/receipt, CONFIRMATION, strict request fields, hash, expiry, state/version revalidation and endpoint-scoped idempotency.
- A successful stop removes future Netflix from Overview, while preserving historical transactions, spending, balances, holds, cards and wealth. Network retries cannot execute twice; persistence failure cannot partially mutate state.
- Store v6 migrates M4/M5 sessions while preserving existing mutations. Additional historical fixtures reconcile analytics without reposting opening balances.

## Contract

Added `GET /customer/spending/summary`, recurring-payment list/detail, action-intent create/read and action execute/read: seven endpoints in total. Query fields are from/to/compareFrom/compareTo/accountId; API responses explicitly return both windows. Default analytics scope is CNY accounts; single-account scope uses original currency without FX.

Added SpendingPeriod/Summary/CategoryBreakdown/TrendPoint/MerchantBreakdown; RecurringPayment Summary/Detail/Type/Status/Frequency/Source/ManagementCapability/DetectionProvenance/State; action type, intent/status, receipt and request schemas. OpenAPI remains the only DTO source; generated TypeScript was regenerated and checked.

See [Spending API](../api/spending.md), [Recurring API](../api/recurring-payments.md), and [ADR 0004](../adr/0004-recurring-payment-management-semantics.md).

## Files added or updated

### Contract and API boundary

- `contracts/openapi/customer.yaml`
- `apps/web/src/generated/customer-api.d.ts`
- `apps/web/src/lib/api/spending.ts`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/offset-time.ts`

### Store, services, fixtures and handlers

- `apps/web/src/mocks/bank/amount.ts`
- `apps/web/src/mocks/bank/spending-analytics.ts`
- `apps/web/src/mocks/bank/recurring-service.ts`
- `apps/web/src/mocks/bank/store.ts`
- `apps/web/src/mocks/data/recurring-fixtures.ts`
- `apps/web/src/mocks/data/demo-profile.ts`
- `apps/web/src/mocks/data/transaction-fixtures.ts`
- `apps/web/src/mocks/spending-handlers.ts`
- `apps/web/src/mocks/handlers.ts`

### Pages and features

- `apps/web/src/app/app/spending/page.tsx`
- `apps/web/src/app/app/spending/recurring/[recurringPaymentId]/page.tsx`
- `apps/web/src/app/app/spending/recurring/[recurringPaymentId]/actions/review/[intentId]/page.tsx`
- `apps/web/src/app/app/spending/recurring/[recurringPaymentId]/actions/[actionId]/page.tsx`
- `apps/web/src/features/spending/use-spending.ts`
- `apps/web/src/features/spending/presentation.tsx`
- `apps/web/src/features/spending/spending-dashboard.tsx`
- `apps/web/src/features/spending/spending-chart.tsx`
- `apps/web/src/features/spending/recurring-list.tsx`
- `apps/web/src/features/spending/recurring-detail.tsx`
- `apps/web/src/features/spending/recurring-action-review.tsx`
- `apps/web/src/features/spending/recurring-action-receipt.tsx`
- `apps/web/src/features/transactions/filter-state.ts`
- `apps/web/src/features/transactions/transactions-list.tsx`
- `apps/web/src/features/overview/overview-dashboard.tsx`
- `apps/web/src/features/overview/spending-chart.tsx`
- `apps/web/src/components/banking-layout.tsx`

### Tests

- `apps/web/src/mocks/bank/spending-service.test.ts`
- `apps/web/src/mocks/bank/recurring-service.test.ts`
- `apps/web/src/features/spending/spending.test.tsx`
- `apps/web/e2e/spending.spec.ts`
- Updated fixture-count/pagination assertions in `apps/web/src/mocks/data/transactions.test.ts`, `apps/web/src/mocks/bank/transfer-service.test.ts`, `apps/web/src/mocks/bank/card-service.test.ts`, `apps/web/src/features/payments/payments.test.tsx`.

### Documentation and screenshots

- `docs/api/spending.md`
- `docs/api/recurring-payments.md`
- `docs/adr/0004-recurring-payment-management-semantics.md`
- `docs/api/README.md`
- `docs/api/transactions.md`
- `docs/architecture/overview.md`
- `README.md`
- This delivery report and `docs/screenshots/m6-*.png`.

## Validation

| Command                     | Result                                                      |
| --------------------------- | ----------------------------------------------------------- |
| `pnpm lint`                 | Passed, ESLint and formatting                               |
| `pnpm typecheck`            | Passed, including generated contract freshness              |
| `pnpm test`                 | 207 passed across 16 files; 59 new M6 cases                 |
| `pnpm build`                | Passed, Next.js production build                            |
| `pnpm exec playwright test` | 35 passed using installed Edge, including 3 new M6 journeys |

E2E checks 320/390/1440px document widths; category drilldown preserves exact timestamps; recurring review and receipt survive reload; stopping Netflix removes its future Overview entry. Production screenshot capture additionally checks no document overflow or page errors.

## Screenshots

| Page             | 1440px                                            | 390px                                           | 320px                                           |
| ---------------- | ------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Spending         | [Desktop](../screenshots/m6-spending-desktop.png) | [Mobile](../screenshots/m6-spending-mobile.png) | [Narrow](../screenshots/m6-spending-narrow.png) |
| Netflix detail   | [Desktop](../screenshots/m6-netflix-desktop.png)  | [Mobile](../screenshots/m6-netflix-mobile.png)  | [Narrow](../screenshots/m6-netflix-narrow.png)  |
| Review           | [Desktop](../screenshots/m6-review-desktop.png)   | [Mobile](../screenshots/m6-review-mobile.png)   | [Narrow](../screenshots/m6-review-narrow.png)   |
| Receipt          | [Desktop](../screenshots/m6-receipt-desktop.png)  | [Mobile](../screenshots/m6-receipt-mobile.png)  | [Narrow](../screenshots/m6-receipt-narrow.png)  |
| Detected pattern | [Desktop](../screenshots/m6-detected-desktop.png) | [Mobile](../screenshots/m6-detected-mobile.png) | [Narrow](../screenshots/m6-detected-narrow.png) |

## Deferred scope

No unresolved M6 validation failures. Future milestones can define real Banking Core persistence, scheduling, authorization and merchant integration. Restart/edit recurring instructions, real merchant contract termination, ML detection, FX analytics, refunds/disputes, wealth changes and Agent/LLM remain unimplemented. No M7 scope is assumed.

Run `pnpm dev` from `D:\BankProject`; visit `http://localhost:3000/app/spending`. This delivery stops at M6.
