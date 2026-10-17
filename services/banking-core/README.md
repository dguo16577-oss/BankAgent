# Aster Banking Core — M23 Web Release Candidate Hardening

> **当前交接入口：** [Banking Core 交接 README](README.HANDOFF.md)。本文件保留 M23 Web 历史阶段说明，其中 39/48 operation 数量已不是当前合同数量；2026-10-11 合同为 Customer 87 / Public 9。

Independent modular monolith. All thirty-nine frozen Customer operations use PostgreSQL: nine existing banking operations, six Security operations, six Card operations, six Recurring operations, one derived Spending read API, ten Wealth operations and the cross-domain Overview read model. Card mutation, receipt, intent, authorization consumption and idempotency commit atomically. Flyway owns schema; Hibernate validates it. Account/Intent/Transfer/Transaction/idempotency changes commit in one database transaction. Authentication uses BCrypt and persistent Spring Session JDBC; Step-Up grants are single-use and session/resource-bound. Banking Backend API COMPLETE: Customer 39/39 + Public 9/9 = 48/48 frozen operations. Public Content owns ten separate PostgreSQL tables and anonymous deterministic search; it never reads Customer state. Overview uses one read-only REPEATABLE READ transaction and owns no persistent financial state. Web defaults to the real Spring backend; MSW is restricted to tests and explicit mock mode.

See [PostgreSQL workflow](../../docs/backend/postgresql-persistence.md), [Authentication and sessions](../../docs/backend/authentication-session.md), [Step-Up](../../docs/backend/step-up-authorization.md), and [Card domain](../../docs/backend/card-domain.md) and [Spending](../../docs/backend/spending-domain.md), [Recurring](../../docs/backend/recurring-payments-domain.md) and [Wealth](../../docs/backend/wealth-domain.md) and [Overview](../../docs/backend/overview-read-model.md) and [Public Content](../../docs/backend/public-content-domain.md) and [M21 report](../../docs/milestones/m21-report.md). Local/test seed demo credentials; default has no seed. Restart retains banking and security state. Explicit unit tests retain in-memory banking adapters; database failure never selects them automatically.

## Requirements and commands

- JDK **21**, enforced as `[21,22)`.
- Spring Boot **4.1.1**.
- Maven **3.9.11**, downloaded by Maven Wrapper **3.3.4**, with pinned SHA-256. No global Maven installation required.
- OpenAPI Generator **7.25.0**; JUnit Jupiter **5.13.4** explicitly overrides Boot's JUnit 6 default.

Spring 7's SpringExtension requires JUnit 6 APIs. To retain JUnit 5, web tests explicitly start/close the real Spring application on a random port and build MockMvc with the actual security chain; they do not use SpringExtension or `@SpringBootTest`.

Set `JAVA_HOME` to your JDK 21 installation, then in PowerShell:

```powershell
cd D:\BankProject\services\banking-core
# Docker must be running; clean verify includes real PostgreSQL Testcontainers tests.
.\mvnw.cmd clean verify
.\mvnw.cmd spotless:check
# Start the local database from the project root first:
# docker compose -f infra/compose/postgres.compose.yml up -d --wait
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=local' '-Dspring-boot.run.arguments=--server.port=18080'
```

Health: <http://localhost:18080/actuator/health>. Info: <http://localhost:18080/actuator/info>. Stop with Ctrl+C. First build needs network access for pinned dependencies. Unix users use `./mvnw`.

## Profiles

`application.yml`: port 8080, PostgreSQL configuration, Flyway and Hibernate validation, no allowed CORS origins, no health details, only health/info exposed. `local` supplies development-only database defaults, seeds once and allows exactly `http://localhost:3000`. The explicit `unit` profile excludes database configuration for fast tests; `integration` uses Testcontainers connection details. Tests inject a fixed Clock where required. `.env.example` is documentation, not automatically loaded by Spring.

`aster.web.allowed-origins` accepts explicit origins only; wildcards are rejected. Credentialed CORS does not authenticate anyone. M22 integrated Next.js with real Cookie/CSRF APIs. M23 adds availability handling before MVC, cancellation-aware logging, full mutation CSRF coverage and expanded query-count tests.

## Generation and package boundaries

Maven `generate-sources` reads `../../contracts/openapi/customer.yaml` and `../../contracts/openapi/public.yaml` directly. Two Spring generator executions enable `useSpringBoot4`, `interfaceOnly`, and `skipDefaultInterface`; supporting files, generated tests and docs are disabled. APIs have abstract methods without default implementations. Customer interfaces are grouped by operationId with the built-in normalizer; AccountController, TransactionController, PaymentController, SecurityController, CardController, RecurringController, SpendingController, WealthController and OverviewController implement exactly thirty-nine generated operations.

Ignored output:

```text
target/generated-sources/openapi/customer/src/main/java/com/asterbank/contract/customer/{api,model}
target/generated-sources/openapi/public/src/main/java/com/asterbank/contract/publicapi/{api,model}
```

Compiled interface HTTP methods, paths and operation IDs are compared against the specifications and counts against `freeze.json`: **39 Customer + 9 Public operations**.

`com.asterbank.banking` owns application code. Account, Transaction, Payment, Security, Card, Recurring, Spending and Wealth have domain/application/adapter layers. ArchUnit forbids domain/application dependencies on generated contracts, adapters, Spring Web/Security, JPA and Hibernate. Generated DTO mapping remains in web boundaries; persistence entities remain in adapter.persistence.

## Security

- Health/info and `/public/**` permit anonymous requests.
- `/customer/**` requires authentication except the frozen login endpoint; no default generated user exists.
- Everything else is denied. No HTML login, Basic login, logout handler or identity-header bypass.
- Anonymous Customer GETs return generated `ApiError`: 401 / `UNAUTHENTICATED`.
- CSRF protects login and all authenticated mutations. GET session bootstraps XSRF-TOKEN even on 401; mutations echo X-XSRF-TOKEN. Anonymous Transfer POSTs return 401.
- Spring Session JDBC persists the authenticated context. Cookies are HttpOnly/SameSite=Lax/Secure for SESSION, with a local-only Secure exception. MSW sessions are not recognized.
- Framework/security failures outside implemented operations use generic Problem Details. Unexpected Customer/Public failures use generated surface-specific errors.

See [foundation](../../docs/backend/spring-foundation.md), [logging](../../docs/backend/logging.md), [ADR 0009](../../docs/adr/0009-spring-banking-core-foundation.md).
