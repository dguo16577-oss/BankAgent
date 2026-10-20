# UX4 — End-to-End Acceptance

2026-10-16 follow-up: see [UX4.7](ux4-7-acceptance.md) and
[integrated report](aster-integrated-final-acceptance.md). Representative repaired
flows are deployed and live-tested. Full historical UX acceptance remains PARTIAL;
this addendum does not overwrite the original failures or policy blocks below.

## UX4.6 live deployment update

Latest Web/Agent images are now deployed and source-fingerprinted. Real browser,
DeepSeek, Spring API and PostgreSQL evidence was collected, revealing additional
failures in follow-up classification, assistance, multi-goal transfer and coverage.
**UX4 stays PARTIAL.** See [UX4.6 actual results](ux4-6-deployment-e2e-acceptance.md).
Earlier resource/policy failures below remain historical evidence.

## UX4.5 follow-up — 2026-10-15

The three source-level defects below have now been addressed and the original
21-case suite passes. Real PostgreSQL recovery tests were separately enabled
and passed 10/10; four real DeepSeek follow-up classifications also passed.
**UX4 remains PARTIAL:** new images could not be built/deployed within the
memory gate, so UX01–UX16 live acceptance is still open. The original failed
records below remain historical evidence. See [UX4.5 report](ux4-5-final-acceptance.md)
for actual fixes, limits, source/image identity and current test results.

2026-10-15 · **UX4 = PARTIAL** · **S1 = PARTIAL; R1 = PARTIAL** independently.

The current application cannot be declared accepted. Three deterministic
acceptance requirements fail, and the real model/bank/browser chain has not
been exercised. The minimal Chromium test passes. No new business feature,
Router, tool, financial permission, schema or runtime change was introduced.
Only acceptance scripts/tests, evidence and documentation were added in
`D:\BankProject-AGUI-20261012`. The original project was not changed.

## Evidence levels and execution

| Run | Actual result | Evidence |
| --- | --- | --- |
| Agent default suite, host Python, serial | 296 run: **286 passed, 10 skipped** | [log](../../artifacts/ux4/agent-full.log) |
| New UX4 deterministic acceptance suite | 21 run: **18 passed, 3 failed**, no skips | [log](../../artifacts/ux4/deterministic-agent.log) |
| Web structured response/schema tests | **6/6 passed**, jsdom, one worker, 192 MiB Node heap | [log](../../artifacts/ux4/web-targeted.log) |
| Full Web suite | **46 files, 517/517 passed**, one worker, 192 MiB heap, 158 seconds | [log](../../artifacts/ux4/web-full.log) |
| Minimal Chromium launch + in-memory page | **PASS** | [JSON](../../artifacts/ux4/chromium-smoke.json) |
| Real Next application/browser conversation | **POLICY_APPROVAL_BLOCKED**, zero scenario executions | [environment report](../testing/ux4-browser-environment.md) |
| Isolated Spring/PostgreSQL + DeepSeek | **NOT RUN / TEST_ENVIRONMENT_BLOCKED** | No fresh provider trace or bank DB assertions |

Default Agent logs contain deliberate negative tests (including MCP auth
failure messages); the unittest final result above determines their outcome.
The new acceptance suite is deliberately outside default `tests/`; its
failures remain visible requirements, not expected-failure decorators or
deleted/softened assertions. Reproduce from the workspace:

```powershell
$env:PYTHONPATH = 'services/agent-runtime'
& services/agent-runtime/.venv-mcp/Scripts/python.exe -m unittest discover -s services/agent-runtime/acceptance -v
```

This suite uses the actual runtime, ledger, aggregation and presentation
implementations with synthetic rows and scripted planners/fake bank adapters.
It does **not** measure natural-language intent accuracy or real DeepSeek
performance. Source SHA-256 values: [manifest](../../artifacts/ux4/source-manifest.json).

## UX01–UX16 matrix

`OFFLINE PASS` is limited component/runtime evidence. Every row still needs
real model + isolated bank + application-browser acceptance. None is labeled
end-to-end PASS on the strength of a fake bank or jsdom test.

| ID | Current deterministic evidence | Status / remaining gate |
| --- | --- | --- |
| UX01 | Ten transaction rows preserve bank-shaped amount strings/timestamps; component sorting/filtering/pagination tests pass | OFFLINE PASS; live records and transfer-only filtering unverified |
| UX02 | Real Decimal aggregator → category bar points, exact sum 1000.31 CNY | OFFLINE PASS; visible SVG/tooltip vs bank DB unverified |
| UX03 | Real monthly aggregator → line points, 0.10 + 0.20 = 0.30 | PARTIAL: YTD completeness fails (D02) |
| UX04 | Pie inputs use observation amounts, ignore invented profile amount | OFFLINE PASS for input values; actual rendered percentages unverified |
| UX05 | Two observed products → matching comparison rows | OFFLINE PASS; real product query/browser unverified |
| UX06 | Scripted CONSULT profile → service card; zero fake-bank intents/debits | OFFLINE PASS at runtime; true model classification and offer click unverified |
| UX07 | NAVIGATE profile rejects hostile PREPARE with NAVIGATION_CANNOT_PREPARE; fixed link component | OFFLINE PASS; real click + DB count unverified |
| UX08 | ASK_USER → WAITING_USER; no intent or debit | OFFLINE PASS with scripted decision; real missing-slot extraction unverified |
| UX09 | Explicit request → WAITING_CONFIRMATION for 500.00 CNY; zero debit before confirm | OFFLINE PASS; real model/DB/UI confirmation unverified |
| UX10 | Analysis evidence completes only analysis step; PREPARED cannot complete financial step. Existing multi-domain regression confirms independent confirmations | PARTIAL: specific analysis → transfer live chain absent |
| UX11 | Trusted cards service ID; actual catalog target /app/cards | OFFLINE PASS for card ID/navigation; live card + page unverified |
| UX12 | Attacker URL stays transaction text and cannot create service card; component rejects arbitrary service ID | OFFLINE PASS; real injected-note/browser/DB case unverified |
| UX13 | Malicious RAG observation + hostile planner PREPARE denied READ_ONLY_REQUEST_CANNOT_PREPARE; zero fake-bank intents/debits | OFFLINE PASS; no fresh real-model injection trace |
| UX14 | Model/profile numeric override ignored; malformed numbers rejected; **inconsistent observed breakdown is displayed as complete** | **CONFIRMED_DEFECT D01** |
| UX15 | Task JSON roundtrip restores identical structured blocks; existing AG-UI recovery tests pass | PARTIAL: browser refresh across live persisted state unverified |
| UX16 | Other customer receives 404 for the task/presentation; existing auth regressions pass | OFFLINE PASS; isolated two-customer browser/DB test unverified |

## Confirmed defects

### D01 — internally contradictory chart data is not rejected

`app/agent_v2/presentation.py::_spending` trusts each successful structured
observation without checking category sum against currency total. The test
creates statistics with the real aggregator, replaces one category amount
with 9999.00 while preserving total 1000.31, then calls `build_presentation`.
A bar/pie block is still emitted with `incomplete=false`.

This is a consistency-validation defect, not evidence that the LLM can
directly supply presentation amounts: arbitrary profile amounts remain
ignored. UX14 requires rejection of contradictory financial display values,
so invalid-string rejection alone was insufficient prior evidence.
Next action: validate per-currency totals/breakdowns and suppress inconsistent
charts with an explicit error, without accepting model replacement values.

### D02 — YTD completeness metadata mismatch

`presentation.py:54–55` reads `period_coverage.complete`; actual bill analysis
metadata uses `is_partial_period` and `period_end`. A requested full-year
range ending next January is rendered complete even when bank aggregation
was clipped to the current date. The YTD acceptance assertion fails.
Next action: use authoritative effective end and partial-period metadata,
including explicit YTD label; retain requested range separately.

### D03 — display-only follow-up cancels a bank intent

`runtime.py:254` cancels any active intent as TASK_REVISED before considering
the follow-up's meaning. Reproduction: prepare “给张三转500”, then
“用表格展示，金额和收款人都不变”. The fake Banking Core intent changes
PREPARED → CANCELLED, contrary to the display-only requirement. This does not
demonstrate unauthorized debit, but unnecessarily invalidates an operation
the user did not change. Next action: distinguish presentation changes from
immutable-term revisions while keeping cancellation authoritative in Spring.

No production fix was silently included in this acceptance-only run.
All three remain open; no PASS claim is made pending repair and retest.

## Additional boundaries

| Boundary | Evidence and limit |
| --- | --- |
| Three independent goals | Ledger with accounts/cards/holdings and only two observations retains g3 PENDING. Offline PASS; genuine three-goal extraction still unverified |
| Format-only follow-up | FAIL D03 |
| Change amount or recipient | Existing `test_amount_and_recipient_revisions_cancel_old_before_new` passes in full Agent regression; real browser replay pending |
| Explicitly refuse assistance | DECLINED profile suppresses offer; component dismisses unaccepted offer without bank request. True model interpretation pending |
| Consultation only | Scripted CONSULT / ASK_USER yields no intents/debits. True model interpretation pending |
| “就用刚才那个” in long conversation | Existing candidate-set ambiguity recovery tests pass for explicit candidates; this exact long-context pronoun scenario remains UNVERIFIED |

The first draft of the new three-goal test incorrectly compared a string to
returned dictionaries; the test was corrected to compare `step_id`, then
passed. That test-authoring error is not recorded as a product defect.

## Route registry and confirmation separation

`apps/web/src/features/agent/service-catalog.ts` fixes these local targets:

| Service IDs | Actual route |
| --- | --- |
| accounts | /app/accounts |
| transfer | /app/payments |
| transactions | /app/transactions |
| cards | /app/cards |
| wealth | /app/wealth |
| subscriptions, spending | /app/spending |
| security | /app/settings |

`RichPresentation` constructs links from the catalog, not transaction text or
LLM URLs. Rendering/clicking a service link has no assistance callback;
accepting assistance uses a separate button. Component tests prove callback
separation, while runtime tests prove NAVIGATE cannot PREPARE. They do not
replace observing real HTTP/bank state after an actual click.
`ACCEPT_ASSISTANCE ≠ CONFIRM_FINANCIAL_ACTION`; explicit bank action still
requires its own trusted confirmation. No direct execution tool was added.

## Ten skipped PostgreSQL tests audit

All ten are conditionally skipped by the class-level
`skipUnless(R1_TEST_DATABASE_URL, 'requires isolated PostgreSQL')` in
`tests/test_r1_postgres_recovery.py`. The host venv imports psycopg, but no
disposable DB/DSN is available. Starting the whole bank stack at less than
about 1 GB commit headroom was not safe. **All ten are security-critical and
TEST_ENVIRONMENT_BLOCKED; none is counted as PASS.** Each can run locally
when an isolated DB and sufficient resources exist.

| Exact test_name | Security property |
| --- | --- |
| test_prepared_intent_and_agui_thread_survive_process_replacement | Durable intent/thread ownership |
| test_old_worker_cannot_overwrite_newer_checkpoint | Concurrent stale-write rejection |
| test_lease_blocks_parallel_worker_and_expiry_allows_recovery | Lease isolation/recovery |
| test_crash_before_read_tool_call_resumes_same_task | Stable task identity |
| test_crash_after_read_observation_before_checkpoint_replays_read | Safe read replay |
| test_executed_by_bank_but_response_lost_never_reexecutes | Prevent repeated execution after uncertain outcome |
| test_different_customer_cannot_load_task | Customer isolation |
| test_two_workers_confirm_once_under_persistent_lease | Concurrent confirmation safety |
| test_checkpoint_redacts_secret_and_full_account_without_changing_ids | Persistent data minimization |
| test_cancelled_intent_stays_unconfirmable_after_replacement | Cancelled intent cannot revive |

Machine-readable names, environment, status and source lines:
[skip audit](../../artifacts/ux4/postgres-skips.json).
These tests use real PostgreSQL TaskStore and **fake banking adapters** even
when enabled. Prior execution cannot be represented as current Spring/DB
financial-state evidence. Historical evidence remains preserved.

## Safety invariants and evidence limits

- Offline navigation, consultation, missing-slot and hostile RAG cases create
  zero fake-bank intents/debits. Explicit financial request only prepares.
- Customer task lookup rejects another customer. Fixed service IDs exclude
  attacker URLs. Model-generated amounts do not override tool values.
- Existing default regressions cover confirmation, revisions, replay,
  ownership, MCP permissions and injection; 286 tests pass in this run.
- **No live balance, prepared/executed-intent count, authorization decision
  or DB final-state snapshot was obtained in UX4.** No live financial safety
  zero-count is claimed from fake counters.
- Sorting/pagination component assertions pass; charts use numeric coordinates
  (`Number`) and table sorting currently converts amount strings to Number.
  Exact display/tooltip rounding over the full allowed range has not been
  browser-verified. Do not claim all monetary formatting requirements passed.
- Checkpoint equality is verified; page reload leaving real bank state
  unchanged remains unverified. Missing ledger evidence blocks offline
  completion; genuine multi-goal extraction completeness remains unmeasured.

## Environment, real model and remaining work

See [environment diagnosis](../testing/ux4-browser-environment.md).
The minimal browser is functional, but application startup was rejected by
tool policy. Physical RAM was adequate for small tests while commit headroom
was severely constrained. No policies were disabled or bypassed.

There are **zero new real DeepSeek calls/traces**, zero completed real banking
browser scenarios and no token-cost/latency/intent-accuracy scores from this
run. Earlier network denial is retained as historical evidence, not presented
as a new denial. Current model testing is blocked by the unavailable isolated
application environment; no offline planner is relabeled as DeepSeek.

Next gate: repair D01–D03, run affected unit acceptance, then run approved
isolated host batches with model/tool/UI/DB evidence for all sixteen scenarios
and additional dialogue boundaries. Preserve current source hashes and rerun
affected cases after changes. Spring integration, lint/typecheck/build and
contract checks were not repeated without product/contract changes; prior
successful results remain historical evidence in UX1–UX3.

**Do not promote UX4, S1 or R1 to PASS.** Keep the experimental page flagged,
leave the legacy page available, and stop here without SFT/MCP expansion.
