# M19 — Bill Analysis Agent

**Status: FINAL PASS after M19.1 (2026-10-09).** This milestone covers read-only consumption classification, deterministic anomaly signals, monthly reports, and year-to-date reports. The original M19 automated acceptance passed on 2026-10-08, but a later browser exploration found three defects and scored **7/10**. [M19.1 Conversation Grounding & Analytical Context](m19-1-conversation-grounding.md) records the fixes, the separate 10/10 browser rerun, and 8/8 real-DeepSeek CTX/FACT regression. Work stops at M19.1. The separate M18.6 100-case Smart Transfer benchmark is **DEFERRED**; its failed pre-registration remains recorded in [the original benchmark report](m18-6-smart-transfer-benchmark.md).

## Architecture and tools

Agent v2 continues to use `DeepSeek → Tool Registry → observation → DeepSeek`. The model sees 20 registered tools, one more than before M19. The only new model-visible tool is `detect_transaction_anomalies` (`ANALYZE`, `LOW`, no side effect). It has no execute, arbitrary HTTP, SQL, or admin capability. `summarize_spending` remains the sole spending aggregation tool and now accepts optional `category`, `bucket_by=NONE|DAY|WEEK|MONTH`, and a paired comparison interval. Its output includes `total_outflow`, `totals_by_currency`, `transaction_count`, `category_breakdown`, `top_merchants`, `period_breakdown`, and deterministic `period_change`. `list_accounts`, `list_cards`, `get_card`, and `list_transactions` are reused for scope selection and transaction inspection.

Both analysis tools read the authenticated customer's `/customer/transactions` pages with `status=COMPLETED` and `direction=DEBIT`. They include only `CARD_PAYMENT`, `DIRECT_DEBIT`, and `FEE`, excluding ordinary transfers and pending, failed, reversed, or income records. Customer OpenAPI and its freeze hashes were unchanged. Results are currency-separated; no FX conversion or cross-currency sum is performed. Monetary values use `Decimal` and decimal strings. DAY, ISO WEEK, and MONTH buckets use UTC+08:00. An unfinished year is reported as YTD.

The shared reader treats cursors as opaque, rejects repeated cursors and duplicate transaction IDs, and splits internal ranges to respect the bank's 366-day query limit. It stops with an explicit error above 200 pages or 10,000 records instead of returning a partial report. Merchant names remain `UNTRUSTED_EXTERNAL_DATA`. M19 originally returned anomaly transaction IDs and reason codes without merchant text; M19.1 added exact untrusted merchant and category fields so the model can attribute a signal to its source row. A deterministic veto rejects financial PREPARE calls during a read-only user turn; it does not choose a business intent or tool.

## Anomaly rules and limits

For each candidate transaction, the tool uses earlier completed consumption in the same currency from the preceding 90 days. Fewer than 10 prior rows yields `INSUFFICIENT_HISTORY` for pattern analysis and no manufactured score. A large-amount signal requires at least 10 same-category peers and an amount at least three times the median and above median plus six scaled median absolute deviations. A canonicalized merchant name absent from the baseline yields `NEW_MERCHANT`. Same canonical merchant and amount within 0.01, inside six hours, yields `POSSIBLE_DUPLICATE_CHARGE`. Eight or more prior transactions within 24 hours yields `UNUSUAL_FREQUENCY`. `UNUSUAL_TIME` requires 20 prior rows and no prior transaction within two hours of the candidate's local hour. The tool does not infer location, fraud, theft, or a refund entitlement. These are review signals, not bank fraud decisions. Sparse history and recurring same-merchant activity can still affect signal quality.

## Acceptance evidence

The deterministic BA01–BA20 suite is in [test_m19_bill_analysis.py](../../services/agent-runtime/tests/test_m19_bill_analysis.py). It covers total spend, categories, card and account scope, monthly buckets, YTD, category filters, per-currency merchants, exact decimal comparison, large/new/duplicate signals, insufficient history, clean history, malicious merchant and note text, multi-currency separation, card follow-up grounding, and zero financial effects. Two additional tests cover hostile-planner PREPARE rejection and a repeated cursor. **22/22 passed** in the focused suite; the full Agent suite passed **186/186**.

The isolated Spring/PostgreSQL + real DeepSeek run passed **9/9** cases: BA02, a September monthly report, BA06, BA07, BA10, BA11, BA13, BA16, and BA19. Its [sanitized trace](../../artifacts/m19-bill-analysis-deepseek-smoke.json) includes model decisions, tool observations, per-case model call counts, and before/after database snapshots. Across these nine cases, the model made 25 HTTP completions; all tasks reached `SUCCEEDED`, selected the required tools and arguments, made zero PREPARE decisions, created no active ActionIntent, and left the account digest, intent counts, and transfer count unchanged. The monthly report and BA07 each combined summary and anomaly tools; BA19 reused the previously observed card ID in the same task. BA16 exposed hostile merchant text through the summary observation and did not prepare a transfer. The duplicate-charge rerun showed only the two one-hour-apart charges as a possible duplicate pair.

Spring `clean verify` passed **407/407** tests including Testcontainers PostgreSQL. Web tests passed **499/499** plus three contract-hash tests. `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm contract:check` passed after final formatting. Customer contract revision **1.23.1** and Public revision **1.2.0** remain unchanged.

## Web presentation and exploratory prompts

The existing Agent Workspace shows translated steps for “Analyze spending” and “Check unusual transactions,” with no financial confirmation card for a completed analysis. Reports appear as sectioned model text grounded in tool values. Suggested questions now include category analysis, monthly trend, and anomaly checking. The Web test verifies the anomaly step and absence of a transfer confirmation.

For browser exploration in a logged-in demo session, use these ten prompts in order; the ninth and tenth deliberately depend on preceding context:

1. 我这个月钱都花哪了？
2. 最近是不是吃饭花得有点多？
3. 尾号 1937 这张卡最近为什么掉钱这么快？
4. 今年哪个月花得最多？
5. 帮我做个今年截至现在的账单总结。
6. 最近有没有看起来不太正常的消费？
7. 有没有可能重复扣款？
8. 这个月跟上个月相比差多少？
9. 刚刚说的那张卡只看餐饮。
10. 再看看最近两个月。

All ten prompts were subsequently executed in one logged-in browser conversation on 2026-10-08. The [browser exploratory record](m19-browser-exploratory-2026-10-08.md) reports **7 passes and 3 failures**: two wrong merchant attributions and a final follow-up that lost card/category scope. The earlier automated M19 acceptance remains as stated above; this additional browser check found open end-to-end defects.

On 2026-10-09, M19.1 reran the same prompts three times in single browser conversations and scored **10/10** each time, including a final run after the Core, Agent, and Web restarts. The 1937 card's duplicate signal named `Repeat Cafe` exactly; the October-vs-September answer warned about 9-day MTD versus a complete 30-day month; and the final two-month follow-up retained card `••1937` plus `DINING`. The [M19.1 report](m19-1-conversation-grounding.md) preserves the original failed run and describes the grounded facts, analytical scope, and deterministic period metadata. Its [sanitized real-DeepSeek trace](../../artifacts/m19-1-grounding-deepseek-smoke.json) covers CTX01–05 and FACT01–03 with unchanged financial database state.

## Known limitations

- Anomalies are deterministic heuristics over available history, not verified fraud findings. No location signal is attempted.
- The report text is composed by DeepSeek from trusted numeric observations. The tools calculate monetary totals and differences; wording can still vary between runs.
- The Agent task context is in-process. Bank reads remain customer-scoped, but chat state does not survive Agent process restart.
- The 100-case M18.6 Smart Transfer benchmark remains deferred and is not counted as an M19 pass.
