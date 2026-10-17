# ADR 0011 — Transfer Intent and atomic execution

Status: Accepted for M14

## Decision

Transfer follows prepare → immutable Intent review → explicit execute. Generated OpenAPI DTOs remain HTTP-boundary-only. Account, Transaction and Transfer have separate domain models and application ports.

Intent terms are hash-bound with a versioned, length-prefixed canonical representation and SHA-256. Execution accepts the saved intent reference/hash and never trusts resubmitted business terms. It revalidates current customer ownership, expiry, eligibility, recipient/source identity fields and available funds.

Idempotency is scoped by customer, operation and key. Completed-result lookup precedes executable-state validation so retries can return the original result after the Intent has executed or expired.

Account debit, Intent lifecycle, Transfer, Transaction and idempotency completion commit atomically. The in-memory adapter uses one shared ReentrantLock and immutable repository checkpoints. A failed execution restores every affected repository before releasing the lock. Readers use the same lock, including related Account/Transaction query projections.

## Reasons and consequences

A lock per repository cannot protect a cross-domain mutation. The demo's small dataset allows one mutation/read lock without complex lock ordering. Immutable domain values preserve prepared snapshots and make rollback checkpoints safe.

Account owns debit invariants; application services orchestrate repository ports. Payment maintains no duplicate account balances or transaction list. Test subclasses inject storage failures without a production failure API.

Local time uses the existing injected Clock; deterministic tests control it. Intent validity ends at now >= expiresAt. Balance-only changes recheck affordability rather than invalidating every Intent.

Current state is process-local and not crash-durable. PostgreSQL work will replace the adapter critical section with Spring transaction semantics, durable idempotency and uniqueness constraints, and database locking. The application/domain contract remains the same. No generic UnitOfWork framework is introduced.

## Scope

Only the five frozen Transfer/Recipient operations are added. Frontend remains MSW; frozen Customer/Public contracts, real authentication and other backend domains are unchanged.
