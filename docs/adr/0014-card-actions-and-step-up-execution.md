# ADR 0014: Card actions and persistent Step-Up execution

Status: Accepted — M17

## Decision

Card actions use immutable ActionIntent review terms. Backend aggregate/application code determines risk from complete before/after state. Protective actions require confirmation only; risk-increasing actions require a short-lived, single-use, intent-bound ActionAuthorization.

Card execution consumes M16 authorization through its application port. Authorization consumption, its security event, Card mutation, receipt, intent lifecycle and idempotency completion share one PostgreSQL transaction and transaction manager.

Idempotency replay precedes single-use authorization rejection. The same successful request returns the original receipt after its authorization is consumed. The existing customer/operation/key-scoped idempotency table is extended for Card receipts rather than duplicated.

Database customer/intent/card/session/authorization locks and unique constraints protect concurrent requests. Customer mutation locks use FOR NO KEY UPDATE so security audit foreign-key checks do not form a customer/session lock cycle. The internal JPA version supplements the frozen Card business version without expanding the API.

Card persistence never stores full PAN/CVV/PIN. Domain, JPA entities and generated wire DTOs remain separate. Flyway V3 owns schema changes; V1/V2 and frozen OpenAPI remain unchanged.

## Consequences

Read/prepare cannot mutate financial state. A stale Card snapshot requires a fresh review. Full-context restart preserves mutated Card state, receipts, lifecycle, consumed grants and idempotent replay.

Generated oneOf request variants require a Jackson boundary module because the frozen generator emits an interface without a discriminator. The module selects the existing generated variants; strict request validation rejects unknown fields and type coercion. No contract edits or duplicate DTOs are needed.

The frontend continues to use MSW. CardDetail has no activity field in the frozen schema, so historical activity stays in the existing Transactions API. No additional Card network or unrelated banking capability is implemented.
