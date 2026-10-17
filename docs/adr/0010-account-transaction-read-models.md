# ADR 0010: Account and Transaction read domains

Status: Accepted — M13

## Decision

Account and Transaction are separate backend domains with domain/application/adapter layers. Generated OpenAPI DTOs remain HTTP-boundary-only. Application queries receive authenticated CustomerId values, never Spring Security objects. Ownership mismatch intentionally returns the same NOT_FOUND result as an unknown resource.

Money uses BigDecimal and Currency internally and exact decimal strings at the API boundary. Domain timestamps use OffsetDateTime; instant comparison defines ordering/date filters, while HTTP mapping retains explicit offsets.

Transactions use opaque keyset cursors with occurredAt DESC / id ASC continuation and query/customer/snapshot binding. Cursor is not an authorization credential. Signing, encryption and expiry are outside M13.

Account detail composes recent activity through TransactionReadPort. Transaction detail uses its own TransactionAccountPort to read the account domain value; configuration wires the port to AccountRepository. No AccountQueryService/TransactionQueryService cycle is introduced.

In-memory repositories are temporary adapters before PostgreSQL. Local/test data is immutable and deterministic; default profile is empty. Tests alone provide authentication and a second customer for ownership isolation. No runtime authentication bypass exists.

## Contract and generation consequences

Customer 1.9.0 and Public 1.2.0 remain unchanged. Customer interfaces are generated per operationId using the generator's built-in normalizer, allowing only four operations to be implemented without adding default methods to a large grouped interface. All 39 generated operation signatures remain verified against the original YAML. Public generation remains unchanged.

Search uses only title, merchant name and counterparty name because that is the frozen contract. Reference/description search is not silently added.

Only four Customer GET operations are IMPLEMENTED_IN_MEMORY; the remaining 35 and all 9 Public operations remain NOT_IMPLEMENTED. Frontend MSW and runtime trust boundaries are unchanged. Transfer mutation, persistence and real authentication are future milestones.
