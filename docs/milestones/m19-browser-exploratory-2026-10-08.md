# M19 browser exploratory check — 2026-10-08

**Result: 7/10 passed, 3/10 failed.** This is a single real browser conversation using the local Web (`:3000`), Agent v2 (`:8001`), Spring (`:18080`) and a disposable PostgreSQL container. Alex's demo account was used. The database was seeded with 12 September CNY dining rows on card `••1937`, one CNY 2500 October dining row, and two CNY 22 October rows from **Repeat Cafe** one hour apart. The seed adds transaction history only; it does not debit balances. The browser tab remains open at `/app/agent` for review.

| # | Prompt | Browser result | Verdict |
|---|---|---|---|
| 1 | 我这个月钱都花哪了？ | October CNY 2544.00, 3 dining transactions; merchant totals CNY 2500 + 44. | PASS |
| 2 | 最近是不是吃饭花得有点多？ | Identified dining as all October spend and the CNY 2500 transaction as the main driver. | PASS |
| 3 | 尾号 1937 这张卡最近为什么掉钱这么快？ | Found card, CNY 2544 spend and anomaly signals, but attributed the two CNY 22 rows to **Browser Cafe**. PostgreSQL says **Repeat Cafe**. | **FAIL — wrong merchant attribution** |
| 4 | 今年哪个月花得最多？ | July CNY 5620, listed CNY monthly totals and kept USD 187 separate. | PASS |
| 5 | 帮我做个今年截至现在的账单总结。 | YTD report: CNY 33342, USD 187; categories, merchants, monthly amounts and anomaly signals. | PASS |
| 6 | 最近有没有看起来不太正常的消费？ | Identified the CNY 2500 amount and two CNY 22 signals as prompts for review, without a fraud conclusion. | PASS |
| 7 | 有没有可能重复扣款？ | Identified the one-hour-apart CNY 22 pair, but again called its merchant **Browser Cafe** instead of **Repeat Cafe**. | **FAIL — wrong merchant attribution** |
| 8 | 这个月跟上个月相比差多少？ | CNY 2544 vs 5088, difference -2544 (-50%). The response labels October as through 8 October, but compares that partial month with all of September; this should be made more prominent. | PASS with wording caveat |
| 9 | 刚刚说的那张卡只看餐饮。 | Correctly retained card `••1937` and DINING; October CNY 2544. | PASS |
| 10 | 再看看最近两个月。 | Returned **all-account/all-category** September–October CNY 7632. The follow-up should have retained card `••1937` and DINING; database total is **CNY 2664 across 15 rows**. | **FAIL — lost scope** |

## Database and safety checks

After all ten prompts, account balances and pending amounts matched the demo seed: `acc_current` CNY 23842.31 / 32.00 pending, `acc_savings` CNY 8200.00, `acc_usd` USD 621.32. `transfer_intents`, `scheduled_payment_intents`, `split_action_intents`, and `transfers` all contained **0** rows. The page showed no transfer confirmation card during the analysis. The two repeated-charge rows both have `merchant_name='Repeat Cafe'` in PostgreSQL.

The UI showed “DeepSeek 辅助” for all ten replies. The page's step list included spending analysis, card lookup and anomaly checks. This browser pass checks visible behavior and database state; it does not claim exact model-call counts or per-turn structured decisions.

## Follow-up defects

1. The anomaly observation exposes transaction IDs and reason codes without transaction-level merchant names. On follow-up, the model appears to infer the merchant from an earlier aggregate and assigns the wrong name. Keep untrusted merchant text as data, but provide a grounded ID-to-merchant mapping if the reply names a merchant.
2. The last ellipsis-style follow-up did not retain the previously selected card and category. Resolve the carried-forward scope explicitly before invoking `summarize_spending`, or ask the user when the scope is genuinely ambiguous.
3. A partial current month versus full prior month can mislead even when the arithmetic is correct. State that the periods differ in length or offer a matched-day comparison.

M19's prior automated and isolated real-model test results remain recorded in [the milestone report](m19-bill-analysis-agent.md). This additional browser check is **not** a clean end-to-end acceptance; the three defects above remain open.
