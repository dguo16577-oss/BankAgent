# ADR 0021: Recipient management and payment authorization context

Status: Accepted for v1.1-dev / B2. Date: 2026-09-30.

Recipients are owned by Payments and scoped to the authenticated customer. Manual create/detail/deactivate workflows live in Payments. A synthetic destination is resolved by the server, displayed as UNVERIFIED, and unique within the owner. Deactivation preserves historical transfers, transactions and receipts.

Recipient mutations use immutable preparation, canonical hash, explicit confirmation and the existing shared idempotency infrastructure. PostgreSQL owner locking serializes recipient changes with transfer execution. Flyway owns additive schema changes.

Payment authorization binds the exact immutable intent, current session and recipient state. Existing StepUpChallenge and ActionAuthorization primitives support payment resources and atomic consumption; no separate security stack is introduced. The current confirmation requirement is preserved because B1 did not approve amount or time thresholds. Step-up never globally upgrades the session.

Scheduled payments, real destination verification, phone discovery, risk thresholds and Agent implementation remain deferred. M24 v1.0.0-demo contract evidence is archived unchanged; additive development is v1.1-dev, Customer 1.11.0. Public remains unchanged.
