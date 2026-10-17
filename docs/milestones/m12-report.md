# M12 — Spring Boot Banking Core Foundation

## Scope and versions

Independent foundation only. Java 21 (verified using Temurin 21.0.12.1), Spring Boot 4.1.1, Maven 3.9.11, Maven Wrapper 3.3.4, OpenAPI Generator 7.25.0. No Customer/Public business operation, persistence, frontend integration or Agent was implemented.

Runtime starters: web, validation, actuator, security; SnakeYAML loads application YAML. Tests: starter-test, spring-security-test, JUnit 5.13.4, AssertJ, MockMvc, ArchUnit 1.4.1; manifest tests also use SnakeYAML. Build: Enforcer 3.6.2, Spotless 3.0.0 / Google Java Format 1.28.0. Hibernate Validator is a validation dependency, not Hibernate ORM or persistence.

## Backend directory tree

```text
services/banking-core/
├── .env.example
├── .mvn/wrapper/maven-wrapper.properties
├── mvnw
├── mvnw.cmd
├── pom.xml
├── README.md
├── src/main/java/com/asterbank/banking/
│   ├── BankingCoreApplication.java
│   ├── shared/
│   │   ├── config/WebProperties.java
│   │   ├── security/SecurityConfiguration.java
│   │   ├── time/ClockConfiguration.java
│   │   └── web/{CorrelationIdFilter,UnexpectedExceptionAdvice}.java
│   ├── customer/{account,transaction,payment,card,spending,recurring,wealth,security}/
│   │   └── package-info.java (each package; no business classes)
│   └── publiccontent/package-info.java
├── src/main/resources/
│   ├── application.yml
│   ├── application-local.yml
│   └── application-test.yml
├── src/test/java/com/asterbank/banking/
│   ├── ArchitectureTest.java
│   ├── ClockConfigurationTest.java
│   ├── CorrelationIdFilterTest.java
│   ├── FoundationTestContext.java
│   ├── FoundationWebTest.java
│   ├── GeneratedContractTest.java
│   ├── GeneratedBoundaryValidationTest.java
│   └── LocalCorsTest.java
└── target/ (generated, ignored)
    └── generated-sources/openapi/{customer,public}/src/main/java/...
```

## Contract generation and architecture

Two Maven executions read the unchanged root YAML files directly. Spring server generation uses `useSpringBoot4=true`, `interfaceOnly=true`, `skipDefaultInterface=true`. Only boundary models and abstract interfaces are generated; no Controller implementations, copied specifications or hand-written equivalent DTOs.

Generated operation counts: **Customer 39, Public 9**. Tests compare compiled method/verb/path/operationId sets to the original YAML and counts to freeze.json, rather than maintaining a second endpoint list. All generated Java compiles.

ArchUnit prevents `..domain..` and `..application..` from depending on `com.asterbank.contract..`. Empty matches are intentional until domain slices exist. A separate rule forbids no-argument `now()` for Instant/OffsetDateTime/LocalDateTime. Both rules pass.

## Runtime foundation

- `/actuator/health`, `/actuator/info`, `/public/**`: anonymous allowed.
- `/customer/**`: authenticated; no authentication mechanism or default generated user exists yet.
- Other endpoints: denied. No Spring HTML login or Basic authentication.
- CSRF: enabled. Unsafe anonymous requests without tokens receive 403; anonymous Customer GETs receive JSON 401.
- CORS: local profile alone allows `http://localhost:3000`, with explicit headers/methods and credentials. Default/test allow no origins; unapproved origins are rejected.
- Clock: injected UTC system Clock, with deterministic fixed-clock override tested.
- Correlation: validated 1–64 character header or generated UUID; response header and MDC, cleaned in finally.
- Logging: UTC timestamp, level, logger, correlationId, safe message. Unexpected failures do not log arbitrary exception text or return secrets/stack traces.
- Errors: generated Customer/Public envelopes for unexpected 500s; generic sanitized framework errors retain their status.
- Actuator: only health/info exposed, without sensitive health details.

## Compatibility finding

Spring 7's SpringExtension uses a JUnit 6 Store method absent in requested JUnit 5.13.4. Tests preserve JUnit 5 and explicitly manage SpringApplication lifecycle on random ports, then use MockMvc with the real security chain. No runtime version or frozen contract was changed. Test contexts shut down after their suites.

Generator default time mapping places `@Pattern` on OffsetDateTime, which Jakarta validation cannot handle. The generation configuration maps wire timestamps to String; regression tests check offset validation and nullable bookedAt. Future mappers convert to domain time types. A Money composition warning was investigated: tests confirm transaction amounts retain their non-negative constraint. SnakeYAML is kept at runtime scope so the standalone service can load YAML, not only the test classpath.

## Validation

| Command / check                                             | Result                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| pnpm contract:check (before and after)                      | PASS — both frozen contracts unchanged                                                          |
| pnpm lint                                                   | PASS — ESLint and formatting                                                                    |
| pnpm typecheck                                              | PASS — generated TS current, strict TypeScript                                                  |
| pnpm test                                                   | PASS — 359 Vitest/RTL + 3 semantic freeze tests                                                 |
| .\mvnw.cmd clean verify                                     | BUILD SUCCESS — 31 tests, no failures/errors/skips; generated Java compiles and Spotless passes |
| JDK 22 negative validation                                  | Correctly rejected by Enforcer with the JDK 21 requirement                                      |
| .\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=local | Started on port 8080; stopped after HTTP verification                                           |

Live HTTP results: health 200 / UP with no sensitive details; info 200; `/public/non-existent` 404; `/customer/non-existent` 401 / UNAUTHENTICATED; `/login` 401 JSON, no HTML login. `X-Correlation-Id: m12-live-health` was returned on all probe responses. Backend is stopped after verification.

## Contract freeze

Customer contract hash unchanged — revision **1.9.0**:

`602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`

Public contract hash unchanged — revision **1.2.0**:

`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

No YAML or freeze.json modification. `audit.mjs` preserves the new foundation section when regenerating the existing endpoint matrix.

## Implementation matrix and deferred work

[Matrix](../backend/implementation-matrix.md): runtime/generation IMPLEMENTED; security FOUNDATION; persistence and all Customer/Public business endpoints NOT_IMPLEMENTED.

Future work: account/transaction domain slices, real Customer session + CSRF lifecycle, database transactions/idempotency, Public content backend, MSW replacement and Agent. M12 makes no claim of production banking authorization or durable execution. Frontend business code and MSW are unchanged.

## Local run

Set JAVA_HOME to JDK 21, then:

```powershell
cd D:\BankProject\services\banking-core
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=local'
```

Visit <http://localhost:8080/actuator/health>. Stop using Ctrl+C.

Documentation: [service README](../../services/banking-core/README.md), [foundation](../backend/spring-foundation.md), [logging](../backend/logging.md), [ADR 0009](../adr/0009-spring-banking-core-foundation.md).

**Stop at M12. Do not enter M13.**
