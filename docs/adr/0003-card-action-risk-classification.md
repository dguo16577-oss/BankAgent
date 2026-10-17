# ADR 0003: Card action risk classification and authorization

- Status: Accepted
- Date: 2026-09-27
- Milestone: M5 Cards

## Context

Freezing a card reduces exposure; unfreezing restores payment capability. Controls have the same asymmetry. Treating every card change as an equivalent toggle would let a simple confirmation restore financial capabilities without the stronger authorization expected for that change. Future assisted workflows must not decide this policy in a model or UI.

## Decision

1. **Risk classification belongs to Banking Core**, represented by the Mock service in M5. React and any future LLM only display the returned RiskDirection and AuthorizationRequirement.
2. **Risk-reducing actions may require explicit confirmation.** M5 requires immutable intent preparation, exact Review and explicit confirmation for FREEZE and control ON → OFF, classified PROTECTIVE / CONFIRMATION.
3. **Risk-increasing card actions require step-up authentication.** UNFREEZE and any control OFF → ON are RISK_INCREASING / STEP_UP_AUTH. In a mixed request, any increasing change determines the requirement for the whole action.
4. **M5 must not simulate authorization success.** Increasing actions can be prepared and reviewed, but execution returns STEP_UP_AUTH_REQUIRED. No fake OTP/PIN or client bypass is provided. A later Security milestone must define authoritative verification and its binding to the exact intent.
5. **Card action terms are immutable.** The intent binds card snapshot, exact before/after state, version, classification and expiry with an intent hash. Execute accepts only intentId/hash plus Idempotency-Key. Only intent lifecycle status changes; card and transfer models remain distinct.
6. **Revalidate immediately before atomic mutation.** Current status, all controls and version must match before. Version protects against changes that restore the same visible values. A conflict returns CARD_STATE_CHANGED; it does not silently reinterpret the user's confirmation.
7. **Retry safely without changing financial history.** Same successful key/request returns the same receipt. Card action mutation never deletes pending authorizations, modifies historical transactions or changes account/spending/wealth values. It does not create a new transaction or simulate a merchant rejection.

## Consequences

The extra review step is deliberate. Protective actions are usable in M5; increasing actions visibly stop at an authorization requirement. A stale Review requires a new preparation. UI selection is only a draft and cannot optimistically mutate card controls.

The deterministic browser store provides synchronous atomicity and same-tab persistence for the demo. It is not a trusted authorization boundary or cross-process database. Production implementation must enforce policy, durable idempotency, concurrency and authentication in Banking Core/trusted runtime. Future agents may prepare intents but may not classify risk, approve themselves or directly bypass execution requirements. ADR 0001 and ADR 0002 remain in force.
