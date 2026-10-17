# M16 — Persistent Security / Authentication / Session / Step-Up

## Result and scope

M16 implements the six frozen Security operations with PostgreSQL persistence and actual HTTP cookie authentication. The existing nine banking operations remain implemented. Next.js continues to use MSW; no Card, Recurring, Wealth, Public, Agent or external identity-provider backend was added.

## 1. Security endpoints implemented

| Method | Frozen operation      | Endpoint                                               | Status                 |
| ------ | --------------------- | ------------------------------------------------------ | ---------------------- |
| POST   | login                 | /customer/auth/login                                   | IMPLEMENTED_POSTGRESQL |
| POST   | logout                | /customer/auth/logout                                  | IMPLEMENTED_POSTGRESQL |
| GET    | getSession            | /customer/session                                      | IMPLEMENTED_POSTGRESQL |
| POST   | createStepUpChallenge | /customer/auth/step-up-challenges                      | IMPLEMENTED_POSTGRESQL |
| GET    | getStepUpChallenge    | /customer/auth/step-up-challenges/{challengeId}        | IMPLEMENTED_POSTGRESQL |
| POST   | verifyStepUpChallenge | /customer/auth/step-up-challenges/{challengeId}/verify | IMPLEMENTED_POSTGRESQL |

Generated interfaces were used directly. No endpoint or duplicate wire DTO was introduced.

## 2–10. Authentication and session architecture

2. Credentials pass through AuthenticationManager / DaoAuthenticationProvider into Spring Security Authentication, then a persisted SecurityContext. Applications receive CustomerId through the existing boundary.
3. PasswordEncoder uses BCrypt cost 12. Only local/test seeds Alex; hashes alone enter customer_credentials. Incorrect password and unknown email have identical 401 INVALID_CREDENTIALS responses.
4. Spring Session JDBC 4.1.1 implements server-side sessions. No browser token, identity header or runtime in-memory session store is used.
5. Spring Session tables preserve sessions across complete application-context reconstruction. security_sessions retains ACTIVE/EXPIRED/REVOKED lifecycle and Clock-based absolute expiry. Session timeout defaults to one hour and configures the transport idle timeout too.
6. SESSION is HttpOnly, SameSite=Lax, Path=/, host-only, Secure by default, with browser-session lifetime. Only local HTTP sets Secure=false. Login uses Spring's session-ID rotation.
7. CSRF stays enabled, including login. Anonymous GET session retains frozen 401 semantics and sets XSRF-TOKEN; POST echoes X-XSRF-TOKEN. Bootstrap again after login. CSRF cookie is JS-readable; session cookie is not.
8. Credentialed CORS permits exactly http://localhost:3000 locally. Default configuration permits no origin. Unapproved origins are rejected.
9. CustomerPrincipal is a lightweight serializable customer ID/display-name record. No credential or JPA entity is serialized.
10. CurrentCustomerProvider reads the authenticated principal. Existing Account/Transaction/Transfer application logic was not rewritten. Legacy unit/integration tests may still use Spring Security Test identities.

## 11–14. Step-Up, authorization and events

11. StepUpChallenge persists PENDING/VERIFIED/FAILED/EXPIRED/CANCELLED. Lifetime is five minutes, inclusive expiry boundary, with three failed attempts. Local/test deterministic code uses a BCrypt verifier and is not persisted as plaintext.
12. ActionAuthorization persists AAL2, ACTIVE/CONSUMED/EXPIRED/REVOKED, issued/expiry/consumption times and its source challenge. Lifetime is two minutes; consumption is single-use.
13. Customer, session, resource type, resource ID and hash must all match exactly. A second browser cannot reuse a grant. A new verified challenge supersedes a previous active grant for the same session/resource. Step-Up never upgrades the session from AAL1.
14. Eight frozen SecurityEvent types are supported, including consumption. Events contain identifiers, timestamp, correlation ID and outcome, without credentials, password hash, code or full PAN.

Card resource binding is checked syntactically only. There is no fake Card database entity. Future Card execution must validate the actual immutable intent and consume authorization inside the same transaction.

## 15–16. Database migrations, constraints and indexes

15. Added V2__security_and_sessions.sql. V1 was not changed. Tables: customer_credentials, spring_session, spring_session_attributes, security_sessions, step_up_challenges, action_authorizations, security_events. Flyway owns schema; session auto-initialization is disabled and Hibernate remains validate-only.
16. PK/FK/UNIQUE/NOT NULL/CHECK constraints protect ownership, composite session/resource binding, one authorization per challenge, attempt/lifetime/status consistency and consumedAt. A partial unique index permits one ACTIVE authorization per session/resource. Additional indexes serve Spring Session cleanup/principal lookups, session owner/status, challenge session/status/expiry and customer event time. No triggers or JVM global locks orchestrate security.

## 17–18. Concurrency and banking integration

17. Two simultaneous correct verifications against Testcontainers PostgreSQL produce one VERIFIED transition and one authorization; the second request is rejected. Tests also prove single use and rollback of consumption plus audit event when the caller's transaction fails.
18. Actual HTTP login/cookies enable Accounts, Transactions and Recipients. Anonymous access is 401. Alex and another customer see only their own data. A real Transfer intent POST without CSRF is 403; valid CSRF reaches the existing business implementation and returns 201. Existing banking tests remain passing.

## 19. Local real HTTP smoke test

PostgreSQL Compose and the packaged Banking Core local profile were started on localhost:18080. Executed [security-smoke.ps1](../backend/security-smoke.ps1):

| Step                                        | Actual HTTP result |
| ------------------------------------------- | ------------------ |
| Anonymous GET session / CSRF bootstrap      | 401                |
| POST login                                  | 200                |
| Authenticated GET session                   | 200, AAL1          |
| GET accounts                                | 200                |
| GET transactions                            | 200                |
| GET recipients                              | 200                |
| POST transfer-intents without CSRF          | 403                |
| POST transfer-intents with session and CSRF | 201                |
| POST logout                                 | 200                |
| Old SESSION cookie → GET accounts           | 401                |

No transfer was executed. One small demo transfer intent was prepared; balances were not changed. Smoke output contains no cookie, password, code or hash.

After verification, the temporary Banking Core process and this project's PostgreSQL container were stopped to release memory. The named database volume and persisted state were retained; unrelated containers were not changed.

## 20. Maven result

Java 21 / Spring Boot 4.1.1, Spring Security 7.1.1, Spring Session JDBC 4.1.1, PostgreSQL 17.11 through Testcontainers.

`mvnw.cmd clean verify`: **BUILD SUCCESS**, 199 tests, zero failures/errors/skips:

- 150 existing unit/web/architecture tests.
- 19 existing PostgreSQL integration tests.
- 30 new Security PostgreSQL/real HTTP integration cases.

Spotless check passed. ArchUnit additionally forbids Servlet and Spring Session dependencies in domain/application. Testing covers session fixation/logout/expiry/reconstruction, cookie attributes, default/local profiles, CSRF/CORS, identity isolation, all authorization bindings, challenges, concurrency, transaction rollback and secret leakage in responses/events/serialized sessions/captured logs.

Memory-limited command used:

```powershell
$env:MAVEN_OPTS='-Xms32m -Xmx384m -XX:+UseSerialGC -XX:ActiveProcessorCount=2'
.\mvnw.cmd -B spotless:apply clean verify '-DargLine=-Xms32m -Xmx320m -XX:+UseSerialGC -XX:ActiveProcessorCount=2'
```

## 21. Frontend regression

- pnpm lint: passed.
- pnpm typecheck: passed; generated API types still match frozen contracts.
- pnpm test: passed, 359 Vitest tests across 24 files plus 3 contract-hash tests.

No apps/web business behavior or default API runtime was changed. Build/Playwright were not required by M16.

## 22. Contract hashes

Initial and final pnpm contract:check both passed. customer.yaml, public.yaml and freeze.json were not edited; both frozen hashes are unchanged.

Frozen canonical SHA-256 (the repository's semantic hash, not raw YAML file bytes):

- Customer 1.9.0: `602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`
- Public 1.2.0: `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

## 23. Implementation matrix

Manifest: 39 Customer + 9 Public operations. Customer now has **15 IMPLEMENTED_POSTGRESQL / 24 NOT_IMPLEMENTED**; Public remains **0 / 9**. Overall: 15 implemented, 33 remaining.

See [implementation matrix](../backend/implementation-matrix.md) and its JSON status source.

## 24. Known limitations

- Frozen Session.mode remains SIMULATED_AUTH even though backend session authentication is persistent; the schema does not offer another value.
- No frontend-to-Spring switch, production identity lifecycle, password reset, login abuse controls or external authentication methods.
- Card intent existence/state is intentionally not checked until a Card backend exists. No security endpoint executes a Card action.
- Session serialization survives compatible application restarts; incompatible class upgrades need a deployment/session migration policy.
- Lifecycle/audit retention, TLS deployment, database backups and operational hardening remain future work.
- Expired transport cookies whose Spring Session row has been deleted return UNAUTHENTICATED; loaded absolute-expiry sessions return SESSION_EXPIRED. Both fail closed with 401.
- No screenshot is required for this backend-only milestone.

## Changed file groups

- New security/domain, security/application, security/adapter/persistence, security/adapter/security and security/adapter/web packages.
- Backend pom.xml, application.yml/application-local.yml, V2 migration, shared SecurityConfiguration/CurrentCustomerProvider.
- SecurityPostgreSqlIT, ArchitectureTest and the existing PostgreSqlIT migration/startup assertions.
- Authentication/Step-Up docs, smoke script, ADR 0013, implementation status/matrix, root/backend READMEs and this report.

## 25. Stop at M16

M16 stops here. No M17 Card backend or other new domain implementation has been started.
