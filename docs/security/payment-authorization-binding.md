# B2 Payment authorization binding

New Transfer intents bind customer, current authenticated session, operation context, immutable financial terms, recipient ID/destination/state/version, and the backend authorization outcome. The canonical hash adds a versioned PAYMENT_CONTEXT_V2 section. A change in the execution payload cannot substitute a recipient: execution takes only the stored intent ID/hash and an optional existing ActionAuthorization ID.

Current policy is `PAYMENT_CONFIRMATION_V1` / `CONFIRMATION`. B1 did not approve numeric high-value or new-recipient time thresholds. B2 introduces none and does not claim the complete risk-escalation behavior family is supported. Creating a recipient does not authorize sending money.

Existing StepUpChallenge and ActionAuthorization accept `TRANSFER_INTENT` as well as the existing Card resource type. An explicitly provided payment grant must match the exact customer/session/resource type/resource ID/hash. It is validated and consumed in the same PostgreSQL transaction as debit, transaction, receipt, intent transition and idempotency. Wrong, expired, consumed or cross-session grants cannot authorize a new mutation. The session remains AAL1. Existing challenge attempt limits, two-minute grant expiry, persistent security events and unique logical authorization constraints are reused.

The ordinary Web flow uses the approved confirmation policy. It does not ask for an unnecessary security code or imply a risk policy exists. Optional grant support is groundwork for a later approved policy; it does not unlock an additional ordinary business capability.

Idempotent replay remains available within the originating session, including after the intent expires. Re-login creates another session and cannot execute/replay that session-bound command; the owner can still read its historical receipt. Pre-B2 unbound pending intents must be prepared again after upgrade; persisted historical receipts remain readable. This is a deliberate security boundary of the new development line.

Recipient deactivation and transfer execution share the customer write lock order. Recipient state is revalidated after locking. Authorization consumption and financial writes roll back together on failure. No authorization hashes, session IDs or internal versions are displayed on the recipient UI.
