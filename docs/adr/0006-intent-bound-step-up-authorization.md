# ADR 0006 — Intent-bound step-up authorization

Status: Accepted (M8)

## Decision

Authentication and action authorization are separate. Banking domain services decide authorizationRequirement; React only presents the required workflow.

Step-up authorization is intent-bound, short-lived and single-use. Sensitive execution must bind authorization to the immutable intentId + intentHash, resource type and creating session. AAL2 alone does not authorize arbitrary actions. Verification never reconstructs a draft; the original reviewed intent remains authoritative.

Challenges last at most five minutes with three attempts; successful verification issues a two-minute action authorization. Card state validation and grant consumption happen atomically with the mutation and receipt. Session validation precedes execution, while exact idempotency replay precedes consumed-grant validation. Request identity includes authorization ID.

Protective card actions continue to use confirmation. Existing transfer, recurring and investment authorization policies remain unchanged.

A future Agent cannot create or bypass trusted user authorization. Agent orchestration may prepare proposals through Banking APIs; any required trusted confirmation must bind to the exact immutable action through the user authorization channel. The Agent must never access the banking database directly.

## Consequences

A successful security-code entry grants permission for one concrete action; it does not elevate the whole application. Changes to card state, intent terms or session invalidate use of an otherwise successful verification. Network retries can safely recover the original receipt without repeating mutation or authorization consumption.

M8 implements these semantics in the local simulator. Browser storage, fixed local credentials and the deterministic code are not a production security mechanism. Real authentication transport, trusted backend enforcement, distributed atomic persistence, rate limiting and stronger authentication methods require a later approved milestone.
