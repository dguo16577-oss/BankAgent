# M13 — Account and Transaction Read Domains

## Delivered scope

Only these four operations are implemented, using the frozen generated interfaces:

| Method | Path                                   | Status                |
| ------ | -------------------------------------- | --------------------- |
| GET    | /customer/accounts                     | IMPLEMENTED_IN_MEMORY |
| GET    | /customer/accounts/{accountId}         | IMPLEMENTED_IN_MEMORY |
| GET    | /customer/transactions                 | IMPLEMENTED_IN_MEMORY |
| GET    | /customer/transactions/{transactionId} | IMPLEMENTED_IN_MEMORY |

No real authentication, PostgreSQL, mutations, Public content, MSW replacement, UI changes or Agent. Runtime Customer APIs remain inaccessible without authentication; Spring Security Test provides authenticated identities exclusively in tests.

## Changed files

- `services/banking-core/pom.xml`: Customer operationId interface grouping; no dependency/version expansion.
- `src/main/java/com/asterbank/banking/shared/domain/{Money,CustomerId,CardId}.java`: immutable shared value objects.
- `customer/account/domain/`: Account, AccountId, AccountType, AccountStatus, ExchangeEquivalent.
- `customer/account/application/`: AccountRepository, AccountQueryService, AccountSnapshot, AccountView, AccountNotFound.
- `customer/account/adapter/`: AccountController and InMemoryAccountRepository.
- `customer/transaction/domain/`: Transaction, TransactionId, separate enums, Merchant, Counterparty.
- `customer/transaction/application/`: query service/filter/page/detail result, repository and read/account ports, cursor codec, typed errors.
- `customer/transaction/adapter/`: TransactionController and InMemoryTransactionRepository.
- `shared/config/{DemoSeed,ReadDomainConfiguration}.java`, `shared/security/CurrentCustomerProvider.java`, `shared/web/{ReadModelMapper,ReadExceptionAdvice,TransactionQueryGuard}.java`.
- `src/main/resources/demo/alex-initial.json`: standalone backend seed.
- Tests: ReadDomainTest, ReadEndpointsTest, ReadDomainFixtures, DefaultProfileDataTest; expanded ArchitectureTest and updated M12 unimplemented-operation assertion.
- Updated module package documentation, service/root README, implementation matrix and its generator; added `implementation-status.json` to preserve the four statuses during regeneration.
- Added `scripts/export-m13-fixture.cjs`, backend Account/Transaction/Demo docs, ADR 0010 and this report.

Paths beginning with `src` or `customer` above are under `services/banking-core`; no generated Java is committed. Frozen YAML, freeze.json and frontend business implementation are unchanged.

## Architecture and ownership

AccountController -> AccountQueryService -> AccountRepository -> InMemoryAccountRepository.

TransactionController -> TransactionQueryService -> TransactionRepository -> InMemoryTransactionRepository.

Account detail obtains recent activity through TransactionReadPort; Transaction detail obtains its owned Account domain value through TransactionAccountPort. Configuration wires the latter to AccountRepository, avoiding a reverse dependency on Account application. Both application services depend on ports, not concrete storage adapters.

CurrentCustomerProvider converts authenticated Spring Security identity into CustomerId at the web boundary. Application/domain code never reads SecurityContext or imports Spring Security. Every repository lookup filters owner before returning a resource. Unknown and foreign resources use identical 404 envelopes, preventing ownership enumeration. Tests exercise both customer directions and forged account/card query filters. No customer identity header or local bypass was added.

## Money, mapping and seed

Money is BigDecimal + Currency. Precision tests cover exact 0.10 + 0.20, very large amounts, plain-string output, rejected excess fractional precision and currency mismatch. Available balance derives from balance minus pending; transaction amount rejects negatives and direction remains separate. OffsetDateTime is used in domains, mapped to offset wire strings at the HTTP boundary.

Generated enums/DTOs are different Java types from domain models. `shared.web.ReadModelMapper` explicitly constructs response DTOs; modifying a returned DTO cannot mutate the domain. Customer generation uses built-in SET_TAGS_TO_OPERATIONID to avoid implementing unrelated abstract methods from a large DefaultApi. All 39 Customer and 9 Public signatures still compile and match the source contract.

Backend seed contains exactly Alex's 3 accounts and 61 initial transactions. The development parity check matches all fields against the frontend initial projection, but Java startup/build reads only backend JSON. Only local/test loads it; default profile repositories are empty. A second customer/account/transaction exists exclusively in test code. Pending, available balance, portfolio-excluded deposit total and fixed demo FX projection reconcile. No full sensitive identifier or credential is stored in this seed.

## Query and pagination results

All 11 frozen parameters are supported. Filters combine with AND before pagination, scoped to CustomerId. Date bounds are from-inclusive/to-exclusive and compared as instants. Enums remain uppercase. Search trims and uses Locale.ROOT lowercase literal substring matching on title, merchant name and counterparty name only. Reference-only search does not match because reference is outside the frozen search contract.

Cursor is unpadded Base64 URL-safe encoding of a version, scope digest, last instant and ID. Scope includes customer, normalized filters, limit and snapshot revision. Keyset order is occurredAt DESC / ID ASC by code point. Malformed, oversized, mismatched or missing-anchor cursors return 400 INVALID_CURSOR; invalid query parameters return 400 INVALID_QUERY. No offsets/page numbers, signing or expiry were introduced.

Blocking pagination regression covers five limits across five filter sets. Multi-page ID sequences exactly match complete filtered results, including timestamp ties, with no missing/duplicate rows. An authenticated HTTP traversal also returns all 61 Alex records in the expected order.

## Validation

| Check                                                 | Result                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm contract:check` before and after implementation | PASS; both frozen hashes unchanged                                                                         |
| `pnpm lint`                                           | PASS; ESLint and formatting                                                                                |
| `pnpm typecheck`                                      | PASS                                                                                                       |
| `pnpm test`                                           | PASS; 359 Vitest tests in 24 files and 3 contract freeze tests                                             |
| `services/banking-core/mvnw.cmd clean verify`         | PASS; 87 tests, zero failures/errors/skips, including 3 ArchUnit tests                                     |
| `node scripts/export-m13-fixture.cjs --check`         | PASS; 3 accounts and 61 transactions match the frontend initial projection                                 |
| Local runtime HTTP probe                              | Health 200 UP; accounts and transactions 401 even with forged X-Customer-Id; unimplemented Public home 404 |

Coverage includes all four generated endpoint adapters, money/FX/pending invariants, privacy masks, ownership isolation, every filter, date/search semantics, cursor failures/traversal, empty results, generated response fields, default profile isolation and architecture boundaries. Backend verification used JDK 21 without changing the system Java installation. The temporary local backend was stopped after the HTTP probe.

## Contract freeze

Customer 1.9.0 hash unchanged:

`602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`

Public 1.2.0 hash unchanged:

`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

## Handoff and deferred work

[Implementation matrix](../backend/implementation-matrix.md): four IMPLEMENTED_IN_MEMORY, 35 Customer NOT_IMPLEMENTED, all nine Public NOT_IMPLEMENTED. Infrastructure health/info remains available; production authentication remains unimplemented and fail closed.

Deferred: Transfer and other mutation domains, authentication/session persistence, database adapters and seeds, cursor signature/expiry/live-snapshot policy, Public backend, frontend integration and Agent. Future mutation adapters must advance the transaction snapshot revision. Current fixtures are selected historical records plus opening snapshots, not a full ledger reconstruction.

Further details: [Account](../backend/account-domain.md), [Transactions](../backend/transaction-domain.md), [Demo provenance](../backend/demo-data.md), [ADR 0010](../adr/0010-account-transaction-read-models.md).

**Stop at M13. Do not enter M14.**
