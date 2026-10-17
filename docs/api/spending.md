# Spending analytics — M6

`GET /customer/spending/summary` is a Banking Analytics read API. The mock analytics service derives every result from the unified store's Transaction Domain records. React never aggregates a loaded page of transactions. `/app/overview` remains a Web read model and uses the same analytics selector.

## Scope and inclusion

All of these conditions must hold:

- Status `COMPLETED`.
- Direction `DEBIT`.
- Type `CARD_PAYMENT`, `DIRECT_DEBIT` or `FEE`.
- Category is neither `TRANSFER` nor `INVESTMENT`.

`BANK_TRANSFER`, `CASH_WITHDRAWAL`, `FX_EXCHANGE`, `SALARY`, `INTEREST` and `INVESTMENT_PURCHASE` are excluded. A cash withdrawal does not establish where the cash was spent. Credits and `PENDING`, `REVERSED`, `FAILED`, `CANCELLED` records are excluded regardless of type. A new M4 CNY 500 transfer remains visible in Transactions and reduces balances, but does not increase spending. M7 investment principal and its receipt fee (represented together in the investment debit) are capital movements and do not enter spending. The pending Starbucks CNY 32 remains an account hold and is excluded from completed spending.

Default scope is all **CNY accounts**. `accountId` restricts the result to that account's original currency, including USD. The response includes `currency` and `accountIds`. There is no implicit FX conversion or sum across different currencies. An unknown account returns HTTP 404 `ACCOUNT_NOT_FOUND`.

## Periods and comparison

Optional query fields: `from`, `to`, `compareFrom`, `compareTo`, `accountId`. Supply both boundaries of each custom period. Dates must be real ISO 8601 dates with offsets. Windows are `[from, to)`, applied to `occurredAt`. Repeated/unknown/empty fields, reversed/empty windows and windows longer than 366 days return HTTP 400 `INVALID_QUERY`.

Default period is month start through financial `asOf` in UTC+08. Default comparison shifts the current boundaries one calendar month earlier, clamping dates to the previous month's last day. If clamping collapses a custom range to an empty/reversed comparison, its end becomes the next local midnight after the clamped start. The response always includes explicit `period` and `comparisonPeriod`. Custom comparison windows can be supplied explicitly. Percentage change is null when the comparison total is zero. Percentages use two decimal places, rounded half away from zero; separately rounded category percentages may not sum to exactly 100.00.

Standard snapshot:

| Window                           | Completed CNY spending |
| -------------------------------- | ---------------------- |
| Sep 1 00:00 — Sep 27 10:30, 2026 | 4968.00                |
| Aug 1 00:00 — Aug 27 10:30, 2026 | 4800.00                |
| Full August                      | 5400.00                |

The same-period absolute change is 168.00; percentage change is 3.50. All boundaries above use UTC+08 and an exclusive end. Transfer execution advances financial `asOf`; a protective recurring stop advances the action clock without changing financial `asOf`.

## Aggregation and presentation

- `Money.amount`, changes and percentages are decimal strings. BigInt minor units perform all financial arithmetic. JS numbers occur only at the Recharts geometry boundary.
- `categoryBreakdown` reuses `TransactionCategory`, with amount, transaction count and percentage of total.
- `topMerchants` groups by merchant ID and sorts by amount descending, then merchant ID. Transactions without a merchant contribute to total/category/trend, but never to merchant aggregation. Transfer counterparties are never merchants. The UI shows the first six merchants.
- `trend` returns daily UTC+08 buckets clipped to the requested boundaries, including zero days. The sum of buckets equals the total. Overview's six monthly amounts are also derived from the store.
- Historical deterministic records complete the existing statement totals. Pre-September records are already reflected in the opening-balance snapshot; they are not posted again. Four recurring subscriptions now correctly carry card-payment attribution; Rent remains a direct debit.
- Category and merchant links reuse `/app/transactions` with exact offset `from`/`to` values. Transactions preserves these exact timestamps in URL/API queries and labels the exclusive end. Date-only filters elsewhere retain M3's inclusive date-picker convention. Transaction history can include pending, otherwise ineligible spending records, or other currencies when no account filter is set. The UI states this; select an account for an exact account scope. It is not a duplicate analytics list.

Schemas: `SpendingPeriod`, `SpendingSummary`, `SpendingCategoryBreakdown`, `SpendingTrendPoint`, `SpendingMerchantBreakdown`. Legacy Overview DTOs are explicitly named `OverviewSpendingSummary` and `OverviewSpendingTrendPoint`; their wire shape is preserved.
