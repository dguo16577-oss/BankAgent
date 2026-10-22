# Integrated upgrade — remaining issues

2026-10-20 follow-up: I06 Knowledge deployment now has a healthy service, 36
documents / 156 chunks, persisted graph and real cited answers. The historical
environment block below is retained; see [KG/RAG acceptance（历史资料）](../release-status.md#历史资料).
This closes that deployment gap, not the complete RAG adversarial, S1 or R1 gates.

2026-10-16. This is an evidence matrix, not automatic milestone promotion.
The original `D:\BankProject` is excluded. Complete report/source inventory:
`artifacts/integrated/report-inventory.json`; actual 50-tool schemas:
`artifacts/integrated/registry.json` and [permissions](integrated-tool-permissions.md).

| ID | Severity / component | Root cause | Existing/new test | Required fix / acceptance | Security impact | Current classification |
| --- | --- | --- | --- | --- | --- | --- |
| I01 | High / turn interpretation | Format classification lacks task context and fresh-query kind | UX4.6 real failed follow-up; test_ux47 | Contextual model decisions, new goal gets fresh ledger/tools; live retest | Silent query omission | CONFIRMED_BUG, source repair under test |
| I02 | High / pending action | New read goal previously deferred | test_ux47 pending read coexistence | Isolated read-only child ledger, parent intent immutable; refresh/live retest | Must never borrow pending authorization | IMPLEMENTATION_GAP, source repair under test |
| I03 | Medium / service offer | Model plan fails to include trusted service IDs for vague interest | UX4.6 real failure; planner navigation tests | Real offer + accept → clarification, zero PREPARE | Assistance is not confirmation | CONFIRMED_BUG, source guidance updated |
| I04 | High / amount veto | Year/month tokens counted as candidate amounts | New regression fails before and passes after; malicious amount still rejected | Calendar-only exception detection; distinct authorized operation terms; real mixed goal | False rejection; must retain tamper rejection | CONFIRMED_BUG, source repair under test |
| I05 | Medium / coverage | Historical inclusive end treated as current partial | New historical/current interval tests | Retrieval coverage vs current period; missing/unknown explicit | Misleading financial period | CONFIRMED_BUG, source repaired |
| I06 | High / RAG deployment | No running Knowledge Service; **0 documents/chunks** in current DB | Real read-only DB inventory | Reuse V34/public corpus/E5, ingest and trace sources | Missing evidence cannot mean no policy | IMPLEMENTATION_GAP + ENVIRONMENT_BLOCKED |
| I07 | Medium / MCP deployment | Pilot flag off in running stack | MCP auth/schema tests; real pilot history | Existing three tools only, actual provider calls | Grant audience/customer scope | IMPLEMENTATION_GAP, awaiting live retest |
| I08 | High / ledger semantic binding | Same-kind receipts remain matched by order | Existing ledger/dependency regressions | Terms-bound per-operation evidence for repeated same-kind goals | Wrong goal could appear complete | TEST_GAP / unresolved |
| I09 | High / recovery | Transfer reconciliation has DB evidence; non-transfer/browser unknown recovery incomplete | Historical S1/R1 logs + ten PG cases | Real browser SSE/unknown outcomes, non-transfer receipts | Duplicate execution / false status | TEST_GAP |
| I10 | High / hostile lower-trust text | Historical live hostile-note trace not reproducibly retained | Offline persisted-note pass, historical policy denial | Approved-path actual model observation + DB oracle | Authorization escalation | TEST_GAP; historical APPROVAL_BLOCKED retained |
| I11 | Medium / deployment resources | Windows commit headroom varies; E5 model build/runtime heavy | start resource gate, prior EOF/VirtualAlloc | Guard resources; no pagefile/network bypass; independent authorized host if needed | Availability, user machine stability | ENVIRONMENT_BLOCKED for heavy knowledge stack |
| I12 | Medium / OTel | No complete distributed SDK/exporter chain | New propagation/redaction/error tests | Agent SDK/spans now added; browser/Web/Spring/RAG ends need verification | Sensitive-context logging risk | IMPLEMENTATION_GAP / PARTIAL |
| I13 | Medium / performance | No matched selective-registry A/B evidence | Existing full-registry tasks, new bounded model input | Measure same fixtures/model; do not enable selective by guess | Missing tools or weakened controls | TEST_GAP |
| I14 | High / production operations | Demo OTP, no backup restoration/HA/load/service rotation signoff | Existing narrow auth/CSRF tests | Production identity/security operations assessed separately | Real funds/users not authorized | IMPLEMENTATION_GAP; NOT_READY_FOR_PRODUCTION |

No financial permissions, frozen contracts or historical migrations were relaxed.
Source repair is not deployment acceptance. Current final statuses and exact live
outcomes are in the integrated final report. S1 and R1 remain independent.

## Final disposition — 2026-10-16

The initial classifications above are preserved as the audit starting point.

- I01/I03/I04/I05: VERIFIED_PASS for focused tests and named real model/browser
  sequence. Fresh analysis, service assistance and correct historical period are
  observed; no claim of exhaustive language coverage.
- I02: VERIFIED_PASS for pending transfer + new card query, read-only PREPARE
  veto regressions and subsequent durable cancellation. Broad cross-action live
  restoration remains part of I09, not silently closed.
- I07: VERIFIED_PASS for actual account/card MCP provider calls; complete gateway
  adversarial acceptance still belongs to S1.
- I06/I11: ENVIRONMENT_BLOCKED. Empty KB, 4 GiB commit-headroom requirement not met.
- I08/I09/I10: UNVERIFIED/TEST_GAP, still release blocking; no new High/Critical
  closure based solely on model text. Historical network-policy blocks preserved.
- I12: PARTIAL; local safe SDK spans tested and deployed, full chain missing.
- I13: PARTIAL; actual small FULL_REGISTRY sample, matched A/B not run.
- I14: NOT_READY_FOR_PRODUCTION; assessment delivered, operational controls missing.

Detailed evidence and release recommendations:
[integrated acceptance（历史资料）](../release-status.md#历史资料).
