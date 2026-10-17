# Smart Transfer 20-case pilot — repeated DeepSeek acceptance

Date: 2026-10-07. Scope: **implemented name-based transfer**, amount revisions, insufficient funds, duplicate-name clarification, and trusted fake-bank timeout retry. This is not an acceptance claim for phone, historical-note recipient, scheduled transfer, AA collection, or all six contest categories.

## Dataset

[The self-contained JSONL](../../research/agent-transfer/aster-transfer-eval-v1.jsonl) has 20 cases: six preview, six amount-revision, six insufficient-funds, one timeout/idempotency, and one duplicate-name ambiguity. Sixteen cases adapt the external package's generated scenarios, three adapt its authored challenges, and one is new. Eighteen source records were marked `test`, one `train`, and one is project-authored; **these source labels do not make this Aster adaptation a locked independent holdout**. Most examples still share a small number of templates. The 1,000 source cases that expose `execute_transfer` to the model remain excluded.

## Changes made after the first pilot

- The v2 runtime now returns the allowlisted `INSUFFICIENT_FUNDS` bank error code, while all other bank/tool failures still fail closed with a generic code. A unit test checks no debit.
- The planner instruction explicitly requires an observed recipient ID, uses a unique resolved recipient for preparation, and restricts ambiguity options to observed candidate IDs. Runtime grounding validation remains unchanged.
- A transient model connection/read timeout gets one bounded retry. The DeepSeek HTTP timeout increased from seven to fifteen seconds. No bank mutation is retried by this change, and no execute tool was added.
- The evaluator reports task success and safety separately. It requires task success ≥80% and all safety assertions to pass. It records model version, dataset hash, planner calls, model HTTP attempts, tool names, errors and fake-bank debits without keys or cookies.

## Real DeepSeek results

All 20 cases were sent through the real DeepSeek planner and Agent v2 with an in-process bank fixture. The model saw the complete nine-tool registry. Before the timeout adjustment, [run 1](../../artifacts/agent-transfer-eval-v1-run1.json) passed 18/20 (90%) and [run 2](../../artifacts/agent-transfer-eval-v1-run2.json) passed 15/20 (75%); every failure was a DeepSeek `ConnectTimeout`, with zero unintended fake-bank debit. The 75% run did **not** meet the requested gate.

After the timeout/retry adjustment, [run 3](../../artifacts/agent-transfer-eval-v1-run3.json), [run 4](../../artifacts/agent-transfer-eval-v1-run4.json), and [run 5](../../artifacts/agent-transfer-eval-v1-run5.json) each passed **20/20 (100%)**. Runs 4 and 5 recorded three and two extra DeepSeek HTTP attempts respectively from transient retries. Their safety gate passed. [The current result](../../artifacts/agent-transfer-eval-v1.json) is run 5. These are repeated runs of the **same** small pilot set, not 60 independent examples and not an unbiased competition score.

T07's only debit was intentionally performed in the **fake bank** by the trusted confirmation path after a simulated timeout. It was exactly one debit and repeated confirmation returned the same receipt. All other cases had zero fake-bank debits. The model-visible registry remained nine tools with no `execute_transfer`.

## Real Spring/PostgreSQL boundary

[The local-backend smoke](../../artifacts/agent-transfer-real-preview-v1.json) passed T02 and T03 with real DeepSeek, Spring and PostgreSQL. Each planned through recipient resolution, account read and intent preparation. T03 cancelled the old intent before preparing a revised amount. The script cancelled all remaining intents; source balance before and after was equal. It does not perform a real transfer execution, so T07's exactly-once result is not a new PostgreSQL transfer acceptance test.

## Regression and limits

`python -m unittest discover -s services/agent-runtime/tests -v`: **81/81 passed**. The dataset validator checks unique IDs, provenance, allowed fixture kinds, no fictional source IDs and no model-facing execute instruction. The 20-case result reaches the requested 80% pilot gate, but only for the currently implemented transfer subset. The next formal benchmark needs independent human-reviewed phrasing, group-disjoint train/test splits, more recipients and customer states, and the missing Smart Transfer capabilities. Data collection requirements for all six contest categories are in [the handoff document](competition-six-domain-data-handoff.md).
