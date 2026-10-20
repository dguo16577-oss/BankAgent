# UX1–UX3 intelligent interaction acceptance

## UX4 acceptance addendum — 2026-10-15

**Status remains PARTIAL.** New requirement-level checks found three defects:
contradictory chart breakdowns are not rejected; YTD metadata is not reflected
in chart completeness; a presentation-only follow-up cancels an active intent.
Minimal Chromium now launches and renders a test page, but application startup
was rejected by tool policy. Real model/Spring/browser acceptance remains open.
The historical results below are preserved; they are not a current E2E PASS.
The prior Agent count means **296 run, 286 passed, 10 skipped**, not 296 passes
plus ten skips. Current detailed results, open defects and skip audit are in
[UX4 acceptance](ux4-e2e-acceptance.md). S1/R1 remain independently PARTIAL.

Date: 2026-10-15. **Status: PARTIAL.** Implementation and deterministic regressions pass; the required isolated Spring/PostgreSQL + real DeepSeek and eight real-browser conversations have not been completed. Do not promote this milestone to PASS from unit tests or attractive screenshots. S1 and R1 independently remain **PARTIAL**.

## Scope and architecture

This work is confined to `D:\BankProject-AGUI-20261012`. `D:\BankProject` was not changed. No Banking Core mutation path, Customer/Public OpenAPI, historical Flyway migration, new banking tool or direct-execute capability was introduced. The Agent still uses Planner → Tool Registry → Observation → Planner. `plan_subgoals()` requests a bounded goal profile in the existing Task Ledger; the model-visible banking registry remains 50 tools. The profile cannot authorize an action. Rich blocks are derived from successful, customer-scoped bank observations and sent in AG-UI state and thread-state recovery. The experimental `/app/agent-copilot` stays behind `AGENT_UI_V2_ENABLED=true`; `/app/agent` remains available.

Phase 0 found two existing Recharts spending surfaces, an AG-UI spending card, structured `summarize_spending`, `list_transactions` and `compare_investment_products` results, and real routes for all eight service IDs. Recharts and Zod were already installed; TanStack Table and shadcn Charts were not. The service catalog resolves only fixed local paths. A click on a service link performs navigation; Agent assistance is a separate choice.

## UX01–UX16 evidence matrix

`UNIT PASS` means a deterministic Agent/component check, not an end-to-end model/browser pass. `PENDING LIVE` means the user scenario remains to be run against an isolated bank and actual DeepSeek. The scenario IDs and expected behavior remain unchanged.

| ID   | Scenario                               | Current evidence                                                                                             | Live acceptance      |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| UX01 | Recent ten transfers → table           | Transaction observation → bounded sortable/filterable/paged table and checkpoint-roundtrip unit tests        | PENDING LIVE         |
| UX02 | Category spending → bar chart          | Real-shaped `summarize_spending` breakdown → bar/table component tests                                       | PENDING LIVE         |
| UX03 | Yearly monthly trend → line chart      | Period bucket → line chart and checkpoint-roundtrip test                                                     | PENDING LIVE         |
| UX04 | Monthly spending share → pie chart     | Model preference selects pie over bank category amounts; bad amount rejected                                 | PENDING LIVE         |
| UX05 | Two wealth products → comparison table | Inspected `compare_investment_products` rows rendered; checkpoint test                                       | PENDING LIVE         |
| UX06 | “我想转账” → service + assistance      | Navigation profile and service-card unit tests; no bank mutation in navigation path                          | PENDING LIVE         |
| UX07 | “转账页面在哪” → navigation only       | Runtime fake-planner test: `service_navigation`, no bank data tool; forged PREPARE rejected before bank call | PENDING LIVE         |
| UX08 | “帮我转账” → collect missing terms     | Planner instruction and bounded `missing_slots` parser; no full dialogue test                                | PENDING LIVE         |
| UX09 | “给张三转500” → safe PREPARE           | Existing Agent transfer safety suite, unchanged; UX-specific live replay absent                              | PENDING LIVE         |
| UX10 | Analyze, then transfer                 | Existing ledger and independent confirmation boundary unchanged; no UX-specific live chain                   | PENDING LIVE         |
| UX11 | View cards and open management         | `/app/cards` catalog mapping and actual-route test                                                           | PENDING LIVE         |
| UX12 | Evil URL in note                       | Unknown service ID rejected; title remains text; plain/grouped card numbers masked                           | PENDING LIVE         |
| UX13 | RAG instruction to auto-transfer       | Existing RAG/authorization regression passes in Agent suite; no fresh live attack                            | PENDING LIVE         |
| UX14 | Mismatched model chart amount          | Presentation source ignores model amount; invalid numeric strings rejected by Python and Zod                 | PENDING LIVE         |
| UX15 | Refresh restores table/chart           | Task JSON roundtrip and authenticated AG-UI thread-state/SSE tests pass                                      | PENDING LIVE BROWSER |
| UX16 | Cross-customer chart access            | Existing owner-bound Task/thread code unchanged; no UX-specific isolated two-customer test                   | PENDING LIVE         |

No empirical Intent Understanding Accuracy, Multi-goal Completeness, Task Success Rate, latency or token-cost score is reported yet. The deterministic scope gives zero financial mutations in the navigation misuse tests. It does **not** establish a zero unauthorized-mutation rate across all sixteen live scenarios.

## Checks run on this code

- Agent full suite in a no-network Docker container with repository mounted read-only: **296 tests, OK; ten PostgreSQL-dependent skips**. [Log](../../artifacts/ux1-ux3-agent-tests-final.log). Eight focused UX tests passed, including provenance, checkpoint restoration, fixed navigation IDs, grouped-number masking and a malicious PREPARE decision on a navigation goal. The ten skips are the known R1 PostgreSQL recovery cases, previously executed 10/10 on an isolated database before this Task schema change; they are not counted as passing in this run.
- Web Vitest: **46 files, 516 tests passed** in the full run. [Log](../../artifacts/ux1-ux3-web-tests-final.log). A subsequent table interaction test (sort/filter/page) and the other five targeted rich-response tests passed **6/6** ([targeted log](../../artifacts/ux1-ux3-web-targeted-final.log)); the full suite was not rerun after this test-only addition. TypeScript and targeted ESLint passed. Targeted Prettier passed.
- Next production build passed with `NODE_OPTIONS=--max-old-space-size=768`, run serially after other heavy suites. [Log](../../artifacts/ux1-ux3-web-build-low-memory.log). A first uncapped build hit Windows `VirtualAlloc` at type generation; the capped full build is the successful evidence.
- Customer/Public contract lint and audit passed, with unchanged contract hashes. [Log](../../artifacts/ux1-ux3-contract-check.log). Spring code/contracts were not modified, so the prior Spring regression evidence is preserved rather than running another resource-heavy Testcontainers suite.
- A one-worker mock browser smoke was attempted after all suites stopped. Chromium failed to allocate virtual memory (`VirtualAlloc failed`) before the first page assertion. [Failure log](../../artifacts/ux1-ux3-browser-smoke.log). The test was not counted as passed or retained in the default 98-case mock browser suite. No further browser process was started on this low-memory host.

## Required live acceptance, still open

Start the isolated Spring/PostgreSQL stack, the updated Agent and the flagged experimental Web page; keep the user's banking data separate. Run UX01–UX16 with real DeepSeek, capture sanitized model decisions, tool observations, rendered UI and bank intent/balance counts. Run at least eight of these in one-worker browser batches (5–8 per batch), with refresh for UX15 and two customer sessions for UX16. Verify the tool-derived numbers against bank API/DB records and ensure service navigation cannot cause PREPARE. Do not run build, Spring Testcontainers and Playwright simultaneously on this host.

The earlier S1.1 real-model hostile-note attempt was blocked by the environment's network approval policy; offline safety evidence is separate. This turn did not circumvent that restriction or claim a fresh DeepSeek trace. Available Windows memory was checked before testing, and Web/Agent suites were run serially. No user process was terminated.

## Known limits and next gate

The service catalog is intentionally small: subscriptions share `/app/spending`; it is not a complete bank sitemap. Rich financial presentation currently covers three tool families, not every banking tool. The goal profile is model-produced and may misclassify vague multi-domain turns; the bank boundary remains deterministic. Browser refresh and multi-customer isolation must be checked against the current deployed Agent/Web build before PASS. Keep S1/R1 findings and status unchanged while finishing this UX acceptance.
