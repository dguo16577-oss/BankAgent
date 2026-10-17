# ADR 0017 — Customer Overview as a cross-domain read model

- Status: Accepted
- Date: 2026-09-28
- Scope: M20, frozen GET /customer/overview

## Decision

Customer Overview is a cross-domain read model. It owns no independent financial state. It depends on application-level read capabilities, not persistence adapters. Financial rules remain owned by Account, Transaction, Spending, Card, Recurring and Wealth.

Every request uses one authenticated CustomerId. Generated API DTOs remain at the Web boundary. The user display context comes from the existing customer record.

Overview reflects committed mutations on the next request. A single PostgreSQL read-only REPEATABLE READ transaction provides one database snapshot across all participating queries. READ COMMITTED would allow mixed before/after fragments across separate SELECTs; the monolith's single database lets us prevent this without distributed infrastructure. Existing source-domain write isolation is unchanged.

The production composition root reuses the existing DatabaseScope read boundary via AccountRepository. All nested queries join the same JpaTransactionManager transaction. asOf is Clock-based construction time, while FX retains its separate provenance timestamp.

No cache, overview table, materialized projection, new migration, Redis or message bus is introduced.

## Query strategy

Reuse existing Account total/FX, Transaction ordering, Card summary and Portfolio totals. Spending owns a small monthly aggregate port sharing the exact existing eligibility predicate. Recurring owns a small upcoming projection with bank-managed ACTIVE/future semantics and database order/limit. These avoid six full analytics requests and per-item recurring history reads.

Only backed recurring schedules appear in upcoming. The frozen CARD_BILL enum does not require manufacturing a bill where no backend billing source exists. There is no new financial product or bill calculation.

Failures are whole-response errors. Empty collections are valid; missing risk assessment does not block Portfolio reads.

## Consequences

Cross-domain parity, simultaneous investment/snapshot behavior and constant SQL count are PostgreSQL integration requirements. Architecture tests prevent reverse dependencies and persistence access from Overview application code. Customer closure is verified against both the frozen manifest and live Spring handler mappings.

M20 completes 39/39 Customer operations. Public remains 0/9 and the frontend remains MSW. No M21 scope is started.
