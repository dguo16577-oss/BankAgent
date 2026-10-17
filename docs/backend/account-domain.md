# Account read domain — M13

M14 adds Account.debit and AccountMutationPort. Debit validates ACTIVE status, positive matching-currency amount and available funds, returning a replacement Account with pending unchanged. In-memory repository reads and Transfer mutations share a lock; Account detail holds a consistent read scope over account, as-of and recent activity. See [Transfer domain](transfer-domain.md).

Implemented: `GET /customer/accounts`, `GET /customer/accounts/{accountId}`. Runtime remains authenticated and fail closed; test Authentication proves successful reads. No account mutation or persistence is implemented.

## Structure and dependencies

```text
account/adapter/web/AccountController
  -> account/application/AccountQueryService
      -> account/application/AccountRepository
          <- account/adapter/inmemory/InMemoryAccountRepository
      -> transaction/application/TransactionReadPort (recent activity)
```

`Account`, `AccountId`, `AccountType`, `AccountStatus`, and `ExchangeEquivalent` belong to the Account domain. Shared `CustomerId`, `CardId` and `Money` are value objects, without Spring or generated DTO dependencies. `AccountSnapshot` and `AccountView` are application results, distinct from generated HTTP models. There is no persistence model yet.

`AccountController` implements generated `ListAccountsApi` and `GetAccountApi`; it declares no new route contract. `ReadModelMapper` is in `shared.web`, the HTTP mapping boundary. Domain enum types are separate from generated enums; output mapping uses explicit exhaustive switches.

The generator normalizer groups Customer operations by existing operationId (`SET_TAGS_TO_OPERATIONID=true`). This affects only generated Java interface grouping, enabling a controller to implement a subset of operations without implementing a giant DefaultApi. All 39 operations are still generated, abstract, and checked against frozen paths/verbs/operationIds. Neither YAML nor its hashes changes.

## Identity and ownership

`CurrentCustomerProvider` reads authenticated Spring Security identity at the web boundary and returns a `CustomerId`. Application/repository methods require that ID explicitly. No Authentication/Principal/SecurityContext is passed into application or domain code. The future authentication provider must expose the stable Customer ID as the authenticated name, or adapt CurrentCustomerProvider when a typed principal is introduced.

Repository lookup scopes by both owner and resource ID. Unknown and foreign accounts both return 404 `ACCOUNT_NOT_FOUND` with the same safe message. There is no customer selector in the API and no identity header implementation. Arbitrary query/header input never changes ownership scope.

## Money and balances

Domain Money uses `BigDecimal` and `Currency`, normalizing to the currency's exact scale with `UNNECESSARY` rounding. Financial operations reject currency mismatch. HTTP mapping uses `toPlainString`, never floating point or scientific notation. CNY and USD have two fractional digits; excessively precise input is rejected rather than silently rounded.

`availableBalance()` derives `balance - pendingAmount`; pending must be non-negative and use the same currency. Seed loading verifies the projected available balance. List totals are computed by the application snapshot from CNY balances and the explicit foreign equivalent. Domain values and repository collections are immutable.

USD remains 621.32; the 7.10 demo rate yields CNY 4411.37 using half-up rounding. Tests reconcile this valuation, total CNY 36453.68, and Current's 23842.31 - 32.00 = 23810.31. No external FX source is called. Snapshot/conversion timestamps are fixed fixture metadata, not freshly manufactured rate timestamps.

## Recent transactions

Account detail asks TransactionReadPort for the five newest transactions scoped to the same customer/account. It reuses the Transaction domain and shared stable ordering. Transaction domain never depends on Account application. Transaction detail obtains account values through its own narrow TransactionAccountPort, wired to AccountRepository in configuration; the two query services do not depend on each other.

See [transaction domain](transaction-domain.md), [fixture provenance](demo-data.md) and [ADR 0010](../adr/0010-account-transaction-read-models.md).
