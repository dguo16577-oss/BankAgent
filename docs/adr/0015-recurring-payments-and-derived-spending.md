# ADR 0015: Recurring payments and derived Spending

Status: Accepted — M18

## Decision

Spending is derived from authoritative Transaction data. PostgreSQL filters and aggregates completed debit consumption records; no second source-of-truth table or permanent total cache is created. Reporting uses explicit offset windows and UTC+08 calendar semantics, with NUMERIC/BigDecimal arithmetic.

Recurring future state and historical financial activity are separate concepts. Stopping future recurring payments does not rewrite historical transactions, balances or analytics. STOP_FUTURE_PAYMENTS expresses a bank-side restriction/mandate revocation/schedule cancellation and does not claim to terminate external merchant contracts.

Detected recurring patterns may be informational and non-manageable. Bookshop is a deterministic fixture with machine-readable historical provenance, not an implemented detection engine.

Recurring mutations use immutable domain intents, existing canonical hash primitives and persistent customer/operation/key-scoped idempotency. Stop is protective confirmation-only; authenticated Session and CSRF remain required. No fake Step-Up authorization is issued or consumed.

Mutation, receipt, Intent lifecycle and idempotency commit atomically in PostgreSQL. Replay precedes stopped/expired-state rejection. Historical Transaction links use owned foreign keys and an application read port.

## Consequences

Flyway V4 owns new Recurring tables and extends the existing idempotency receipt constraint. V1–V3 and frozen OpenAPI are unchanged. Banking state survives application restart and seed does not overwrite it.

Analytics responds to Transaction changes but ignores future recurring state. Reporting asOf advances with Clock; fixed historical aggregate comparisons use explicit windows.

No scheduler, external merchant cancellation, rule/ML detection, Wealth/Public backend or frontend-to-Spring migration is included.
