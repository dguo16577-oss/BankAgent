# B3 observed behavior coverage delta

Fixed denominator: 67 B0 families. B2 baseline: 20 SUPPORTED / 19 PARTIALLY_SUPPORTED / 19 MISSING / 9 OUT_OF_SCOPE. B3 implementation map: **22 / 19 / 17 / 9**. These are capability mappings, not benchmark model success rates or completed source-task counts.

| Family             | Before → after      | Evidence path                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCHEDULED_TRANSFER | MISSING → SUPPORTED | Schedule CREATE intent/action → Payments create/review → PostgreSQL deterministic due execution tests → real operator E2E. Specification-derived family; no executable source tasks claimed.                                                                                  |
| BUDGET_TO_SCHEDULE | PARTIAL → SUPPORTED | Existing Spending/account reads + Schedule CREATE. Aster-composed primitive workflow, not autonomous budget inference or Agent execution.                                                                                                                                     |
| SCHEDULE_CHANGE    | MISSING → PARTIAL   | Schedule AMEND amount/time/recipient, stale version protection → contextual edit/review → backend/RTL/shared E2E. B1 explicitly notes AgentDojo UserTask2/12/9 source clusters concern standing-order/recurring semantics; single-payment editing does not fully unlock them. |

RELOCATION_PAYMENTS remains partial (profile/recurring work missing). PAYMENT_RISK_ESCALATION remains partial (unapproved thresholds). Recurring bank series remain deferred. Existing B2 NEW_RECIPIENT_TRANSFER support is retained.

The machine map retains source refs and variant IDs verbatim from B2/B1. New evidence references application code, PostgreSQL tests, Web UI, RTL and real/shared E2E. Rerun `python research/banking-behaviors/scripts/b3_coverage.py`; outputs are `b3-family-capability-map.jsonl` and `reports/b3-coverage-statistics.json`, including input/evidence hashes. Test execution results are recorded separately in the B3 report. B0/B1/B2 source evidence is not rewritten.
