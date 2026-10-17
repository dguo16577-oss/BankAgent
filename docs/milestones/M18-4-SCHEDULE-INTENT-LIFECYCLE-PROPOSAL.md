# M18.4 schedule-intent cancellation: minimal contract and schema proposal

## Verified gap

Banking Core already persists scheduled payments and action intents. Its frozen API supports listing schedules, preparing `CREATE`/`AMEND`/`CANCEL` actions, reading an action intent, and confirming one with step-up authorization and idempotency. The schedule itself is executed by Banking Core at due time. However, `ScheduledPaymentService.status()` recognizes only `PREPARED`, `EXPIRED`, and `EXECUTED` for an action intent. There is no bank-side operation that revokes a still-prepared action intent. Dropping an Agent reference when the user changes amount, recipient, or date would leave the old intent confirmable until expiry, violating the required lifecycle invariant.

Banking Core also has an opt-in Spring polling worker for the existing due processor. That worker does not change the prepared-intent cancellation gap or the proposal below.

## Proposed compatible change (approval required)

1. Add an authenticated, CSRF-protected `POST /customer/scheduled-payment-intents/{intentId}/cancel` operation (`cancelScheduleActionIntent`) to the frozen Customer contract. Reuse the existing `CancelTransferIntentRequest` reason enum (`USER_CANCELLED`, `TASK_REVISED`, `TASK_FAILED`) and return the existing `ScheduleActionIntent` schema. It is owner- and session-bound, idempotent for an already cancelled intent, and does not cancel an already-created scheduled payment. A schedule cancellation remains the existing `CANCEL` schedule action with confirmation. Unknown/foreign intent is 404; already executed is 409; unauthenticated is 401.
2. Add a new Flyway migration after the current latest version. Add `status` (`PREPARED`, `CANCELLED`) and `cancelled_at` to `scheduled_payment_intents`, defaulting existing rows to `PREPARED`; preserve `result` and existing execution semantics. Use a row lock in cancel/confirm so exactly one terminal transition wins. `status()` gives `EXECUTED` for a committed result, otherwise `CANCELLED`, otherwise `EXPIRED` or `PREPARED` by the existing clock rule.
3. `ScheduleActionIntent.status` already references `TransferIntentStatus`, whose frozen enum includes `CANCELLED`. No status-enum change is needed. Regenerate operation types only; keep existing request/response fields and endpoint semantics intact. The Agent lifecycle adapter calls this bank operation before replacing or abandoning a prepared schedule action; if revocation fails, the runtime does not silently present a new confirmable intent.

## Verification after approval

- S01–S13 through the same Agent v2 loop, including offset-aware time validation and Banking Core due-time execution.
- Race tests for cancel versus confirm, repeat confirmation, insufficient funds at due time, schedule modify/cancel, and cross-customer/session isolation.
- Old confirmation fails immediately after a user revision; no financial effect occurs before the scheduled due time.
- Contract hashes are intentionally updated only with approved compatible changes, followed by full Spring/Agent/Web regression.

**Status (2026-10-08):** Approved in the M18 implementation plan and implemented through Customer contract revision 1.23.0 and Flyway V21. See [current checkpoint](m18-4-scheduled-transfer.md). The acceptance suite remains incomplete.

The independent Runtime timestamp validator is already implemented in `services/agent-runtime/app/agent_v2/schedule_time.py`. It validates an LLM-supplied ISO timestamp against an injected clock and policy horizon without interpreting natural language. Three unit tests cover timezone offsets, past times and horizon boundaries. It is intentionally not registered as a prepare tool until bank-side intent revocation is approved and implemented.
