# Customer contract audit — M11

## Inventory and findings

The frozen Customer artifact contains 39 operations, 104 schemas and 66 machine error codes. All operations now have unique, stable operation IDs. Seven Spending/Recurring operations previously lacked IDs; they were assigned domain-specific names without renaming the existing 32 operations.

Session requirements previously existed only in MSW guards and 401 responses. Every operation now explicitly carries `x-session-required`; only login is false. Root `x-authentication` defines the logical session boundary. This is intentionally not a fictitious bearer/cookie scheme: the current simulator uses an internal session slot. Production credential transport and CSRF details remain a documented backend decision, not an implemented authentication feature.

All operations now describe the shared 500 error envelope used by handlers. Existing 4xx response supersets on domain groups remain permitted: not every documented business error is reachable for every GET. M11 corrects the stale AccountDetail description that claimed there was no global transaction API. All date-time schemas now enforce an explicit UTC offset pattern, including Security models.

## Money, time and identifiers

- `Money` is `{amount: decimal string, currency: CNY | USD}` with two fractional digits. Signed Money is needed for gain/loss and comparison changes. Transaction amount constrains Money to a non-negative magnitude, with CREDIT/DEBIT carrying direction. Transfer/investment input adds positive-amount validation.
- Arithmetic uses BigInt minor units in the simulator. Number conversions of money occur only in the two chart geometry adapters. Other Number conversions parse page size or persisted schema version, not money. Rate/percentage fields are decimal strings. Public fee strings describe terms; they are not executable monetary instructions.
- Timestamp means ISO 8601 with offset or Z; date means YYYY-MM-DD. `occurredAt` is the business occurrence, `bookedAt` is nullable for unposted activity, `createdAt/expiresAt` govern prepared resources, `completedAt/effectiveAt` describes effects, and `asOf` dates a read model. Their distinct names are retained.
- Entity identity is `id`; references use accountId, intentId, cardId, productId, recurringPaymentId, actionAuthorizationId, etc. `actionAuthorizationId` intentionally names the specific grant. These are opaque strings, even where deterministic fixtures use readable prefixes. Public route slugs are separate addressable content keys.

## Schema equivalence and reachability

See `schema-equivalence.json`. The identical IntentStatus enums and execution request shapes are retained under their domain names because the domains own different validation and lifecycles. TransferStatus and InvestmentOrderStatus currently have the same values but represent different aggregates. No GenericIntent is introduced.

`SecurityEvent` is not reachable from an HTTP response, but is used by the store, event writer and security tests. It is marked `x-internal-model` and retained; no audit-event endpoint is added. All other schemas are reachable from operations. Summary/Detail pairs and Overview projections are deliberate read-model distinctions, not accidental duplicate DTOs.

Required/nullable review found correct distinctions for pending bookedAt, optional merchant/counterparty, optional Overview sections, nullable stopped-recurring nextExpectedAt, nullable authorization consumedAt and zero-denominator percentage changes. No fields were made required merely to simplify components.

## Error and mutation review

See [error inventory](error-codes.md) and [mutation/security audit](security-and-mutations.md). The invalid step-up request for a confirmation-only action now uses INVALID_REQUEST/400 consistently with unsupported request input; business eligibility still uses 422. Public and Customer retain separate error enums and envelopes of the same shape.

Formal validation is Redocly structural/reference/operation lint plus the semantic freeze manifest. All references resolve. No URL namespace/version migration was added in M11. Artifact versions advance to Customer 1.9.0 and Public 1.2.0, preserving version history rather than resetting it.
