# M15 — PostgreSQL persistence and transaction foundation

## Delivered implementation

The existing nine Customer operations use PostgreSQL adapters in local/default runtime. The other thirty Customer and nine Public operations remain unimplemented. Frontend/MSW and frozen contracts are unchanged.

Added Boot-managed Spring Data JPA/Hibernate, Flyway starter and PostgreSQL support, PostgreSQL JDBC, Spring Boot Testcontainers integration and Testcontainers PostgreSQL. No transitive versions are hand-pinned. Compose uses postgres:17-alpine; the pulled server reports PostgreSQL 17.11.

Resolved versions: Spring Data JPA 4.1.1, Hibernate 7.4.5.Final, Flyway 12.4.0, PostgreSQL JDBC 42.7.13 and Testcontainers 2.0.5, managed by the existing Spring Boot 4.1.1 baseline.

## Files and schema

- infra/compose/postgres.compose.yml and .env.example: loopback port 5432, named volume, healthcheck and local-only credentials.
- db/migration/V1__initial_banking_schema.sql: customers, accounts, transactions, recipients, transfer_intents, transfers, idempotency_records.
- Feature-local Account/Transaction/Payment adapter.persistence packages: explicit entities, mappers, owned queries, SQL pagination, snapshot codec and PostgreSqlTransferExecutionBoundary.
- Shared DatabaseScope, customer persistence metadata and local DemoDataInitializer; PostgreSqlConfiguration and explicit unit-profile wiring.
- TransactionRepository window/anchor port methods allow SQL pagination while retaining in-memory behavior. Transfer orchestration is retained; new timestamps normalize to microsecond storage precision.
- Architecture checks now prohibit persistence dependencies in domain/application. Existing test harness explicitly selects unit adapters. New PostgreSqlIT is run by Failsafe during verify.
- Database/persistence documents, ADR 0012, README and implementation status/matrix updates.

Primary/foreign keys and composite customer ownership constraints protect references. Unique intent and transaction receipt references prevent repeated execution. Idempotency scope is a database primary key. Monetary checks reject impossible negative structural states. Three transaction query indexes cover owner/time, account/time and card/time; no unrelated domain tables or triggers exist.

NUMERIC(24,2) supports twenty-two whole digits, matching current CNY/USD minor units. FX rates use NUMERIC(24,10). Java BigDecimal and API decimal strings remain unchanged. TIMESTAMPTZ and UTC JDBC retain offset-safe instants.

## Queries and mutation

Transaction filtering and composite keyset continuation run in PostgreSQL with limit+1. Stored normalized search columns match deterministic Java Locale.ROOT semantics for title, merchant and counterparty only. Tests compare complete in-memory results and database traversal for all principal filters at limits 1, 2, 7, 10 and 50.

Intent/receipt snapshots are version-1 structured JSONB, with typed critical financial fields and lifecycle alongside them. They restore confirmed review values without rereading current source data.

TransactionTemplate replaces the in-memory execution lock. Database customer-row coordination precedes idempotency lookup; Intent/account row locks and unique constraints prevent double debit. No global synchronized/ReentrantLock participates in PostgreSQL execution. Readers use repeatable-read scopes; mutation uses READ COMMITTED.

SQL constraint injection into transaction and transfer writes proves earlier debit/lifecycle changes roll back. Real threads test same-key replay, different-key execution of one Intent, and two 500.00 intents competing for 600.00 available.

Restart tests reconstruct the entire Spring context against the retained container database and verify original receipt, account, transaction, lifecycle and idempotency. Local seed reruns preserve mutations and never duplicate the initial rows.

## Validation

| Check                                 | Result                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm contract:check, before and after | PASS; both frozen hashes unchanged                                                                                                                           |
| pnpm lint                             | PASS                                                                                                                                                         |
| pnpm typecheck                        | PASS                                                                                                                                                         |
| pnpm test                             | PASS; 359 Vitest tests across 24 files and 3 contract-hash tests                                                                                             |
| mvnw.cmd clean verify                 | PASS; 150 existing tests plus 19 PostgreSQL integration tests, total 169; zero failures/errors/skips                                                         |
| Flyway / Hibernate                    | Empty Testcontainers database migrated with V1; Hibernate validate passed                                                                                    |
| PostgreSQL concurrency                | All three required races passed without JVM mutation locks                                                                                                   |
| Real SQL rollback                     | Transaction and Transfer CHECK failures restored all prior state                                                                                             |
| Restart durability                    | Entire Spring context rebuilt against retained PostgreSQL; receipt, debit, transaction, Intent and idempotency preserved; retry returned the original result |
| Database availability                 | Unreachable database fails startup; stopped test database produces 503 / DOWN without health details                                                         |
| Local runtime                         | Actual Compose PostgreSQL plus packaged local-profile application; health 200 / UP and anonymous Accounts 401                                                |
| Local restart / seed                  | Stop/start retained 3 accounts, 61 transactions, 3 recipients, CNY balance 23842.31 and seed_version 1; no duplicate/reset                                   |

The PostgreSQL suite exercises all nine generated HTTP operations, customer isolation, exact multi-page parity, large NUMERIC values, offset instants and database uniqueness/ownership constraints. Existing M12–M14 tests were retained, with explicit unit-profile storage wiring.

Validation used JDK 21 with per-command memory caps (Maven 384 MB, test JVM 320 MB, local JVM 256 MB; SerialGC and two active processors). Docker initially failed to start its WSL engine, then recovered after applications were closed and Docker was started again. Tests were not skipped or replaced with another database. Frontend regression and local startup were run separately after a concurrent attempt exhausted Windows commit memory.

Local verification used port 18080 because the existing ShareLaTeX container occupies 8080. The packaged JAR was launched with --spring.profiles.active=local --server.port=18080 twice. After verification the temporary backend and this project's PostgreSQL container were stopped; the named database volume was retained and unrelated containers were left running.

Implementation matrix: **9 Customer IMPLEMENTED_POSTGRESQL, 30 Customer NOT_IMPLEMENTED, 9 Public NOT_IMPLEMENTED**.

## Contract freeze

Customer 1.9.0:
`602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`

Public 1.2.0:
`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

## Limits

This is a durable local banking foundation, not a production deployment. Authentication, frontend integration, backup/PITR, TLS/secret distribution, multi-instance operational testing and performance tuning remain future work. Per-customer locking favors simple correctness over maximum throughput. JSON snapshot versions require explicit migration if their storage structure changes. Supported money currencies remain the frozen CNY/USD set.

No M16 work is included. See [schema](../backend/database-schema.md), [persistence workflow](../backend/postgresql-persistence.md) and [ADR 0012](../adr/0012-postgresql-persistence-and-transaction-boundary.md).

**Stop at M15.**
