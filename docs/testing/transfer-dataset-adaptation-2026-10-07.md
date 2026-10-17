# Transfer dataset adaptation and Agent acceptance — 2026-10-07

## Dataset decision

The external `BankAgent_dataset_v1` contains 4,000 Chinese synthetic transfer-related records: 1,000 `prepare_transfer`, 1,000 `correct_transfer_amount`, 1,000 `insufficient_funds`, and 1,000 `execute_confirmed_transfer`. Its `ready/` copies are re-exports and were not counted twice. The first three families are candidate material, not Aster end-to-end gold tests: they use fictional customers, account and beneficiary IDs, fees, and one template family per scenario type. The 1,000 execute records were excluded because their target gives the model an `execute_transfer` tool, which Aster deliberately does not register. Three authored challenge cases were also reviewed.

Eight records are now in [the adapted JSONL](../../research/agent-transfer/aster-transfer-eval-v1.jsonl). Every row contains the original source ID, split, license, and adaptation note. T01–T04 derive from simulated records, T05–T07 from authored challenges, and T08 is a new Aster ambiguity case. T05 replaces the source's one-yuan fee premise with an Aster-compatible insufficient-balance case; it is not a fee-boundary test. No original source label is used blindly. The source license recorded for adapted records is CC-BY-4.0 as provided by the external package; source provenance should remain attached if these records are redistributed.

## Real DeepSeek with in-process bank fixture

`python scripts/run-transfer-eval.py` called the real DeepSeek planner against Agent v2 and an in-process bank fake. It did not use a script to choose tools. The **historical first run** was **5/8 passed**, with zero unexpected fake-bank debits. The JSON artifact path has since been reused for the expanded 20-case suite; see [the repeat-run report](transfer-benchmark-20-2026-10-07.md) for its current contents. T07 intentionally confirms through the trusted fake-bank path, simulates a timeout after commit, retries with the same authorization/key, and observes exactly one debit.

| Case                         | Outcome           | Evidence                                                                                                                                                              |
| ---------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 preview wording          | FAIL              | The model returned an `ASK_USER` option not grounded in observed recipients. Registry rejected it as `UNOBSERVED_CHOICE`; zero debit.                                 |
| T02 preview                  | PASS              | `resolve_recipient → list_accounts → prepare_transfer → WAITING_CONFIRMATION`; zero debit.                                                                            |
| T03 amount revision          | PASS              | Two prepared intents; first cancelled before replacement; zero debit.                                                                                                 |
| T04 over balance             | FAIL              | Bank rejected the prepare, but Agent returned generic `PLANNER_OR_TOOL_FAILED` instead of `INSUFFICIENT_FUNDS`; zero debit.                                           |
| T05 below amount             | FAIL              | Same error-code loss as T04; zero debit. This is not the original fee-boundary test.                                                                                  |
| T06 changed confirmation     | PASS              | Old intent cancelled, new 200.00 intent prepared; zero debit.                                                                                                         |
| T07 timeout retry            | PASS              | Trusted fake-bank confirm recovered one receipt and exactly one debit. Model had no execute tool.                                                                     |
| T08 duplicate-name ambiguity | PASS on saved run | `WAITING_USER`, two choices, “第一个” resumed the same task and prepared the selected recipient. An earlier run failed, so model reliability needs repeated sampling. |

These failures remain visible; the Agent kernel was not changed to make the suite pass. The T01 response is safely blocked but not useful to the customer. T04/T05 preserve the financial invariant but lose a useful error code.

## Real Spring/PostgreSQL preview

`python scripts/run-transfer-real-preview.py` ran T02 and T03 against the current local Spring/PostgreSQL service with real DeepSeek: **2/2 passed**. The trace is [agent-transfer-real-preview-v1.json](../../artifacts/agent-transfer-real-preview-v1.json). T02 used three planner decisions and the same read/read/prepare sequence. T03 used six decisions across two turns, cancelled the old intent, then prepared a replacement. All created intents were cancelled and the account balance was unchanged. An initial smoke attempt failed due to the test script not refreshing CSRF after login; the script was corrected before this accepted run.

The real-backend smoke does not execute a transfer. T07's exactly-once result uses a fake bank; existing Spring transfer integration tests cover persistence and idempotency separately. This eight-case set does not establish generalization to phone recipients, historical-note resolution, scheduled transfers, or AA collection.

## Regression

`python -m unittest discover -s services/agent-runtime/tests -v`: **79 tests passed**. The nine-tool registry is unchanged; `execute_transfer` remains absent from model-visible tools. No Web or Spring source code was modified in this dataset task.
