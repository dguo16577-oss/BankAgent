# ADR 0004: Bank-side recurring payment management

Status: Accepted · M6

## Decision

Aster Bank manages bank-side future payment authorization and scheduling. It does not claim to terminate an external merchant or service contract. The UI must state this in detail, review and receipt.

`STOP_FUTURE_PAYMENTS` is a protective mutation requiring explicit confirmation of an immutable intent. Existing idempotency, expiry, state revalidation and atomic store commit conventions apply. No STEP_UP_AUTH is required for this action. No reactivation or modification operation is part of M6.

Historical transactions are immutable under this action. Stopping future payments changes the recurring instruction and its upcoming-payment projection only; it never changes account balances, holds, card controls, historical spending or wealth.

Detection provenance is separate from bank-managed mandates. Deterministic matched Transaction IDs and observation dates support a detected pattern. Only the banking service decides capability; a detected-only pattern cannot be stopped through the bank UI.

## Consequences

The shared mock store owns recurring instructions, action intents and receipts. Overview derives future recurring payments from this state. Banking Analytics derives completed spending from Transaction Domain with an explicit eligibility policy. Future backends must preserve these boundaries and provide real authorization, scheduling and persistence separately. External-service contract cancellation remains outside this banking action.
