# Task ledger and completion verification (R1)

For a new goal, DeepSeek proposes up to eight subgoals. Each ledger entry has `step_id`, goal, kind (`READ`, `ANALYZE`, or `FINANCIAL_ACTION`), dependencies, evidence tool names, status, evidence references, and an observation floor for the current turn. The normal Agent tool loop remains dynamic: a ledger item does not select a tool or authorize a financial action.

[`update_ledger`](../../services/agent-runtime/app/agent_v2/completeness.py) checks successful tool observations from the current turn. A financial item requires a `confirmed_*` observation backed by a Spring receipt; a `prepare_*` observation is insufficient. A read or analysis item requires its declared evidence tool. DeepSeek then performs a separate semantic completion audit against the original goal, ledger and proposed final answer. If either check finds a gap, the runtime permits at most two bounded replans. An unresolved gap produces `PARTIAL` / `TASK_INCOMPLETE` with the missing goals named, rather than a false `SUCCEEDED`.

The ledger is a completion guard, not an independent verifier of whether an answer's prose is correct. For example, the four-domain test requires evidence from accounts, cards, spending and holdings; it does not independently recompute every number in the final message. Existing deterministic grounding checks still apply to analytical responses and knowledge citations. Banking facts are obtained from Spring; RAG passages remain untrusted evidence and cannot authorize a mutation.

## Conditional goals

The ledger recognizes `SKIPPED_CONDITION_FALSE`, but no trusted three-way condition evaluator currently sets that status. A request such as “if an active bank-managed debit exists, ask whether to cancel” may therefore remain pending when the condition is false or evidence is insufficient. Do not call conditional completeness finished. A later R1 acceptance pass needs tests for condition true, false and unknown, including a bank-state proof that no unauthorized cancellation occurred.

## Evidence and privacy

Observation references point to indexes in the task's saved observation list. `observation_floor` prevents a new user turn from satisfying a new subgoal using an older turn's analytical evidence. Confirmed financial receipts are kept in the task checkpoint. Tool outputs, transaction notes, merchant names, recipient nicknames and RAG text are treated as data even if they contain imperative instructions. The model's proposed ledger and answer never increase the user's financial capability.

Checkpoint text is redacted before PostgreSQL storage, but operational data minimization still depends on each tool's result schema. Developers should add a redaction test for every new sensitive observation field. No password, OTP, session cookie or API key should be logged or included in a model context.
