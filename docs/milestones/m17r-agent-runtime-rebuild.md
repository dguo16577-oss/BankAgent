# M17R — Agent Runtime Rebuild acceptance

Date: 2026-10-07. **M17R STATUS: PASS for the bounded Smart Transfer foundation and final cleanup.** This is an architecture and sandbox acceptance result, not a claim that phone, historical-note, scheduled, or AA transfers are implemented. The legacy runtime remains available behind `AGENT_RUNTIME_VERSION=v1` while v2 is now the default for `/agent/chat`. See [the final cleanup and M18.1 checkpoint](m18-1-recipient-resolution.md) for the updated three-call prepare path.

## Intent Lifecycle Patch checkpoint

| Item                | Implemented result                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State machine       | `PREPARED → EXECUTED / EXPIRED / CANCELLED`; all three terminal states remain terminal. Execution requires exactly `PREPARED` before any debit.                                                                                         |
| Endpoint            | `POST /customer/transfer-intents/{intentId}/cancel`; body has a bounded reason enum and response is the existing `TransferIntent` with `CANCELLED` or preserved `EXPIRED`.                                                              |
| Migration           | `V18__transfer_intent_cancellation.sql` expands the status check and adds checked `cancellation_reason`. V1 and immutable intent terms/hash are unchanged.                                                                              |
| Locking             | PostgreSQL cancellation and execution use the transfer-intent row lock and a database transaction. Cancel-first yields zero debit; execute-first yields one debit and cancellation conflict.                                            |
| Authorization       | Spring customer identity, ownership, creating-session binding stored in existing intent terms, and CSRF. The Agent never supplies a customer ID as authority.                                                                           |
| Idempotency         | A second cancel returns the same `CANCELLED` intent. Executed intents reject cancellation; expired intents remain expired.                                                                                                              |
| Race tests          | Testcontainers PostgreSQL covers cancel-first, execute-first, and simultaneous cancel/execute. No `CANCELLED` plus debit outcome was observed.                                                                                          |
| A04/A05/MAX         | v2 cancels the old bank intent before preparing a revised amount or recipient. Failure and step-limit cleanup cancel any known active prepared intent. Uncertain cancellation blocks progress.                                          |
| Contract            | Customer v1.18.0 / 59 operations / SHA-256 `47a61e5c4f7df9c142c7e8780610b5f0489d2844a6e0c837d4127138b70e176b`. Public remains SHA-256 `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`. `pnpm contract:check` passed. |
| Spring verification | `mvnw.cmd -q verify`: 597 tests, 0 failures, 0 errors, including the PostgreSQL integration suite.                                                                                                                                      |

## 1–3. Before, why it was not agentic, and new architecture

The [M17 architecture audit](m17-architecture-acceptance.md) found that `transfer_runtime.py` and `transfer_planner.py` imposed the fixed `list_accounts → resolve_recipient → prepare_transfer → get_transfer_intent` chain. The model saw tool names and reduced counts/statuses; the runtime parsed most business slots and filled tool arguments. A model call after a tool did occur, but it did not decide from the complete observation. This was **NOT YET AGENTIC**.

The new path is `FastAPI /agent/chat → authenticated Task → ContextBuilder → DeepSeekPlanner → strict PlannerDecision → ToolRegistry → fixed BankingGateway call → structured Observation → next model decision`. Neither the runtime nor the registry imposes a recipient-first/account-first order. The two orders both pass scripted tests; a real DeepSeek trace selected recipient, account, then preparation. The runtime owns the step cap, session binding, state transitions, policy, cleanup, and confirmation. Spring owns customer identity, intent persistence, authorization, and atomic debit.

## 4–5. Retained and deprecated components

- **Retained:** `BankingGateway` fixed-path HTTP boundary; `DeepSeekClassifier` HTTP client; Spring session/CSRF transport; `TransferPolicy`; shared HTTP response models; legacy `/chat` read/public behavior.
- **Retained for rollback only:** `TransferRuntime`, `DeepSeekToolPlanner`, `ScriptedPlanner`, old `ToolRegistry`, and heuristic routing when `AGENT_RUNTIME_VERSION=v1`.
- **Deprecated on the default transfer route:** `next_required_tool`, model choice among runtime-supplied fixed candidates, and locally discarded prepared intents. No large legacy deletion was made.

## 6–10. Agent loop, decision, registry, observation, task state

`AgentRuntimeV2._run` sends the current conversation, current task state, all prior read observations, and the complete registered tool metadata to `DeepSeekPlanner.decide` on each planning step. Its strict Pydantic decision is exactly one of `TOOL_CALL`, `ASK_USER`, or `COMPLETE`; extra fields or malformed shapes fail validation. A schema-invalid model response gets one bounded correction request; continued failure ends safely. The model cannot declare task status or grant authority. After a valid `prepare_transfer` observation, the runtime sets `WAITING_CONFIRMATION` directly. No regex-extracted amount is used as normal business state; a deterministic numeric-conflict check remains solely to reject a contradictory model proposal.

The model-visible registry contains exactly six tools:

| Tool                  | Side effect | Risk      | Input                                                                | Output                                              |
| --------------------- | ----------- | --------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `list_accounts`       | READ        | LOW       | `{}`                                                                 | Masked customer account summaries                   |
| `get_account`         | READ        | LOW       | Observed opaque `id`                                                 | One masked account                                  |
| `list_transactions`   | READ        | LOW       | `limit` 1–50                                                         | Scoped recent transactions, titles marked untrusted |
| `resolve_recipient`   | READ        | LOW       | `query` string                                                       | Zero, one, or ambiguous masked candidates           |
| `get_transfer_intent` | READ        | LOW       | Current task's intent `id`                                           | Current intent state, no execution secret           |
| `prepare_transfer`    | PREPARE     | FINANCIAL | Observed source/recipient IDs, user-authorized decimal amount, `CNY` | Immutable bank intent summary; no debit             |

Every tool declares a strict input JSON Schema and common structured `Observation` output schema (`tool_name`, `success`, `structured_result`, `error`, `trust`). The bank result is narrowed before exposure. Recipient names and transaction titles carry `UNTRUSTED_EXTERNAL_DATA`; identity, amount, and eligible source/recipient IDs are checked by runtime code. There is no model-facing execute, cancel, raw REST, arbitrary URL, SQL, shell, or admin tool. The registry has strict argument validation; Spring performs the final authorization.

Task states are `RUNNING`, `WAITING_USER`, `WAITING_CONFIRMATION`, `WAITING_AUTH`, `BLOCKED`, `SUCCEEDED`, `FAILED`, and `CANCELLED`. A recipient choice resumes the same task and observed candidate set. The step cap is 10 by default. Task state and traces remain process-local.

## 11–13. Capability, policy, and ActionIntent boundaries

The authenticated Spring session establishes the customer and is hashed into the Agent task binding. The model may select only registered reads and intent preparation. `prepare_transfer` accepts only an observed active CNY current account, an observed eligible recipient, and a positive decimal amount explicitly present in the user's turn. A malicious tool observation cannot increase that amount. `TransferPolicy` and the confirmation route, rather than the planner, enforce the high-risk execution boundary.

The prepared intent is an immutable Spring resource with exact `intentId + intentHash`. It moves no money. On user revision, cancellation happens through the **trusted** `LifecycleCoordinator` before a new intent is prepared; cancellation is not a model tool. A timeout triggers a bank-state read, and any unresolved state moves the task to `BLOCKED` so no new intent or confirmation is allowed. Confirmation separately checks the saved ID/hash, current bank state and available funds, and the intent-bound step-up authorization. Only then can the trusted route call `POST /customer/transfers` with a stable idempotency key. A second confirmation returns the same receipt.

## 14. Execution trace example

The isolated local run used PostgreSQL 17, Spring Boot `demo,local` on port 18082, FastAPI in-process HTTP, and the real DeepSeek endpoint. The sandbox alone had a unique Chinese `张三` and `李四`; the ordinary demo database was not changed for this test.

1. `给张三转500`: DeepSeek chose `resolve_recipient` → observed unique `recipient_zhang`; next request chose `list_accounts` → observed active `acc_current`; third chose `prepare_transfer` with `500.00 CNY`. In the original rebuild run, the intent observation went back to DeepSeek for a fourth `COMPLETE` decision. The final cleanup removed that call: a valid prepared intent now immediately sets `WAITING_CONFIRMATION`, with zero debit.
2. `金额改成1000`: Spring returned `CANCELLED` for old intent; DeepSeek made new decisions and prepared `1000.00` only after that cancellation.
3. `不是张三，是李四`: Spring cancelled the 1000 intent; DeepSeek resolved `recipient_li` and prepared a new immutable intent.
4. Task cancel made that intent `CANCELLED`. A separate `给张三转1` task prepared an intent; Spring demo step-up issued an intent-bound authorization; one confirmation executed the 1.00 CNY transfer. A duplicate confirmation returned the same receipt and the source balance decreased by exactly 1.00.

The compact machine-readable result is [the live sandbox trace](../../artifacts/m17r-agent-v2-live.json). It contains no session cookie, OTP, password, authorization token, or model API key.

## 15–17. Unit, integration, and real-model evidence

- Python `unittest discover`: **71 passed after final cleanup**. This includes two tool orders; observation A in the second model context and A+B in the third; immediate exit after preparation; invalid tool/schema/decision; ambiguity; revision cancellation; uncertain cancellation blocking; malicious note; duplicate confirmation; the default v2 HTTP route; and name/pinyin matching. Legacy tests explicitly select v1 and still pass.
- Spring `mvnw.cmd -q verify`: **597 passed** across unit and Testcontainers PostgreSQL integration tests. The HTTP and persistence tests cover CSRF/ownership/session checks, terminal-state behavior, cancellation reason, and the three cancel/execute orderings.
- The original isolated **real DeepSeek → Agent v2 → Spring → PostgreSQL** run passed revision, cancellation, step-up, execution and duplicate-confirmation checks with four planner decisions. After final cleanup, new real DeepSeek smoke tests reached `WAITING_CONFIRMATION` after **three** decisions and three tools, and the running local Spring/PostgreSQL demo backend confirmed the same for Lin Wei, 张三 and Zhang San; all newly prepared intents were cancelled without debit. The original executable-mutation evidence remains a historical pre-cleanup result.
- Frontend regression: `pnpm lint`, `pnpm typecheck`, `pnpm test` (**496 Vitest and 3 Node tests**), `pnpm build`, and `pnpm contract:check` passed with an explicit backend base URL for the build. The rebuilt front end and restarted Agent v2 were verified in the browser: the authenticated `/app/agent` page displayed Alex Chen, the updated model-data disclosure, and a completed account-balance answer through Agent → Spring.

## 18. R01–R16 acceptance

| Case                                    | Result | Evidence                                                                                                    |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| R01 unique 张三 → review                | PASS   | Real DeepSeek/Spring/PG sandbox reached `WAITING_CONFIRMATION` without debit.                               |
| R02 recipient → accounts → prepare      | PASS   | Scripted Planner test and real-model trace.                                                                 |
| R03 accounts → recipient → prepare      | PASS   | Alternate scripted Planner test.                                                                            |
| R04 observation A in next context       | PASS   | Context capture asserts one structured observation.                                                         |
| R05 observations A+B in third context   | PASS   | Context capture asserts both and recipient candidates.                                                      |
| R06 `execute_transfer` tool             | PASS   | Registry hard rejection before any gateway call.                                                            |
| R07 unknown tool                        | PASS   | `raw_sql` hard rejection.                                                                                   |
| R08 invalid planner decision/JSON shape | PASS   | Strict Pydantic validation fails task safely; real malformed model output was retried once, never executed. |
| R09 invalid arguments                   | PASS   | Strict schema rejects wrong `resolve_recipient` arguments.                                                  |
| R10 step limit                          | PASS   | Task ends `FAILED/MAX_AGENT_STEPS`, zero debit.                                                             |
| R11 prepared intent at failure/limit    | PASS   | Known active intent is cancelled in bank before failure; uncertain cancellation blocks progress.            |
| R12 confirmation twice                  | PASS   | Real sandbox executes 1.00 once and returns one receipt twice.                                              |
| R13 amount revision                     | PASS   | Old 500 intent `CANCELLED` before 1000 intent prepared, real sandbox.                                       |
| R14 recipient revision                  | PASS   | Old intent `CANCELLED` before 李四 intent prepared, real sandbox.                                           |
| R15 injected transaction note           | PASS   | Marked untrusted; attempted 10000 amount rejected against user-authorized 500.                              |
| R16 hallucinated recipient ID           | PASS   | Unobserved recipient rejected by registry.                                                                  |

## 19. Known limitations

1. Task and trace storage are in one Agent process. A restart loses task continuity; a known active prepared intent remains bounded by Spring expiry, but an Agent process cannot resume that task. Run one worker until a persistent task store is designed.
2. A network timeout **during intent creation before the Agent receives the new ID** may leave an unknown prepared intent in Spring until its expiry. The approved cancel endpoint can revoke known IDs; it cannot locate an unknown creation result. Closing this gap would require a separate idempotent preparation/reconciliation contract, so it is not represented as solved by M17R.
3. Real model decisions can be malformed. One schema retry is bounded; continued invalid output fails closed. The successful smoke trace is one acceptance run, not a statistical reliability guarantee.
4. The v2 task response maps internal `BLOCKED` to the existing external `FAILED` enum with `BANK_INTENT_STATE_UNKNOWN`; the contract has no external `BLOCKED` status.
5. Phone, historical-note, scheduled, AA, pinyin matching, knowledge graph expansion, and unrelated Card/Wealth Agent capabilities remain outside this milestone.
6. The original browser acceptance found that `转给 Lin Wei 10 元` initially failed the amount-conflict check; it was corrected and the Agent displayed a `¥10.00` review with masked source and recipient. The final cleanup removed regex-derived amount state entirely. Local service startup depends on terminal sessions kept open; runtime restarts should use `scripts/start-agent-local.ps1` after code updates. The isolated Spring/PostgreSQL sandbox covered execution and duplicate confirmation before final cleanup.
7. A local PowerShell paste error exposed the DeepSeek API key in terminal output. Rotate the key before sharing logs or deploying; keep the replacement only in the local key file or environment, not in source control.

## 20. Legacy removal decision

**Do not remove legacy code yet.** v2 is the default and passes the bounded architecture matrix, but v1 is needed as a rollback path while the live Web integration and model-failure behavior are exercised further. Removal should follow an explicit later regression milestone; M17R stops here.
