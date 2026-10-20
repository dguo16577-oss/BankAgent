# UX4 browser environment and resource gate

## UX4.6 actual browser/deployment update

Latest Web/Agent production images successfully deployed after one Docker WSL
engine EOF failure and automatic engine recovery. One sandboxed headless Chromium
context at a time exercised actual port18088, real demo authentication, model/tool
conversations, trusted navigation, refresh and two-customer rejection. Browser
was closed before serial regression. New functional failures were recorded;
this does not establish all sixteen cases passed. See
[UX4.6 report](../milestones/ux4-6-deployment-e2e-acceptance.md), with screenshots,
AG-UI traces, DB invariants, image IDs and deployment resource caveats.

## UX4.5 update — 2026-10-15

Existing Docker services have since restarted successfully on port 18088,
but still use old images. Current source fixes cannot yet be live-tested:
deployment preflight measured 6094 MiB free physical memory but only 1167 MiB
commit headroom, below the 2048 MiB startup/build safety budget. No browser or
build was forced while resources were constrained. Four real DeepSeek
provider-only interpretation cases now pass through the existing container
network/secret path; no network setting was changed. They are not integrated
browser results. Ten real PostgreSQL TaskStore tests now pass separately.
See [UX4.5 report](../milestones/ux4-5-final-acceptance.md). Historical rejection
and allocation records below are preserved, not erased or reclassified.

Date: 2026-10-15. Workspace: `D:\BankProject-AGUI-20261012`.
Original `D:\BankProject` was not changed. **Application E2E: BLOCKED.**

## VirtualAlloc diagnosis

The first recorded snapshot had 5,275 MiB available physical memory, but
32,308,527,104 committed bytes against a 32,997,101,568-byte commit limit:
only 688,574,464 bytes (about 657 MiB) of commit headroom. Other samples in
this session reached about 32.8 GB committed. Free RAM alone is an unsafe
criterion for starting the entire test stack.

Windows is 64-bit; the test Node is x64 v24.19.0 and Playwright uses
`chrome-win64`. The system-managed `C:\pagefile.sys` was allocated 15,359 MiB;
current use was 3,480 MiB and peak use 4,774 MiB. The largest observed private
allocations included WSL, Edge, UDisplay and existing applications. These
observations support commit pressure as the likely cause of the historical
allocation failures; they do not prove the exact allocation that failed in
the previous run. No dump was available to attribute that allocation.

No user process was killed. No paging-file, system-memory or browser-security
setting was changed. Docker was reachable, but only unrelated existing
containers were running; no isolated banking/Agent stack was listening on
the inspected banking ports. Full Spring/build/browser jobs were not run
concurrently.

Evidence: [initial snapshot](../../artifacts/ux4/environment-before.json),
[later snapshot](../../artifacts/ux4/environment-after.json),
[historical browser failure](../../artifacts/ux1-ux3-browser-smoke.log).
Process memory snapshots are point-in-time diagnostics, not per-process
peak-memory measurements for a complete E2E run.

## Smallest browser test: PASS

`scripts/ux4-chromium-smoke.mjs` launches a single headless Chromium with
`chromiumSandbox: true`, creates one context and one page, checks an in-memory
HTML `<main>` assertion, then closes the context and browser in `finally`.
It does not start Next, access the bank, or bypass authentication.

Run from the workspace with the installed Node:

```powershell
node --max-old-space-size=128 scripts/ux4-chromium-smoke.mjs
```

Chromium 153.0.8010.12 launch and page assertion passed at
2026-10-15T09:00:17Z. See [JSON](../../artifacts/ux4/chromium-smoke.json) and
[log](../../artifacts/ux4/chromium-smoke.log). This recovers the minimal
browser gate only. It is not a screenshot or test of the banking application.

## Application page gate: POLICY_APPROVAL_BLOCKED

The tool rejected the ordinary command to start the existing production
frontend on `127.0.0.1:13004`, using `scripts/web-runtime.mjs start`,
`AGENT_UI_V2_ENABLED=true`, backend mode and a 192 MiB Node heap cap.
It returned `blocked by policy`, without a specific reason, before process
execution. There is no Next startup log or application-page assertion from
that attempt. The rejection is a tool event in this conversation, not a
fabricated application log. No Python/Shell wrapper, alternate launcher or
network route was used to evade it.

This is separate from the memory gate and from the historical S1 model
network rejection. No fresh real DeepSeek request was made in this UX4 run.

## Reproducible continuation on an authorized independent host

Use an authorized test host with a copy of this workspace and the source
hashes in [manifest](../../artifacts/ux4/source-manifest.json). A suggested
minimum is 16 GB RAM with at least 6 GB **commit headroom**, not just free
physical memory; 24–32 GB RAM gives more room for the existing stack. These
are planning budgets, not measured minimum requirements.

1. Provision disposable PostgreSQL/Spring data and two test customers. Never
   use the original project's database. Load the existing test fixtures and
   record bank balances, prepared/executed intents and ownership before tests.
2. Configure provider credentials via the host's approved secret mechanism.
   Keep keys, sessions and full account/card numbers out of artifacts.
3. Start the existing Agent and flagged experimental Web build through the
   host's approved service mechanism. Check health and exact build/source
   hashes. No approval denial may be worked around with another command.
4. First run the minimal Chromium script, then one authenticated experimental
   page. Use one browser worker, `fullyParallel=false`, one context at a time.
5. Run UX01–UX05, UX06–UX10, UX11–UX16 in separate sequential batches; close
   contexts in `finally`. Check commit headroom before each batch and stop on
   resource errors. Never overlap Next build or Spring Testcontainers.
6. For each case retain sanitized real model decisions, tool results, page
   assertions/screenshots, task ID and before/after database queries. Separate
   service navigation, assistance acceptance and transaction confirmation.
7. Set `R1_TEST_DATABASE_URL` only to the disposable database, then run the
   ten recovery tests. They use real PostgreSQL TaskStore but a fake bank;
   they do not replace Spring financial-state verification.

No independent host has been provisioned or tested in this run. This is a
continuation proposal, not permission to change the user's system settings.
