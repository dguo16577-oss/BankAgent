# Aster Bank — Integrated acceptance

**2026-10-20 follow-up:** the empty Knowledge deployment/resource gap below is
now resolved by the [KG/RAG deployment](kg-rag-completion.md): 36 documents,
156 chunks, persisted graph and actual model/browser evidence. The report below
remains the dated 2026-10-16 snapshot; S1/R1 and full integrated acceptance are
still PARTIAL, not automatically promoted by this follow-up.

2026-10-16. Workspace: `D:\BankProject-AGUI-20261012`. Original project `D:\BankProject` was not modified.

## Decision

**Overall PARTIAL.** The deployed Agent now passes the repaired representative UX flows. This is a synthetic competition-demo environment, not a production banking deployment. Knowledge deployment and remaining security/reliability evidence prevent overall acceptance. No phase is promoted merely because another phase passes.

| Phase | Status | Actual outcome |
| --- | --- | --- |
| 0 audit | PASS for inventory | Reports/code/deployment/DB/resources reviewed; 50-tool export and remaining issue matrix produced. Inventory is not security acceptance. |
| 1 UX4.7 | PARTIAL | Five source defects addressed; service, fresh-query, presentation, mixed-goal and pending-read flows live-tested. Knowledge stack unavailable. |
| 2 S1/R1 closure | PARTIAL | Full Agent and real PG TaskStore tests pass; unresolved ledger binding, adversarial-model and non-transfer/browser recovery cases remain. |
| 3 R2 observability | PARTIAL | Optional local Agent OTel SDK, safe spans, propagation and actual usage. Not full browser→Web→Agent→Spring distributed tracing. |
| 4 R3 performance | PARTIAL | Small measured FULL_REGISTRY sample, bounded input and build-cache correction. No matched SELECTIVE_REGISTRY A/B; no selective default. |
| 5 R4 assessment | PASS for assessment; NOT_READY_FOR_PRODUCTION | Narrow synthetic demonstration possible; controlled customer pilot HOLD; real production not approved. |
| 6 integrated regression | PARTIAL | Impacted deterministic tests and representative real browser/model/DB sequence pass; complete live matrix remains unverified. |

## Architecture and implemented boundaries

Next/CopilotKit experimental workspace → AG-UI adapter → FastAPI Agent v2 → DeepSeek structured planner → trusted 50-tool Registry → Observation → next LLM decision. Runtime supplies current ledger/dependency/evidence floor to the planner. PREPARE exits at WAITING_CONFIRMATION. The model never gains direct execution, arbitrary URL, SQL or admin authority. Confirmation, revalidation, authorization and bank execution remain deterministic Spring responsibilities. PostgreSQL persists bank state and Agent checkpoints. Knowledge retrieval remains a separate lower-trust evidence source and cannot authorize bank operations.

Current live MCP pilot routes existing account/card tools through the trusted gateway; it does not add model-visible financial permissions. Legacy `/app/agent` and flagged `/app/agent-copilot` both remain available. No new banking domain or API was introduced.

## UX repair and real acceptance

See [UX4.7 detail](ux4-7-acceptance.md). Real browser/DeepSeek checks, all with synthetic Alex:

| Request / action | Observed outcome | Evidence |
| --- | --- | --- |
| 我想转账 | Transfer service with trusted `/app/payments` route and assistance choice; asks missing terms | `live-service-offer.json/.png` |
| Accept assistance | Consultation/clarification, no financial confirmation | `live-assistance.json/.png` |
| 查一下2026年9月的消费，用柱状图 | Fresh spending tool; 4968 CNY; historical COMPLETE range | `live-new-query.json/.png` |
| 把刚才已有的分类图改成饼图，不重新查询 | Existing result presentation changes | `live-presentation-change.json/.png` |
| 分析2026年9月消费，然后给张三转10元，先等我确认 | Fresh analysis → recipient → accounts → bank prepare; WAITING_CONFIRMATION, analysis complete, transfer pending | `live-multi-goal-final.*`, `mixed-task-traces.json` |
| 再查一下我的银行卡，只查询，不修改之前的转账 | `list_cards` returns true card state; original pending transfer remains | `live-pending-query-final.*` |
| Refresh then Cancel intent | Durable task/confirmation becomes usable; bank intent cancelled; no execution | `live-refresh-final.png`, `live-cancel-final.json` |

Initial mixed-goal run failed because the planner did not receive dependency progress and attempted PREPARE before fresh analysis. The guard rejected it; no intent or debit occurred. We added bounded ledger context and per-step update, retained the failure artifacts, then rebuilt and repeated successfully. These selected successes do not establish a statistically valid task-success rate, nor complete UX01–UX16 acceptance.

## Bank state and financial invariants

`artifacts/integrated/db-before.json` versus `db-snapshot.json`:

- Accounts: 8, same full-table digest.
- Transactions: 69, same full-table digest.
- Executed transfers: 4, same full-table digest.
- Transfer intents: 14 → 15, expected one new prepared-then-cancelled intent. Final intent aggregate: CANCELLED 2 / EXECUTED 4 / PREPARED 9. Existing pending records are pre-existing, not silently cleaned up.
- Knowledge documents/chunks: 0 / 0. Flyway latest 34, existing migration success unchanged.

Thus this real sequence produced zero debit, duplicate execution or altered balance. Offline regressions cover cross-customer, stale confirmation and injection guards, but do not replace remaining live security or recovery cases. No global zero-risk claim is made. The repeated same-kind ledger evidence-binding concern I08 remains High/unresolved.

## Test evidence

| Test | Result / scope |
| --- | --- |
| Agent full, final source | 315 run, 305 pass, 10 skipped (`agent-tests-closure.log`) |
| Ten skipped Agent PG tests | 10/10 pass separately on current isolated PostgreSQL (`postgres-tests-closure.log`); scripted bank adapters, not Spring money execution |
| UX4 deterministic acceptance | 21 pass (`ux4-regression.log`), included affected functionality in final Agent suite |
| Web directed schema/render/session | 8/8 pass (`web-directed-closure-correct-cwd.log`) |
| Telemetry privacy/usage/propagation/no-blind-retry | 5 pass, also in final Agent suite |
| Launcher offline safety | PASS; simulated Docker/memory probes, plus actual incremental restart and healthy service evidence |
| Contract audit / lint | Current frozen contract hashes unchanged; audit and Redocly logs retained |
| Web full 517, Spring 211 unit + 426 PG, prior lint/typecheck/build | Historical evidence retained, not re-labelled fresh; no Web/Spring application source change this turn |
| New Agent image build | PASS; cached final build and real replacement verified |

No heavy suites ran alongside browser/build. Agent full finishes in 33.790s. Original failures and skips remain in logs. The 10 Postgres cases are separately reported, not erased from the full-suite skipped count. No claim that all historical browser cases ran in this phase.

## R2 and R3 measurements

See [R2](r2-observability-acceptance.md), [R3](r3-performance-acceptance.md), and `otel-metrics.json`. Final deployed-container sample: 10 successful model calls, actual usage in 10/10; 101209 prompt + 743 completion tokens. Model p50 1074.715ms / p95 1877.387ms. Five tool spans p50 72.104ms / p95 100.932ms; 32 bank reads p50 17.965ms / p95 55.844ms. Small sample, includes one mixed task and follow-up; HTTP spans include health traffic. These are operation timings, not end-to-end task percentiles.

Previous initial sample retained separately (17 model spans including one error); it is a different workload/version and cannot serve as a matched before/after comparison. Task-success rate and monetary cost are UNKNOWN, not inferred from span OK or guessed tariffs. FULL_REGISTRY remains 50. No selective/compaction/fallback default enabled without quality and safety A/B evidence.

SDK exporter retains only fixed owned span names and metadata allowlist; third-party MCP spans become `thirdparty.span` without arbitrary attributes. Tests verify malicious span names/payloads cannot leak through exporter. No raw prompt, Cookie, credential, account number or tool argument logging is intentionally added. Full redaction/end-to-end correlation audit remains open.

## Deployment provenance / operation

Agent running image `sha256:47642dbd22b9b7f0ef945891997e193a8f3835901991ac3cb1a453239c638314`; source label `7df457ba1157ab421899702971ee80a932c2e4e063172089286b125f2272ac0b`. All 41 local Agent Python files match container byte hashes. `source-parity.json` records them. `deployment-final.json` records all five image IDs/config hashes. Its separately computed host aggregate uses path formatting and differs from build label; it is not used as equality proof. Repository branch has no commits; Git SHA is unavailable, explicitly not invented.

Web kept image `sha256:5384f7dad24d47ee8925edf6b46f8274afa0b621f0bb22f0936c4143d67e08db`; no new Web source required. Spring/PostgreSQL/proxy retain compatible containers. Five services healthy after real Agent replacement. No volume deletion or migration performed. Only Agent source and deployment helpers required this incremental update.

URLs: [bank](http://127.0.0.1:18088/), [Copilot experiment](http://127.0.0.1:18088/app/agent-copilot), [Legacy Agent](http://127.0.0.1:18088/app/agent). Existing `start.cmd`/`start.ps1` remain the sole lifecycle mechanism; see [START-README](../../START-README.md). Status/logs/stop retain semantics. Rebuild only Agent via `restart -Services agent-runtime`; keep current MCP/OTel opt-ins when desired. Rollback uses retained pre-upgrade image, the same project/config and `-NoBuild`; do not delete PostgreSQL volumes. Knowledge has not been accepted or enabled by claiming a healthy Agent alone.

## Resource and evidence integrity limits

Knowledge deployment requires 4 GiB commit headroom; observed about 2.1 GiB, despite over 6 GiB physical availability. The gate blocked it. One Agent rebuild attempt was also refused at 1915 MiB; later cached retry passed with sufficient headroom. No pagefile/security/network changes or unrelated process termination. The browser used one installed Edge process with Chromium sandbox enabled; no browser download workaround. Real model calls succeeded through the existing approved runtime path; historical blocked-by-policy records remain and were not bypassed.

Two legacy evidence helpers reused historical output paths during investigation: `artifacts/ux46/bank-snapshot.json` and `artifacts/ux45/postgres-recovery.log` now contain current-run data. They must not be presented as their original raw historical capture. Original UX4.6 before/after/summary/browser evidence remains; current outputs copied to integrated artifacts and final reruns use integrated paths. This provenance collision cannot reconstruct overwritten raw bytes and is recorded explicitly.

## Remaining priorities and release recommendation

1. Resource-approved Knowledge build/import, source/citation/permission and live RAG acceptance (currently empty index).
2. Terms-bound same-kind ledger evidence; complete adversarial-model case, unknown non-transfer outcome, concurrent confirmation and browser SSE-after-commit checks.
3. Complete distributed observability, permission/redaction audit, then matched full/selective quality/cost/performance A/B.
4. Restore/backup, production identity/step-up, rotation, HA and operational load testing before any customer pilot.

S1 = PARTIAL; R1 = PARTIAL; UX4.7 = PARTIAL; R2/R3 = PARTIAL. Source-only Knowledge deployment changes are not accepted functionality. Narrow rehearsed competition demonstration is possible with synthetic accounts and clear knowledge limitations. Controlled real-customer pilot: HOLD. Production: NO. This report stops at the resource/security evidence gates; no SFT, new business tools, frozen-contract changes or authority expansion started.
