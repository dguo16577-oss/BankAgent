# ADR 0016 — Wealth suitability and atomic investment execution

- Status: Accepted
- Date: 2026-09-28
- Scope: M19, frozen Customer Wealth contract

## Decision

Suitability is enforced by the backend. It is compatibility evidence, not financial advice or a recommendation. An owned, current, unexpired persisted check is required before preparing an investment intent.

InvestmentOrderIntent is immutable and hash-bound. It snapshots the product, source account, suitability evidence and financial review terms. Execution revalidates current risk/product versions, availability, ownership, balances, fees and expiry; a changed account review requires a fresh intent.

Account debit, portfolio mutation, order creation, transaction creation, intent transition and idempotency completion are atomic under the existing PostgreSQL/JpaTransactionManager boundary. Idempotency replay precedes intent lifecycle validation.

Investment principal movement is not Spending. A purchase adds cost value and invested principal without creating performance gains. Fees are part of the account debit and transaction magnitude, not portfolio principal.

Generated API DTOs remain at the HTTP boundary. Wealth uses existing Account/Transaction application ports and exposes PortfolioQuery for future consumers. No Overview implementation is introduced.

## Persistence and concurrency

Flyway V5 adds products, customer risk profiles, positions, suitability checks, intents and orders. Products are shared reference data; only local/test seeds deterministic simulated products. Immutable persistence snapshots are explicitly versioned.

The existing customer row lock coordinates writes across domains. Product FOR SHARE and risk/account locks protect execution prerequisites. Unique owned product positions, optimistic position versions and one-order-per-intent constraints prevent duplicate/lost financial updates. Separate valid source accounts can concurrently add to one position; two stale reviews of the same account cannot both execute.

Portfolio totals are derived with BigDecimal from current-customer positions, without a redundant header table. Fixed demo monthly gains are preserved separately from capital contributions. This deliberately does not introduce live valuation or redemption.

## Consequences

AAL1 session + CSRF + explicit confirmation is sufficient under the frozen M7 semantics; no investment Step-Up is added. Foreign checks/intents/orders return NOT_FOUND. PostgreSQL state and replay survive application restart. Web continues on MSW. Future real product onboarding, market valuation, risk questionnaires and production brokerage require separate decisions.
