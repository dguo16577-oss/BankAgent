# S1.1 low-memory acceptance plan

Date: 2026-10-14. Scope: `D:\BankProject-AGUI-20261012` only. The original `D:\BankProject` remains untouched.

## Browser case inventory and resume protocol

`python scripts/s1-low-memory-playwright.py --inventory` discovers exactly **98 unique Chromium cases** in 17 files. The [manifest](../../artifacts/s1-1-playwright/manifest.json) assigns stable IDs `PW001`–`PW098` and 13 batches of at most eight cases. The [results ledger](../../artifacts/s1-1-playwright/results.json) records each case, batch result, code/config fingerprint, report path and observed status. Batch JSON reports and stderr logs remain under `artifacts/s1-1-playwright/`.

Run `python scripts/s1-low-memory-playwright.py --batch N` for one batch or `--all` to resume unfinished batches. A batch already marked PASS is reused only when the fingerprint of Web source, E2E tests, Playwright config, package metadata and lockfile matches. Code or config changes reject old results; archive the previous results ledger before a new run. Each batch starts one mock Web server, sets `workers=1` and `fullyParallel=false`, runs only its named cases, then lets Playwright stop its server and browser context. No Spring clean verify or Next production build runs concurrently.

The runner checks free physical memory before each batch (default threshold 3500 MiB) and every two seconds while running. If free memory drops below 1800 MiB, it terminates only its own Playwright process tree and records `BLOCKED_LOW_MEMORY`. Other user processes are not stopped. The script does not modify paging files or system security settings. A failed batch stops `--all`; inspect its JSON/stderr and rerun only the failed batch on the same fingerprint. A batch interrupted without a complete JSON report stays `UNVERIFIED`.

All-batch PASS is valid as **batched** acceptance for a single code/config fingerprint; it is not a claim that 98 cases ran in one continuous process. The prior S1 mock run completed 10/98 before interruption and has no complete 98-case result. This S1.1 ledger supersedes that partial run for cases it actually completes.

**Final S1.1 result:** 13/13 batches and **98/98 unique cases PASS** on fingerprint `250a71bee495b90440e7b14125c126e92dadcaf9a3c25ede05473c716f9a85d7`. The [per-case report](s1-playwright-case-results.md) lists every ID, name, status and batch JSON. No low-memory stop occurred. Real Agent/Spring browser recovery remains a separate unverified scenario.

## Serial regression order

1. Run targeted Task Ledger, authorization, CSRF/isolation, MCP capability and RAG-boundary tests. Preserve bank state checks separately from model response checks.
2. Run Agent full tests against one disposable PostgreSQL container, then stop the test container and database. Review any skip instead of silently accepting it.
3. Reuse the unchanged Spring 211 unit + 426 Testcontainers result unless a Spring source/configuration change warrants a rerun. Keep a Java heap limit if rerun is needed.
4. Reuse unchanged Web 511-test, lint, typecheck, build and contract evidence unless Web source/configuration changes. Run necessary checks serially.
5. Run Playwright batches with one worker, one batch at a time. Preserve a per-case result and do not weaken assertions.
6. Run a real-model attack only in an explicitly approved outbound network. The current Docker internal network cannot reach DeepSeek; `ConnectError` before payload delivery is `MODEL_TEST_BLOCKED`, not a security pass.

## Acceptance accounting

Each case is `PASS`, `FAIL`, `UNVERIFIED`, or `BLOCKED_LOW_MEMORY`/`ENVIRONMENT_ERROR`. A passing code assertion without an authoritative bank-state oracle is insufficient for a financial invariant. The [remaining security matrix](../security/s1-final-gap-matrix.md) distinguishes implementation from testing and records blockers. R1 and S1 are judged separately; unresolved high-risk security cases keep S1 PARTIAL.
