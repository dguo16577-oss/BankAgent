# PostgreSQL persistence — M15

## Boundaries and profiles

Account/Transaction/Payment persistence adapters live under their respective feature packages. JPA entities are separate from domain records. Account uses a scoped Spring Data repository for listing; custom EntityManager queries implement owned lookups, explicit locks and SQL keyset pagination. Mappers return fresh domain values.

Local and default runtime use PostgreSQL configuration. Local has development credentials and deterministic seed initialization. Default requires supplied database credentials and does not load demo data. A failed connection or migration fails startup; there is no fallback adapter.

The explicit unit profile selects existing in-memory beans and excludes database auto-configuration for legacy unit/web tests. It is test-only and is never automatically selected on database failure. Integration tests use the integration profile and a real Testcontainers PostgreSQLContainer on an isolated dynamic port.

Boot-managed dependencies supply JPA/Hibernate, Flyway/PostgreSQL support, JDBC and Testcontainers. The PostgreSQL image is postgres:17-alpine (verified server 17.11). PostgreSQL 17 remains a supported major according to the [official version policy](https://www.postgresql.org/support/versioning/).

## Transaction and snapshot persistence

PostgreSqlTransferExecutionBoundary implements the existing application port using TransactionTemplate. TransferExecutionService retains prepare/revalidate/debit/append/receipt/lifecycle/idempotency orchestration. The database handles commit/rollback and row locking; PostgreSQL configuration contains no BankingMemoryLock.

Completed idempotency records survive process restart. Customer-row lock acquisition precedes idempotency lookup, so same-key concurrent callers see the first committed receipt before evaluating one-use Intent state. Different-key execution of one Intent is serialized and rejected after the first success. Current-funds validation and source debit share the transaction and account row lock.

Intent and receipt JSONB documents have an explicit version=1 envelope. They are structured JSON, never Java serialized blobs or HTTP DTOs. Their snapshot structure is part of the storage schema: future record-shape changes require versioned readers/data migration. Critical financial terms, references, owner and lifecycle also have typed columns and constraints. GET review restores the saved snapshot, not current recipient/account data.

Read scopes use repeatable-read database transactions. All owned queries include customer_id before loading a resource. Pagination executes SQL predicates for all frozen filters, validates the anchor in the same filtered scope, and fetches limit+1 rows after the composite keyset. The full-result repository method exists for parity tests; Web pagination never calls it.

## Seed and durability

Local initialization inserts Alex, three accounts, 61 transactions and three recipients. It uses backend-owned fixtures and a customer seed_version marker inside one transaction, protected by the customer row lock. Restart neither duplicates rows nor resets balances. Other-customer fixtures are test-only. Schema migration contains no demo banking rows.

The restart integration test closes the entire Spring context after a transfer, builds new persistence services against the same test database, reruns initialization, and retries the same key. It verifies the exact original receipt, balance, transaction, Intent and idempotency state.

## Tests

Maven Failsafe runs PostgreSqlIT as part of clean verify. It starts a fresh PostgreSQLContainer, then Boot/Flyway/Hibernate build the schema from empty. Tests explicitly provide Boot JdbcConnectionDetails backed by the externally owned container so closing a Spring context does not destroy the database needed for restart verification. This accommodates the existing JUnit 5/manual-context lifecycle; no developer localhost database is used.

Docker absence is a failing integration test, not a skip. Tests cover SQL filtering/keyset parity, customer isolation, real SQL CHECK failures after earlier writes, three concurrent execution races, durability, large Money, offset instants, startup failure and database-down health. No H2/SQLite substitution exists.

## Windows local workflow

From D:\BankProject, optionally copy .env.example to a root .env for Compose. Spring reads exported SPRING_DATASOURCE_* environment variables, not the .env file automatically. Defaults are local-development-only; use the same database/user/password on both sides if overriding.

```powershell
docker compose -f infra/compose/postgres.compose.yml up -d --wait
$env:JAVA_HOME = 'C:\path\to\jdk-21'
cd services/banking-core
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=local'
```

Flyway migrates before Hibernate validates during startup; no separate manual migration step is required. In another terminal:

If 8080 is occupied (as it was by the existing ShareLaTeX container during M15 verification), add `'-Dspring-boot.run.arguments=--server.port=18080'` to the Maven command and use port 18080 for the health request.

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

Health reports UP only while the database is available; details and credentials remain hidden. Customer runtime requests remain 401 without authentication. Successful business HTTP tests use Spring Security Test and CSRF headers.

Stop the application with Ctrl+C. Stop PostgreSQL without deleting its named volume:

```powershell
docker compose -f infra/compose/postgres.compose.yml stop
```

Restart with up -d --wait. To intentionally erase only this local project's banking database:

```powershell
# Destructive reset: deletes the aster-banking Compose project's database volume.
docker compose -f infra/compose/postgres.compose.yml down --volumes
docker compose -f infra/compose/postgres.compose.yml up -d --wait
```

The reset command is documentation only and is not part of validation. Do not use it for a database whose contents must be retained.

## Remaining work

No production authentication, frontend integration, TLS/secret deployment, backup/PITR, connection tuning or database operations runbook is claimed. No new business endpoint is added. Future scaling can narrow customer-level serialization while preserving intent/idempotency ordering and account locking.
