# Intent understanding in the existing Agent loop (UX3)

2026-10-16 integrated update: interpretation includes current goal, status,
observed tool names and pending intent presence. NEW_QUERY, TASK_CONTINUATION
and CLARIFICATION extend the bounded kinds. Fresh queries clear stale scope
and replan. Pure presentation preserves financial terms. A pending-action
read query uses a separate read-only child Task/Ledger with a deterministic
PREPARE veto; its observations/query ledger merge into the original parent
without replacing the original financial goal, ledger or intent. Version and
lease checks remain enabled. Source implementation requires live acceptance.

UX4.5 adds model-based `interpret_follow_up` with a bounded four-kind output.
PRESENTATION_CHANGE updates only presentation preference, keeping ActionIntent,
terms, expiration, authorization and ledger intact. Financial modification still
cancels the old intent through Banking Core. Invalid interpretation preserves
the pending action. Unrelated queries during pending confirmation are currently
deferred rather than cancelling that action; this is a known same-task limit.
Four real provider classification cases passed, but updated images and full
browser/bank acceptance remain blocked by resources. See
[UX4.5 acceptance](../milestones/ux4-5-final-acceptance.md).

Status: structured model goal profile implemented; live accuracy has not been measured.

The existing DeepSeek `plan_subgoals()` call now requests an `intent` object together with the 1–8 step Task Ledger. It describes `domains`, `dialogue_act`, `assistance_preference`, `presentation_preference`, `service_ids` and `missing_slots`. Every enum/list member is validated against a bounded allowlist. The profile is saved on the existing durable Task and supplied to subsequent `Planner.decide()` calls. This is one Task Ledger, not a second task system or a keyword router. The LLM still chooses the next banking tool from the complete registry; Tool Registry validation and the observation loop remain intact.

The profile is advisory. Its presentation preference only chooses how to show bank-produced values. A `NAVIGATE` profile causes the runtime to reject any PREPARE call. Existing read-only request, dependency, policy, object ownership, ActionIntent, step-up, confirmation, revalidation and idempotency checks remain deterministic. Accepting Agent help sends a new turn and does not authorize a financial action. An explicit request such as “给张三转500” may enter the existing recipient-resolution and PREPARE path, followed by an independent confirmation.

`task.goal`, conversation, observations and ledger preserve the user's goal and references. A new turn after a succeeded task starts a new ledger and uses the latest turn as active goal, retaining prior conversation and observations. Existing Task Ledger dependency checks continue to govern multi-step work. Changes to a prepared financial action remain subject to the existing bank-side intent cancellation/invalidation paths; this UX change adds no new execution authority.

Known limit: `plan_subgoals()` is a single model call that may misclassify a vague or mixed request. The deterministic bank boundary fails closed, but intent-understanding accuracy and multi-goal completeness require the real-model UX01–UX16 acceptance run. The profile itself is not proof that a requested bank operation happened; only a trusted bank observation/receipt can complete a financial step.
