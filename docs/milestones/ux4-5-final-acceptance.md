# UX4.5 — Defect Fix & Live Acceptance

Date: 2026-10-15. **UX4.5 / UX4 = PARTIAL. S1 / R1 remain PARTIAL independently.**

Scope: `D:\BankProject-AGUI-20261012` only. The original project was not
overwritten. No new bank tool, Customer API, migration, execution permission
or keyword Router was added. Existing running services and PostgreSQL volume
were retained. This report separates source fixes from actual deployment.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Original UX4 acceptance, including three former failures | 21/21 PASS | [final log](../../artifacts/ux45/ux4-final.log) |
| New UX4.5 regression oracles | 7/7 PASS, including subcases | [focused log](../../artifacts/ux45/focused.log) |
| Agent full suite | 303 run, 293 passed, 10 PG-dependent skips | [final log](../../artifacts/ux45/agent-full-final.log) |
| Those ten PostgreSQL recovery cases, separate run | 10/10 PASS, no skips | [real PostgreSQL log](../../artifacts/ux45/postgres-recovery.log) |
| Web full suite | 46 files, 518/518 PASS, one worker, 165.71 seconds | [log](../../artifacts/ux45/web-full.log) |
| Affected Web ESLint | PASS after correcting working directory | [log](../../artifacts/ux45/lint.log) |
| TypeScript | PASS with 640 MiB heap; earlier 384 MiB run exhausted V8 heap | [retry](../../artifacts/ux45/typecheck-retry.log), [retained failure](../../artifacts/ux45/typecheck.log) |
| Customer/Public contract lint + audit | PASS, frozen contracts unchanged | [log](../../artifacts/ux45/contract.log) |
| Real DeepSeek new follow-up interpretation | 4/4 PASS, provider-only | [sanitized decisions](../../artifacts/ux45/model-turn-smoke.json) |
| Latest source production build/deployment | **RESOURCE_BLOCKED; NOT BUILT / NOT DEPLOYED** | [preflight](../../artifacts/ux45/deploy-preflight.log) |
| Latest-code browser + model + Spring + DB UX01–UX16 | **NOT RUN; BLOCKED ON DEPLOYMENT** | No fabricated screenshots or integrated traces |

The default Agent run's ten skips are not described as passing within that
run. Their separate execution used the current source against the existing
isolated PostgreSQL TaskStore through the current Agent container. The runner
copied app/tests only into disposable `/tmp`, used existing PG connection
environment, created no new network or exposed port, and removed temporary
files. Banking adapters in those tests are fake: these ten passes prove durable
state/recovery/ownership assertions, **not real Spring financial effects**.

## FIX-01 — presentation changes preserve ActionIntent

Previous path: `chat → _chat_impl → active_intent → cancel_active(TASK_REVISED)`
for every follow-up, regardless of meaning.

Current path: `DeepSeekPlanner.interpret_follow_up(user_turn)` returns a bounded
`kind` and presentation enum. Runtime validates both. The four kinds are
PRESENTATION_CHANGE, TASK_MODIFICATION, FINANCIAL_ACTION_MODIFICATION and
USER_CANCELLATION. This uses the model, not keyword matching. Only the user
turn is supplied to this interpretation; retrieved text cannot select it.

- PRESENTATION_CHANGE saves only the view preference, conversational turn and
  trace/checkpoint. It does not run banking tools, replace the goal/ledger,
  alter terms, cancel/prepare intents, renew expiration or confirm anything.
- Explicit financial modification retains the existing authoritative bank
  cancellation-before-reprepare path.
- Explicit cancellation uses bank cancellation and trusted ledger cancellation.
- An unrelated goal while an intent is pending preserves that intent and
  returns `PENDING_ACTION_PRESERVED`. The assistant asks the user to resolve
  the pending operation or use another task; it **does not yet execute that
  unrelated query concurrently in the same task**. This is a documented limit.
- Invalid/unavailable model interpretation fails closed with
  `TURN_INTERPRETATION_UNAVAILABLE`, leaving the pending operation intact.

Regression coverage includes two distinct tasks, three sequential presentation
preferences per task, Task JSON checkpoint restoration between turns, exact
intent dictionary equality, goal/ledger/revision equality and zero fake debits.
Unrelated query and interpretation failure preserve the pending intent too.
Existing financial revision/cancellation tests pass in the full suite.
Models without the follow-up interpreter are legacy test doubles and retain
the old path; the production `DeepSeekPlanner` implements it.

The original UX4 presentation-only oracle keeps its bank-state assertions.
Its scripted planner now supplies the newly required semantic decision via
AsyncMock; no real expected outcome was weakened or failure test deleted.

## FIX-02 — deterministic data quality

`presentation_quality.display_quality` checks per-currency breakdown totals
using Decimal, exact cents, duplicate category/bucket keys, missing or invalid
amounts, unknown/mismatched currencies, scope currency, requested/covered date
ordering, monthly/daily/weekly bucket alignment and bounded display size.
Category and time breakdowns are checked independently; they are not added
together or mixed across currencies. No implicit FX conversion occurs.

On contradiction, no BAR/LINE/PIE block is emitted. A bilingual TEXT quality
notice explains bounded machine-readable reasons; valid original summary and
bounded raw rows remain available and are marked incomplete. No model fills
missing values and no missing non-zero breakdown is silently treated as zero.
Duplicate categories are rejected rather than merged into a guessed total.

Normal spending aggregation already excludes incoming refunds and rejects
negative consumption values. This change preserves that gross-consumption
definition: unexpected negative/refund-shaped aggregates are flagged instead
of silently plotted as net spending. A new net-refund accounting feature was
not introduced or claimed. Source transaction deduplication remains in the
existing bounded bank retrieval path.

Tests cover 0.10 + 0.20, total mismatch, duplicate category, currency mismatch,
negative amounts, missing amount, inconsistent interval and immutable repeated
rendering/checkpoint restoration. UI table monetary sorting now uses integer
cents via BigInt. Chart coordinates still use Number for Recharts; tooltip
and table values use the original validated decimal strings. No percentages
are synthesized by this change.

## FIX-03 — coverage semantics

Bank analysis `period_metadata` now supplies:
requested_start/end, covered_start/end, as_of_time, missing_periods and
coverage_status, retaining old fields for compatibility. Retrieval raises on
incomplete pagination; a fully retrieved empty month is not inferred missing
merely because it has no spending. Actual missing periods must come from
coverage evidence. Missing legacy coverage is UNKNOWN_COVERAGE.

Presentation distinguishes COMPLETE, PARTIAL_CURRENT_PERIOD, MISSING_PERIODS
and UNKNOWN_COVERAGE. Current-period results use the effective covered end,
not a future requested end; non-complete states are marked incomplete.
Explicit missing historical periods override a current-period label. YTD/current
charts receive a title suffix. Zod accepts bounded coverage metadata and the
same CoverageNote is rendered in chart, tooltip, summary and table.

Component regression checks persisted coverage notes and exact large decimal
display. The existing JSON checkpoint test proves deterministic reconstruction;
it does not substitute for a live browser reload.

## Real DeepSeek supplemental test

`scripts/ux45-model-turn-smoke.py` runs the current planner from container
`/tmp` using the existing secret mount and network. No DNS override, proxy
change, host relay or approval workaround was used. The model was
`deepseek-flash`. Only synthetic user text was sent, no bank/customer data.

| User turn | Actual structured kind | Latency |
| --- | --- | --- |
| 仅把展示方式换成表格，金额与收款人都不变 | PRESENTATION_CHANGE / TABLE | 0.691 s |
| 把待确认转账的金额改为1000元 | FINANCIAL_ACTION_MODIFICATION / AUTO | 0.874 s |
| 另外查询我的银行卡，不修改正在等待确认的转账 | TASK_MODIFICATION / AUTO | 0.584 s |
| 取消刚才待确认的银行操作 | USER_CANCELLATION / AUTO | 0.894 s |

These are real provider decisions, not hidden reasoning or a scripted planner.
They involve **no bank tools, financial mutation, browser or deployed runtime**.
They do not establish UX01–UX16 integrated success. Historical policy denials
remain in prior reports; no fresh model denial occurred for these four calls.
Token usage/cost was not captured, so no cost number is invented.

## Deployment identity and resource block

Git reports the current branch `codex/agent-ui-upgrade` has no commits. There
is no source commit hash to report. Source-file hashes are recorded in the
[SHA-256 manifest](../../artifacts/ux45/source-manifest.json);
they must not be represented as a Git commit. No bulk commit of this untracked
workspace, secrets or user data was created merely to manufacture provenance.

Running images, inspected directly:

| Service | Existing running image ID | Preserved rollback tag |
| --- | --- | --- |
| Web | sha256:ba5352adde1fc1b0e741860dfeacc8c21677748e583c422c9482b1bb6e792282 | aster-web:pre-ux45-20261015 |
| Agent | sha256:107ba129245c58588eae0694be6bbc6994faa0a4add2dbdbf8afbe24bf8794fc | aster-agent-runtime:pre-ux45-20261015 |

[Container image/mount evidence](../../artifacts/ux45/deployment-before.json).
These images do not contain this turn's fixes. No new image ID exists.

The real `start.ps1 check -ProjectName aster-acceptance-20261012 -Port 18088`
preflight measured available physical memory 6094 MiB but only **1167 MiB
commit headroom**, below the existing 2048 MiB protection threshold. Other
samples were around 600 MiB. No build ran concurrently with tests; after this
resource failure no forced build/restart was attempted. No paging/security
settings or unrelated processes were changed. Existing five services remain
healthy and the old homepage returns HTTP 200. PostgreSQL volume was retained.

### Deployment continuation / rollback

When authorized resources meet the gate, run the existing documented command
**without `-NoBuild`** to build current source and recreate the isolated stack:

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -ProjectName aster-acceptance-20261012 -Port 18088
```

Before doing so, retain the source hash manifest and inspect the resulting
image IDs versus running container `.Image` and mounted files. No latest-code
claim should depend solely on a reused tag. The wrapper actually supports
restart, NoBuild and the parameters shown; it does not support invented flags.

For rollback, the two preserved tags can be re-tagged to their original
`v1.1-dev` names, then `restart -NoBuild` recreates from those images while
retaining the database volume. Do not run `down -v` or delete volumes. Nothing
was deployed in this run, so no rollback was necessary or executed.

## UX01–UX16 current matrix

All live rows are **BLOCKED: latest-code deployment unavailable**. The passing
offline tests and four provider classifications cannot be relabeled E2E.

| ID | Source-level evidence | Live evidence |
| --- | --- | --- |
| UX01 transaction table | PASS observation/amount/row assertions; component paging/sorting | BLOCKED |
| UX02 category bar | PASS Decimal aggregator points | BLOCKED |
| UX03 trend | PASS effective range/partial coverage | BLOCKED |
| UX04 pie | PASS bank input values, no model override | BLOCKED |
| UX05 comparison | PASS observed product rows | BLOCKED |
| UX06 service + assistance | PASS scripted runtime and separate component callbacks | BLOCKED |
| UX07 navigation only | PASS allowlist and deterministic PREPARE veto | BLOCKED |
| UX08 clarify missing slots | PASS scripted WAITING_USER | BLOCKED |
| UX09 prepare | PASS WAITING_CONFIRMATION, no fake debit | BLOCKED |
| UX10 multi-goal | PASS evidence/independent financial completion assertions | BLOCKED |
| UX11 card + navigation | PASS fixed cards service mapping | BLOCKED |
| UX12 malicious URL | PASS unknown service and note-text separation | BLOCKED |
| UX13 malicious RAG | PASS read-only request PREPARE denial | BLOCKED |
| UX14 financial consistency | Former failing oracle PASS; quality subcases PASS | BLOCKED |
| UX15 refresh | PASS Task checkpoint and component metadata restoration | BLOCKED |
| UX16 customer isolation | PASS runtime ownership + actual PG recovery ownership tests | BLOCKED |

## Remaining gates and honest limits

- New Web/Agent images must be built and deployed before browser assertions.
- No latest-code Playwright screenshots, actual UI/tool/Spring/DB combined
  traces or before/after real balance/intent comparison exist yet.
- Pending-action unrelated queries are preserved but deferred; same-task
  concurrent inquiry remains a limitation, not a passed capability.
- Exact long-context pronoun resolution and genuine multi-goal extraction
  completeness still need model/browser evidence.
- Spring source/contracts were not changed; another Spring/Testcontainers
  suite and Next production build were not started under the resource gate.
  Prior Spring/build passes remain historical evidence only.
- Four follow-up model decisions succeeded; financial request authorization,
  confirmation/revalidation/idempotency remain in existing deterministic bank
  boundaries. No live security zero-effect rate is inferred from fake debits.

Stop here. Keep the experiment flag and legacy page. Do not promote UX4/S1/R1
or enter any new feature phase on the basis of this partial evidence.
