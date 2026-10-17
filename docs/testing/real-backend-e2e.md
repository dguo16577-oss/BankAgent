# Real Backend E2E (M23)

## Run

Prerequisites: Docker Desktop engine healthy, Docker Compose, JDK 21 (`JAVA_HOME`), Node/pnpm and Playwright Chromium. Ports 3000, 18080 and 15432 must be free. The runner refuses occupied ports instead of stopping unrelated services.

```powershell
pnpm exec playwright install chromium
pnpm test:e2e:backend
```

Alternatively, use installed Edge: `$env:PLAYWRIGHT_CHANNEL='msedge'`. The verified Windows run uses this option. `M22_SKIP_PACKAGE=1` is a development shortcut only when the current JAR has already been built; normal runs package Spring first.

`scripts/real-backend-e2e.mjs` orchestrates:

1. Package Banking Core using JDK 21 and build production Next with an explicit backend origin while Spring is stopped; no auth bypass.
2. Start `infra/compose/e2e.compose.yml` with a unique Compose project, PostgreSQL 17, a project-scoped disposable volume, user/database `aster_e2e`, host port 15432.
3. Start Spring on 18080 with `demo,local,e2e`. Flyway and existing Demo seeds populate a fresh database. E2eClockConfiguration supplies fixed `2026-09-27T02:30:00Z` only when **both** local and e2e profiles are active. Normal local/default clocks remain unchanged.
4. Wait for PostgreSQL health and Spring `/actuator/health=UP`. The same runner owns Next.js production `start` backend-mode startup/readiness on 3000, enabling real process restart tests.
5. Run a serial browser journey. Service workers are blocked, authentication uses the real login form, cookies and CSRF. Financial mutations commit to the temporary database.
6. Stop the owned JVM and Next process and destroy this Compose project on success/failure/interruption. No retained developer database volume is mounted or reset. No reset HTTP endpoint exists.

## Assertions and artifacts

The main journey covers anonymous Public Home/Navigation/Catalog/detail/Support/detail/Rates/Offers/Search, login, Accounts, 61 initial transactions with opaque cursor pagination, Dining/detail, a ¥500 transfer to Zhang, card freeze and verified unfreeze, Netflix stop, detected Bookshop restrictions, unsuitable R3 product and suitable ¥1,000 R2 investment, final Overview and logout.

For the transfer, Playwright forwards the actual first execution to Spring, drops only its response, then forwards explicit retry with the original key. The resulting account balance proves no second debit. It does not synthesize a banking response.

Separate cases expire active sessions directly in the **temporary** database and verify the next Customer request redirects; anonymous Public still works. An unavailable-backend case aborts network access and asserts retry UI without mock data. Tests record Spring request paths/statuses and assert origin :18080, `fromServiceWorker=false`, exact CORS allow-origin and credential headers. Cookies, browser storage, session-query count and 320/390/1440 viewport behavior are checked.

Outputs:

- `test-results/backend-runtime/spring.log`: server lifecycle; no passwords/codes logged by application.
- `test-results/backend-evidence/network.json`: method/path/status/worker evidence, no bodies or cookies.
- `test-results/real-backend`: failure screenshots/traces (test traces can contain Demo inputs; keep them local and do not publish credentials).
- `docs/screenshots/m23-*.png`: real UI screenshots of transaction, transfer, step-up review, wealth and final overview at 390/1440px.

Expected fresh-state progression: Current 23842.31 → 23342.31 → 22342.31; pending 32.00; Portfolio 18320.00 → 19320.00; total CNY-equivalent deposits 36453.68 → 34953.68. Spending remains 4968.00, comparison 4800.00, +3.50%; stopping Netflix changes only future bank-side scheduling. Existing local databases may have earlier milestones' mutations and need not match this baseline.

## Regression commands

```powershell
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
$env:NEXT_PUBLIC_BANKING_API_BASE_URL="http://localhost:18080"
pnpm build
pnpm test:e2e:mock
pnpm test:e2e:backend
# services/banking-core, with JAVA_HOME=JDK21:
.\mvnw.cmd clean verify
pnpm contract:check
```

Build is validated with Spring stopped; browser query functions do not fetch during Next static generation. Run the mock and real suites sequentially because they own the same Web port. PostgreSQL Testcontainers in Maven remains a separate full backend regression.

## M23 recovery and viewport runs

The file-based infrastructure control channel lives under the runner's unique test-results directory. It supports only stopping/starting the owned Spring process, restarting the owned Next process, and stopping/starting this Compose PostgreSQL service. It is not an application endpoint. PostgreSQL retains its disposable volume during interruption; cleanup deletes it afterward.

Run the complete suite twice against separate fresh databases:

```powershell
$env:ASTER_E2E_WIDTH="1440"
pnpm test:e2e:backend
$env:ASTER_E2E_WIDTH="390"
pnpm test:e2e:backend
```

Screenshots temporarily change viewport and restore it. The financial journey itself therefore stays at the chosen width. Customer dates are also checked with a non-UTC browser timezone. Separate hardening tests cover all five widths, real empty and long-label database records, axe, keyboard activation/focus, cookie rotation, failed verification, request counts, actual process/database outages and timeout. Tests do not substitute banking API response bodies.

## B4 isolation options

`ASTER_E2E_WEB_PORT`, `ASTER_E2E_BACKEND_PORT` and `ASTER_E2E_BUILD_DIRECTORY` allow isolated ports/output when the normal developer instance is running. The B4 validation uses 3003, 18081 and target-b4. Maven's matching option is `-Daster.build.directory=D:\BankProject\services\banking-core\target-b4`; the default remains target. Only use M22_SKIP_PACKAGE=1 after that directory has been built from the current source.

The runner enables demo explicitly for customer simulated-SMS retrieval. Browser verification uses fresh SMS codes and the existing account password. B4 adds persistent application verification to both real and packaged suites. The packaged production check first proves zero seeded customers, then explicitly provisions test identity data to prove authenticated demo inbox denial and SMS-required 503 fail-closed behavior. No production provider is implied.
