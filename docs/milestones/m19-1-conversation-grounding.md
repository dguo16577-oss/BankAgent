# M19.1 — Conversation Grounding & Analytical Context

## Status and scope

M19.1 addresses three defects found during the original M19 browser exploration: a merchant name from an anomaly observation was reassigned to another transaction, an analytical follow-up dropped its card/category filters, and a partial current month was compared with a complete prior month without a coverage warning. The original **7/10** browser result remains recorded in [the exploratory report](m19-browser-exploratory-2026-10-08.md). This report records the corrective run separately.

No tool was added; the model-visible registry remains at **20**. The anomaly rules, Customer OpenAPI, frozen contracts, and financial execution boundary were not changed.

## Changes

### Grounding of factual answers

The Context Builder now exposes bounded facts extracted from successful tool observations with `fact_id`, field, exact value, and source tool. DeepSeek is instructed to copy factual merchant, card, account, transaction, category, and amount values. Before an analytical `COMPLETE`, the Runtime checks referenced masked suffixes and monetary values against observations and checks transaction–merchant and merchant–amount pairings. Merchant labels paired with an observed amount in transaction-style bullet rows must match an observed merchant exactly. An unsupported answer receives at most one model repair attempt; a second unsupported answer fails closed with `UNSUPPORTED_FACT`.

The root cause was free-form final-answer synthesis: the earlier anomaly result lacked an exact merchant in its model-facing row, so the model could attach the merchant from a nearby result to the duplicate transaction. Anomaly rows now carry `merchant_untrusted` and `category`, still marked as untrusted bank data. The anomaly detection algorithm is unchanged. The validator is deliberately bounded; it is a guard on observed facts, not a general natural-language truth prover.

### Analytical conversation scope

The Task stores the last successful read/analysis filters: observed account/card ID, category, merchant/search, transaction direction/type, currency, and date range. For subsequent analytical tool calls, omitted, null, or blank fields inherit their prior value. The planner may explicitly remove a filter with `scope_clear` when the user asks for all values; a new card drops an incompatible inherited account. Canonical account/card IDs still pass the existing Registry provenance checks. Financial tools do not receive analytical filters.

The prior loss happened because completed read tasks were treated as finished answers without a durable query scope. A new user turn could also be answered directly from the previous observation, leaving the requested filter change unapplied. Now a completed analytical task continues in the same conversation, and its next turn must obtain a fresh read/analysis observation before `COMPLETE`. The model chooses the tool; the Runtime only refuses an answer based solely on the old turn's data.

### Partial-period comparisons

`summarize_spending` now returns `period_coverage` and comparison metadata (`left_period`, `right_period`, `coverage_comparable`). UTC+08:00 determines the number of covered days and whether the period is unfinished. The planner must describe unequal coverage. The Runtime appends a deterministic MTD warning when a comparison combines periods with different coverage, so a model omission cannot silently turn 9 days versus 30 days into a full-month trend claim.

## Browser regression

On 2026-10-09, the ten prompts from [the M19 report](m19-bill-analysis-agent.md) were run in order in **one logged-in browser conversation** against local Spring/PostgreSQL and DeepSeek. The first corrective run was **10/10**; a second complete run after narrowing the scope-null handling was also **10/10**. The key observed answers were:

| Prompt                       | Observed result                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1–2 monthly spend and dining | October CNY 2,544.00 from 3 completed consumption rows; Browser Cafe CNY 2,500.00 and Repeat Cafe CNY 44.00.                   |
| 3 card 1937                  | Exact `Repeat Cafe` on the two CNY 22.00 rows; large Browser Cafe row attributed correctly.                                    |
| 4–5 annual trend/report      | July CNY 5,620.00 was the largest complete CNY month; annual YTD report kept currencies separate and included anomaly signals. |
| 6–7 anomaly and duplicate    | `m19_browser_dup_b` was tied to `Repeat Cafe`, CNY 22.00, as a possible duplicate signal; no fraud conclusion.                 |
| 8 month comparison           | October MTD 9 days versus complete September 30 days was stated explicitly; no complete-month decline claim.                   |
| 9–10 card follow-up          | Card `••1937` plus `DINING` remained active when the date range changed to the latest two months; CNY 2,664.00 over 15 rows.   |

The independent sandbox database had balance digest `56bc8d51281d5d08d44a8563c6cc80ed` before and after browser/model tests, with zero transfer intents, schedule intents, split intents, and transfers.

## Real DeepSeek CTX/FACT evidence

[The sanitized CTX/FACT trace](../../artifacts/m19-1-grounding-deepseek-smoke.json) records model decisions, tool results, effective final scope, model HTTP-call counts, and before/after financial-state digests. All **8/8** final cases passed against the isolated Spring/PostgreSQL bank:

| Case   | Result | Model calls | Evidence                                                                |
| ------ | ------ | ----------: | ----------------------------------------------------------------------- |
| CTX01  | PASS   |           5 | Card 1937 and `DINING` persisted; October changed to September.         |
| CTX02  | PASS   |           6 | Card/date persisted; follow-up called a fresh tool with `DINING`.       |
| CTX03  | PASS   |           5 | Switched to observed card 8821 while retaining category/date.           |
| CTX04  | PASS   |           5 | Explicit “all categories” cleared category only.                        |
| CTX05  | PASS   |           5 | Exact `Repeat Cafe` search and card survived a three-month date change. |
| FACT01 | PASS   |           3 | Possible duplicate was attributed to exact `Repeat Cafe`, CNY 22.00.    |
| FACT02 | PASS   |           2 | Card suffixes `••1937` and `••8821` matched the bank observations.      |
| FACT03 | PASS   |           3 | CNY 2,544.00 total and Repeat Cafe CNY 44.00 matched the tool result.   |

Initial real-model attempts and their failures are preserved in [the initial trace](../../artifacts/m19-1-grounding-deepseek-smoke-initial.json): an overly broad validator rejected heading labels as merchants, one request hit a DeepSeek connection/JSON response failure, and CTX02 initially reused a prior observation without applying its new category. These were not counted as passes. The narrowed merchant matcher and fresh-observation rule produced the final results above. A transient external-model/transport failure remains possible; it is not a financial side effect.

## Verification and limits

The deterministic CTX01–05 and FACT01–03 tests live in [test_m19_1_grounding.py](../../services/agent-runtime/tests/test_m19_1_grounding.py). They include null/blank scope retention, explicit category clearing, card replacement, exact factual pairings, mask and amount rejection, partial-period metadata, and financial-tool isolation. The complete real-model runner is [m19-1-grounding-smoke.py](../../scripts/m19-1-grounding-smoke.py); it requires the named disposable test database and only performs read/analysis actions.

The validator catches the supported observed-fact patterns but cannot prove every possible paraphrase in arbitrary prose. A merchant name mentioned without a transaction ID, amount pairing, or recognized factual label could escape deterministic matching. The model is instructed to exact-copy; unsupported recognized facts fail closed. Agent conversation scope is still in process memory and does not survive Agent restart. The deferred M18.6 benchmark is unaffected.

## Final validation

- Agent full suite: **197/197 passed** (`python -m unittest discover -s services/agent-runtime/tests -p 'test_*.py' -q`). This includes the existing name, phone, historical-note, scheduled-transfer, and AA tests; the new analytical scope test also verifies that `prepare_transfer` receives no analytical filters.
- Spring `clean verify`: **407/407 passed**, including PostgreSQL Testcontainers integration tests and Spotless. The running local Core JAR was stopped for the clean build and restarted afterward.
- Web: **499/499** Vitest tests and **3/3** contract-hash tests passed. `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; the local Web process was restarted after build.
- `pnpm contract:check` passed. Customer revision **1.23.1** has SHA-256 `159eab1e47b76e7f8f206186abb7267c3c3d3c8a3bcbd895573da3e40c1c0724`; Public revision **1.2.0** has SHA-256 `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`. Neither frozen contract changed.
- After the final Core, Agent, and Web restarts, the same ten browser prompts were run a **third** time in one conversation: **10/10 passed**. The sandbox financial state again matched the starting digest, with zero action intents or transfers.

**M19.1: PASS. M19 Bill Analysis: FINAL PASS.** No M20 work was started.
