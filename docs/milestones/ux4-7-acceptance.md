# UX4.7 — contextual turns and deployment acceptance

2026-10-16. **PARTIAL**. Source fixes are deployed; complete knowledge-stack acceptance remains blocked.

## Actual changes

| Area | Implementation | Evidence / limit |
| --- | --- | --- |
| New query versus presentation | Contextual LLM follow-up decision receives original goal, status, pending-intent presence and observed tool names. Fresh query resets analytical scope/ledger; presentation only reuses observations. | `tests/test_ux47.py`; real `live-new-query` and `live-presentation-change` artifacts. No keyword router. |
| Pending action plus read query | Separate read-only child Task/Ledger, persisted query ledger in parent; PREPARE veto in read-only overlay. Parent financial terms/goal remain intact. | Real pending transfer + `list_cards`, same confirmation retained, then user cancellation. Source unit tests also forbid child PREPARE. |
| Transfer service assistance | Planner supplies trusted transfer service; acceptance is consultation/clarification, not financial confirmation. | Real service-offer and assistance browser traces; zero financial intent at that stage. |
| Mixed analysis and transfer | Valid calendar tokens excluded only from safety conflict detection. Runtime ledger/dependency status and evidence floors enter each model decision. | Initial real failure retained; final model calls fresh `summarize_spending`, `resolve_recipient`, `list_accounts`, `prepare_transfer`. g1 SUCCEEDED, g2 PENDING, WAITING_CONFIRMATION. |
| Historical coverage | A historical inclusive end is not the current unfinished month. | Sept 2026 CNY 4968.00, COMPLETE retrieval range. This proves bounded API retrieval coverage, not bank ingestion completeness. |
| MCP | Existing pilot tools enabled; Registry remains 50 tools. | Actual `list_accounts` and `list_cards` use MCP provider in current container; no new capabilities. |
| Knowledge | Existing overlay gains local E5 model build context and ingestion CLI. | Source only. Knowledge tables have zero rows; 4 GiB commit-headroom gate prevents full stack build. No live RAG PASS claim. |

## Real sequence and bank oracle

Artifacts are under `artifacts/integrated/`. `live-multi-goal.json` preserves the earlier prerequisite failure. Final `live-multi-goal-final.*`, `live-pending-query-final.*`, `live-refresh-final.png`, `live-cancel-final.json`, `mixed-task-traces.json` and `bank-snapshot.json` record the successful sequence and durable trace. Model decisions are structured decisions, not hidden reasoning.

The transfer reached a bank-created 10 CNY intent, was never confirmed for execution, and was cancelled through the UI. Accounts (8), transactions (69) and transfers (4) retain exactly their pre-test SHA256 digests. Transfer intents increased from 14 to 15; final task CANCELLED. Existing unrelated PREPARED intents were not altered.

Refresh was followed by normal UI locator waiting; an immediate pre-hydration button count of zero is not a recovery failure or proof of recovery. The subsequent cancel control became usable and bank/task cancellation completed. SSE interruption after bank commit was not tested by this sequence.

## Regression and version

- Agent full: 315 run, 305 pass, 10 skip; the same 10 Postgres recovery tests separately pass against the isolated PostgreSQL. Their Banking adapters are scripted, so these do not prove Spring financial effects.
- UX4 deterministic acceptance: 21 pass; UX4.7 seven cases are included in full Agent regression.
- Web schema/render/session directed regression: 8 pass with the actual Web Vitest config. An initial invocation from repository root used the wrong config and failed; both logs retained.
- Current Agent image: `sha256:47642dbd22b9b7f0ef945891997e193a8f3835901991ac3cb1a453239c638314`. All 41 deployed Python source files match local source byte-for-byte (`source-parity.json`).
- Source label: `7df457ba1157ab421899702971ee80a932c2e4e063172089286b125f2272ac0b`. A separately recomputed host path-dependent aggregate differs; do not use that aggregate as parity proof. Per-file comparison is authoritative here.
- Web/Spring/DB/proxy retained compatible existing containers; no Web application code, frozen API or migrations changed in this upgrade.

Still open: full RAG deployment, repeated same-kind operation receipt binding, wider malicious-model and recovery coverage, full UX01–UX16 reacceptance. S1/R1 remain PARTIAL independently.
