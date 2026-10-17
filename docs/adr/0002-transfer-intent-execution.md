# ADR 0002: Immutable transfer intent and trusted execution

- Status: Accepted
- Date: 2026-09-27
- Milestone: M4 Payments / Domestic Bank Transfer

## Context

Transfers are the first operation that changes Demo banking state. A form submission must not directly execute a payment. Users must review exact terms, while retries and changes in available funds must not cause duplicate or invalid debits. This boundary must also remain usable by future assisted workflows.

## Decision

1. **TransferIntent is immutable.** Preparation validates inputs and saves source/recipient snapshots, amount, fee, debit, projected funds, note and expiry. It makes no financial mutation. Only lifecycle status changes; the saved terms do not.
2. **The user reviews the exact intent.** Review loads the persisted intent resource rather than reconstructing it from form state. Editing creates a new intent.
3. **Execution references intentId + intentHash.** The hash binds the prepared terms. The execute schema rejects replacement financial parameters. A hash is not authentication or authorization.
4. **Execution is idempotent.** A required key maps the exact request to one completed receipt. Same request/key recovers that receipt; conflicting reuse is rejected. An executed intent cannot execute again under another key.
5. **Preconditions are revalidated immediately before mutation.** Existence, eligibility, currency, available balance, expiry, hash and prior execution are checked against current service state. Financial mutations, receipt, intent status and transaction insertion commit atomically.
6. **Future LLM/Agent tools may prepare an intent, but direct transfer execution must remain a trusted-runtime capability.** User confirmation must bind to the exact reviewed intent. An LLM must not decide that its own prepared transfer is authorized. Future authentication/authorization belongs at that trusted boundary; it is not simulated by the hash.
7. **All read models share banking state.** Overview and Accounts derive from the same current accounts and M3 transactions used by Payments. Ordinary transfers never count as consumption. No parallel payment-history ledger is created.

## M4 implementation and consequences

MSW delegates to a service and MockBankingStore. Synchronous validation and a single state replacement provide atomicity in one JS runtime; BigInt minor units preserve monetary precision. SessionStorage saves the complete snapshot before commit and retains same-tab receipts and idempotency records across reloads. An injectable clock makes expiration and mutation timestamps reproducible.

The extra prepare/review round trip is intentional. Projections can become stale; execution may reject a previously valid intent, and the UI must support a new preparation. Network errors do not prove failure, so retries preserve the key and exact request.

The browser simulator is not a security boundary, a database or a multi-process transaction coordinator. Future Banking Core implementation must provide durable atomic transactions, concurrent idempotency enforcement, authoritative time and access control. Agent access still follows ADR 0001 and never accesses the bank database directly. None of these future systems are introduced in M4.
