# B3 — Scheduled Payments & Deterministic Execution

Status: COMPLETE. Required validation completed; rerun details are recorded below. Development remains v1.1-dev. Stop at B3.

## Scope and contract evolution

One-time future CNY payment create/list/detail/amend/cancel, deterministic internal execution and manual Payments workflows. No recurring transfer series, merchant mandates, risk thresholds or Agent.

| Snapshot                   | Customer | Operations | Canonical hash                                                   |
| -------------------------- | -------- | ---------- | ---------------------------------------------------------------- |
| M24 v1.0.0-demo, immutable | 1.9.0    | 39         | 602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5 |
| B2 v1.1-dev archive        | 1.11.0   | 47         | 9c57a2a135e1e3ac42f490b58c9b2bd9d183708b305c909db18076a843fcfead |
| B3 current                 | 1.12.0   | 52         | 6a153199be386850719e0903afdce3e1643acf2b9af0b3ec682e1c716fb2777d |

Public stays 1.2.0 / 9 operations, hash `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`. Current total is 61 PostgreSQL operations. B2/M24 counts describe different contract versions, not missing implementations.

Five new operations: listScheduledPayments, getScheduledPayment, prepareScheduleAction, getScheduleActionIntent, executeScheduleAction. Java/TypeScript interfaces are generated; no duplicate DTOs. Historical files remain separate from current freeze.

## Domain, persistence and authorization

ScheduledPayment is distinct from Transfer. States: SCHEDULED → EXECUTED / CANCELLED / FAILED. V9 adds scheduled_payments and scheduled_payment_intents, owner/resource FKs, positive NUMERIC amount, TIMESTAMPTZ due time, version, immutable snapshot, unique Transfer linkage, due/owner indexes and shared idempotency extension. Prior migrations are unchanged.

Create validates current funds/eligibility without reserving/debiting. Amount/time/recipient/note changes require fresh expectedVersion-bound review; source is fixed. Cancellation requires explicit review before due and retains history. All mutations bind customer/session/action/resource/hash. Same key/request returns original result. AAL2 grants, if supplied, are consumed atomically at confirmation; the durable mandate remains valid after logout without preserving a short-lived grant. No arbitrary policy thresholds.

API uses offset-aware dates. Web explicitly labels Asia/Shanghai +08:00. Creation requires future time; amendment/cancellation require now < dueAt; execution begins at now >= dueAt. Actual executedAt records catch-up time. No browser/server-local timezone inference.

## Deterministic execution and financial integrity

B1 selects local/test operator invocation of the injected-Clock application processor. No public/debug endpoint, automatic arrival SLA or distributed scheduler. The thin startup adapter can run once in a separate JVM; real E2E controls it outside HTTP.

Due processing revalidates ownership, source status, recipient status/destination/version, current available funds, immutable hash, fees and policy. It reuses TransferExecutionService.settle for debit/Transaction/Transfer, committing those artifacts and schedule/link in one PostgreSQL transaction. The B2 customer write lock coordinates immediate transfers and recipient changes; recipient → schedule → account locking follows within it. Unique financial references and terminal state prevent duplicate debit across processors/restarts.

Expected business failures become final FAILED with explicit reason and no debit/receipt. Infrastructure failures roll back to SCHEDULED for safe later processing. No automatic retries of business failure. Tests inject failures before Transfer, after debit and before final schedule commit, plus competing processors, immediate-transfer competition and recipient deactivation.

Spending stays unchanged for a fixed reporting window: future mutations create no transaction; due BANK_TRANSFER is excluded. Recurring, Cards and Wealth remain separate. Historical receipt snapshots survive recipient deactivation. Existing schedule state survives backend restart; browser reload persists detail, with packaged volume/restart regression.

## Manual workflow and parity

Payments → Scheduled → create → review → confirm → scheduled detail. Edit and cancel remain in that context. No Personal Center redirect. Scheduled detail does not claim a completed transfer. Executed detail links to its authoritative Transfer; cancelled/failed entries remain visible. Human create/edit/cancel match the customer APIs; infrastructure due execution is not an Agent primitive.

See [backend semantics](../backend/scheduled-payments.md), [Web workflow](../frontend/scheduled-payments-workflow.md) and [ADR 0022](../adr/0022-one-time-scheduled-payments.md).

## Verification

| Validation                                       | Result                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maven clean verify                               | 576 passed: 194 unit + 382 PostgreSQL integration; zero failures/errors/skips. Includes 24 B3 PostgreSQL tests.                                                 |
| Frontend Vitest                                  | 448 passed in 35 files                                                                                                                                          |
| Contract hash unit tests                         | 3 passed                                                                                                                                                        |
| Mock E2E                                         | 97 covered: 95 first-pass + 2 passed on corrected rerun; final time-display scheduled journey also passed. This is not one fresh 97-test run.                   |
| Real Backend E2E                                 | 18 passed, including two independent operator JVM runs with one debit and cancelled instructions unchanged                                                      |
| Packaged E2E                                     | 4 passed on the rebuilt images; create → named-volume down/up → same-session detail → amend → cancel, plus banking, backup/restore and B2 recipient regressions |
| pnpm build                                       | Passed for backend runtime                                                                                                                                      |
| pnpm lint / typecheck                            | Passed                                                                                                                                                          |
| OpenAPI generation / validation / current freeze | Passed; generated TypeScript/Java match Customer 1.12.0                                                                                                         |
| Historical contract hashes                       | M24, pre-B2 and B2 archives verified; Public unchanged                                                                                                          |

Existing tests are retained. Only contract-operation counts (47→52 Customer; 56→61 total) and Flyway count (8→9) were updated to the additive baseline. New tests cover exact due boundary, no funds reservation, two-processor concurrency, immediate/scheduled competition, deactivate/due competition, competing amend/cancel, failed settlement, multiple rollback points, restart persistence, V8 upgrade, mandate integrity and authorization consumption. Real Backend browser scenarios use an America/Los_Angeles browser timezone while asserting the explicit 09:00 Asia/Shanghai instruction.

Final local evidence logs: `b3-maven-final.log`, `b3-front-verified.log`, `b3-mock-e2e.log`, `b3-mock-retry.log`, `b3-mock-schedule-final.log`, `b3-real-verified.log`, `b3-packaged-final.log`, `b3-build-final.log`, `b3-lint-final.log`, `b3-typecheck-final.log`, `b3-contract-final.log`, `b3-archive-final.log`. Generated local test outputs are not source deliverables.

The packaged restore drill now restores its original database before later tests. Previously it left the stack connected to the restored database while the later restart used the original database, producing an invalid cross-database session check. The corrected full run retains the same-cookie assertion; no application security behavior was relaxed.

### Screenshots

- [Packaged desktop 1440px](../screenshots/b3-scheduled-packaged-1440.png)
- [Packaged narrow 390px](../screenshots/b3-scheduled-packaged-390.png)
- [Packaged narrow 320px](../screenshots/b3-scheduled-packaged-320.png)

Reviewed desktop and narrow images: labeled time, masked recipient, no debit/reservation claim, contextual modify/cancel and no horizontal overflow.

## Coverage and limitations

Observed map: SUPPORTED 20→22, PARTIAL 19→19, MISSING 19→17, OUT_OF_SCOPE 9, fixed total 67. SCHEDULED_TRANSFER and BUDGET_TO_SCHEDULE become supported. SCHEDULE_CHANGE becomes partial because source standing-order/recurring tasks remain outside one-time implementation. No projections are presented as benchmark outcomes; [mapping evidence](../research/b3-coverage-delta.md).

Known limits: synthetic demo destinations, CNY only, no reservation, weekends/holidays ignored, local operator required, no recurring bank series, no automatic retry of FAILED instructions, no approved amount/recipient-age risk thresholds, no Agent. M24.1 unresolved container vulnerability findings still block public deployment clearance. B3 does not resolve that security backlog.

STOP AT B3.
