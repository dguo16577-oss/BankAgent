# Durable Agent Runtime (R1)

## Boundary and storage

Agent v2 still uses DeepSeek → tool → observation → DeepSeek. The Python runtime owns orchestration, while Spring Banking Core owns ActionIntent state, confirmation rules, execution, and financial records. The model cannot call execution endpoints. R1 adds a separate PostgreSQL `agent_state` schema; it does not change Customer OpenAPI or banking tables.

Apply [`001_agent_state.sql`](../../services/agent-runtime/sql/001_agent_state.sql) explicitly before enabling `AGENT_STATE_ENABLED=1` and `AGENT_STATE_DATABASE_URL`. Startup checks for `agent_state.tasks` and fails if the schema is absent. The demo compose deployment runs this SQL in a one-shot migration container. A standalone deployment must run the SQL itself; runtime does not create tables.

| Table           | Purpose                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `tasks`         | JSONB checkpoint, customer and session binding, monotonically increasing `state_version`, lease owner/expiry |
| `chat_requests` | Per-customer, per-session request ID and request fingerprint, mapped to one task                             |
| `threads`       | Per-customer, per-session AG-UI thread mapped to the latest task                                             |

The checkpoint contains task/conversation IDs, original goal, conversation turns, structured ledger, observations, trace, pending tool, waiting ActionIntent reference, completed receipts, errors and revision. Session identity is a SHA-256 binding of the server session ID, not the cookie. Checkpoint serialization removes credential/authorization fields and masks API keys and unseparated 12–19 digit account numbers. Review new observation shapes before adding them to a checkpoint: this filter does not prove that every possible free-text secret is absent.

## State and recovery

The public task states are `RUNNING`, `WAITING_USER`, `WAITING_CONFIRMATION`, `WAITING_AUTH`, `BLOCKED_PROVIDER`, `SUCCEEDED`, `PARTIAL`, `FAILED`, and `CANCELLED`; legacy `BLOCKED` is exposed as a failure. An intent only changes the task to `WAITING_CONFIRMATION`; it is not evidence of execution. Successful Spring execution creates a receipt and a `confirmed_*` observation, after which the same task resumes its remaining goal.

The runtime checkpoints before tool invocation and after observation, before exposing a confirmation, and before sending a confirmed execution request. `state_version` compare-and-swap rejects stale writes. A persistent five-minute lease keeps one worker advancing a task; an expired lease may be taken over, but its previous owner can no longer save. These controls protect the Agent record. Spring's intent state, idempotency key and authorization rules remain the financial concurrency authority.

Recovery rules depend on the operation:

- An interrupted read may be replanned and repeated. Its earlier observation remains in the checkpoint only if the post-tool checkpoint committed.
- `prepare_transfer` reuses its stable bank request key and recovers the same intent. Other interrupted `prepare_*` calls stop as `PARTIAL` / `PREPARE_OUTCOME_UNKNOWN`; they are not blindly replayed.
- A confirmed execution sets `execution_uncertain` before the bank request. On retry the runtime first fetches the authoritative intent. An executed transfer can use the same key and authorization to retrieve the bank receipt without another debit. For other executed intent kinds lacking a receipt retrieval path, it stops as `PARTIAL` / `BANKING_RESULT_UNKNOWN` pending manual reconciliation.
- A provider 402 or 429 preserves the task as `BLOCKED_PROVIDER`; it does not retry a financial action or change provider. A timeout is classified according to the affected model, RAG or MCP phase.

Task and AG-UI thread lookup require both authenticated customer ID and the same session binding. A refreshed page can fetch the saved task and pending review; a new login session does not inherit the old binding automatically. Stopping an SSE generation is not a bank-side cancellation. The browser must call the explicit cancel path to revoke a pending ActionIntent.

## Deployment, rollback and limits

`AGENT_STATE_ENABLED` is opt-in outside the demo compose stack. Disabling it restores the previous in-memory behavior while leaving `agent_state` records intact; previously persisted tasks cannot be resumed through that mode. Do not drop the schema during rollback. Verify the bank's intent state before retrying a task created under a different deployment. The schema script is additive and isolated from Flyway-owned Banking Core tables.

The five-minute lease has no long-call heartbeat. A provider/tool call longer than the lease could permit a second worker to start; CAS rejects a stale checkpoint but only Spring-side idempotency prevents duplicate financial effects. Only transfer preparation and transfer execution have a fully exercised uncertain-result replay. Other financial paths fail closed and require reconciliation. A task tied to an expired Spring session cannot resume until the user reauthenticates; there is no cross-session recovery grant.
