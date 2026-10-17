# ADR 0009: Spring Banking Core foundation

Status: Accepted — M12

## Context

M11 froze Customer 1.9.0 and Public 1.2.0. Backend domain slices need an independently testable foundation.

## Decision

Banking Core starts as a Java 21 / Spring Boot 4.1.1 modular monolith organized by domain under `com.asterbank.banking`. Maven Wrapper provides a reproducible build. No microservice split is introduced.

OpenAPI contracts remain source of truth. Maven generates abstract API interfaces and boundary models directly from frozen YAML into ignored target output. Generated `com.asterbank.contract.*` classes belong at HTTP adapters. Domain/application code must not depend on them; ArchUnit enforces this. Future mappers convert domain values at adapters.

Customer Web and future Mobile share Customer API. Public API remains an unauthenticated information surface, separate from owned financial assets. Customer API fails closed until backend authentication exists. CSRF stays enabled and CORS origins are explicit.

PostgreSQL, persistence, business endpoints, MSW replacement and Agent are deferred. All 39 Customer endpoints remain NOT_IMPLEMENTED. Next.js continues to use MSW.

## Consequences

Generation, compilation, freeze checks, security tests and architecture checks provide the acceptance baseline for later vertical slices. Only health/info infrastructure endpoints are implemented. Empty domain/application architecture checks are intentional. Session transport and durable atomic/idempotent execution need later backend implementation.
