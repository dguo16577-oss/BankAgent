# M18 DeepSeek timeout investigation (2026-10-08)

## Finding

The observed failures were **HTTP read timeouts**, not an observed insufficient-balance response. Agent v2 calls `DeepSeekPlanner.decide()`, which uses `DeepSeekClassifier._json_completion()`. Its `httpx.AsyncClient` had one 15-second timeout for connection, write, and response reads. The 68-case pre-registered pilot recorded nine `ReadTimeout` events. For all nine, the metering transport had received HTTP **200** response headers, then timed out while reading the response body. No model HTTP event in that run recorded 402 or 429. The logs do not establish whether provider-side inference latency or the network caused the slow response; they do establish that the local 15-second read limit ended these requests.

The original [68-case result](../../artifacts/m18-suite-run-history/a3eb8cb5e1f041d9a9432635830aaf61/result.json) remains **49/68 strict passes**, including 43/62 real-model cases and 6/6 injected-fault cases. Nineteen cases failed; fourteen have unknown financial-effect status because their shard did not provide complete database evidence. They must not be treated as passed. Some failures were consequences of shard aborts, and this investigation does not attribute every failed case to the same timeout.

DeepSeek documents 402 as insufficient balance and 429 as a rate-limit response: [error codes](https://api-docs.deepseek.com/quick_start/error_codes/). Its [rate-limit guidance](https://api-docs.deepseek.com/quick_start/rate_limit/) describes long-running responses and keepalive behavior. These references support distinguishing an HTTP error from a client-side read timeout; they do not identify the cause of any particular delayed response.

## Request chain and bounded change

`/app/agent` → Next `/api/agent/chat` → Agent v2 `/agent/chat` → `DeepSeekPlanner.decide()` → `DeepSeekClassifier._json_completion()` → DeepSeek HTTP API.

- Model HTTP timeout: 10 seconds for connect/write/pool, **90 seconds for read**. The planner still has at most one retry for connection/read timeouts. This is a bounded wait, not an indefinite retry.
- Next-to-Agent proxy timeout: 45 → **300 seconds**, so a legitimate multi-step tool loop is not cut off by the proxy before the bounded model calls finish.
- Isolated pilot client/subprocess limits were raised to match the model wait. Those limits affect evaluation only; they do not authorize any new tool or financial action.
- Agent and Web were restarted from the updated code. The frozen API, database schema, tool registry, action confirmation, and execution policy were not changed.

## Verification

- Agent unit tests: **160/160** passed. Web Vitest: **498/498** passed. Python syntax check and Web production build passed.
- Web `/app/agent`, Agent `/health`, and Spring `/actuator/health` each returned HTTP 200 after restart.
- A prospectively registered isolated PostgreSQL/Spring rerun of the two previously timed-out invalid-terms cases passed **2/2** with real DeepSeek. The [immutable result](../../artifacts/m18-suite-run-history/cb5e6b40518246c2a7a8d107bfc8f035/result.json) records five model HTTP calls, all HTTP 200 with token usage, and direct database verification for both cases. The prior failed 68-case result was not rewritten.
- A second prospective [six-case rerun](../../artifacts/m18-suite-run-history/1ed8f090717a40adaf087155532f5aee/result.json) passed **6/6** real-model cases, including invalid terms, recipient/amount corrections, injection safety, and currency-source boundaries. It recorded 17 model HTTP calls, all HTTP 200 with token usage. All six outcomes have direct database verification and known financial effects. This run uses the revised client and evaluator timeouts; it does not replace the original 68-case report.

These reruns show that the revised timeout works for these prompts. They do not yet prove that every previously failed case or the full M18 benchmark passes. M18.6 remains **PARTIAL** until its separate case-count, category, safety, and success-rate gates are met.
