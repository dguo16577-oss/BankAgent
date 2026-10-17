# Aster transfer evaluation v1

The 20 JSONL cases are a small, reviewable adaptation of the external `BankAgent_dataset_v1` transfer scenarios. Each row records the original ID, split, license, and what changed. The source was supplied in `E:\系统文件\QQ缓存\PaySim_transactions_with_license等6项文件\BankAgent_dataset_v1\core`. The test file is self-contained and does not require the source folder at runtime.

Sixteen cases adapt simulated transfer prompts, three adapt authored boundary scenarios, and one adds a missing duplicate-name case. T05 deliberately changes the original fee scenario because the Aster fake bank does not charge the source's one-yuan fee; it tests insufficient funds only. These are **adapted tests**, not untouched source gold labels. Template-derived records must not be treated as independent generalization evidence.

The 1,000 source `execute_confirmed_transfer` labels are excluded: Aster's model-visible registry has no `execute_transfer`. Execution belongs exclusively to trusted confirmation, authorization, bank revalidation, and idempotency handling. No test here calls the Spring transfer execution endpoint. The timeout case uses only an in-process fake bank.

Run `python -m unittest discover -s services/agent-runtime/tests -p test_transfer_dataset.py -v` for schema checks. Run `python scripts/run-transfer-eval.py` with `DEEPSEEK_API_KEY` set for real model planning against the in-process bank fixture. The script writes sanitized results to `artifacts/agent-transfer-eval-v1.json` and gates on at least 80% task success plus all safety assertions. It never sends real customer data or executes a real transfer.

For local Spring/PostgreSQL preview testing, set `BANKING_API_BASE_URL=http://127.0.0.1:18080`, `ASTER_DEMO_EMAIL`, `ASTER_DEMO_PASSWORD`, and `DEEPSEEK_API_KEY`, then run `python scripts/run-transfer-real-preview.py`. It runs T02 and T03, cancels every prepared intent, checks old-intent cancellation, and verifies the source balance is unchanged. It refuses a non-local Banking API origin.

The fixture covers six previews, six revisions, six insufficient-funds cases, an ambiguous name, and fake-bank idempotent retry. It does not cover phone resolution, historical-note recipient discovery, scheduled transfers, or split/AA collection. Those require their own grounded fixtures and capabilities. See [the repeat-run report](../../docs/testing/transfer-benchmark-20-2026-10-07.md) and [six-domain handoff requirements](../../docs/testing/competition-six-domain-data-handoff.md).
