# ADR 0012 — PostgreSQL persistence and transaction boundary

Status: Accepted for M15

PostgreSQL is the durable source of banking state for non-test runtime. Flyway owns schema and Hibernate validates it. Local startup cannot silently fall back to in-memory storage.

Feature-local JPA entities and persistence mappers implement existing application ports; domain and application remain independent of Jakarta Persistence, Spring Data JPA and Hibernate. In-memory adapters remain for explicit fast tests.

PostgreSqlTransferExecutionBoundary uses Spring TransactionTemplate in the adapter. Account, Transaction, Intent, Transfer and completed idempotency records commit or roll back together. JVM-wide locks are absent from this path.

The database locks the owned customer row before idempotency lookup and takes source-account/Intent row locks during execution. This deliberately serializes mutations per customer in the current small banking workload. READ COMMITTED permits a waiting replay to observe the prior commit; repeatable-read scopes keep read projections and pagination revisions coherent.

Unique constraints protect Intent execution and idempotency scope, and composite ownership foreign keys prevent invalid cross-customer references. No database trigger orchestrates business operations.

Money is BigDecimal / NUMERIC(24,2) / decimal-string JSON. Business times use TIMESTAMPTZ with UTC JDBC configuration; new command timestamps use PostgreSQL-compatible microsecond precision. Intent/receipt snapshots are versioned JSONB documents alongside typed critical fields.

Local demo initialization is transactional, seed-versioned and separate from production schema migrations. Restart preserves mutations and idempotent receipts.

Real Testcontainers PostgreSQL tests are mandatory in clean verify, including empty-schema migration, parity, rollback, concurrency and Spring-context reconstruction. Docker absence fails validation; it does not skip tests.

Frontend remains MSW, existing authentication remains fail closed, and no additional domain endpoint is introduced.
