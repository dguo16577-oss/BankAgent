# Frontend → Spring / Agent 集成

## Runtime and local startup

The normal Web runtime is `backend`. For current Docker start/restart commands, use [START-README](../../START-README.md); the following describes optional local development. Browser requests go directly to Spring; Next.js serves the UI and does not proxy banking APIs. Current Customer 87 and Public 9 operation clients share `src/lib/api/client.ts` and generated OpenAPI types.

1. Start Docker Desktop and JDK 21. Start the retained development database:

   ```powershell
   docker compose -f infra/compose/postgres.compose.yml up -d --wait
   ```

2. In `services/banking-core`, start Spring with the local profile and port 18080:

   ```powershell
   .\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=demo,local' '-Dspring-boot.run.arguments=--server.port=18080'
   ```

3. In the workspace root, run `pnpm dev` (or `pnpm dev:backend`). Open <http://localhost:3000>. Local Demo credentials: `alex@aster.local` / `demo-password`. Use the currently configured password/verification flow; do not assume the old mock fixed code works against Spring. These are competition Demo credentials, not production credentials.

The workspace runner loads `apps/web/.env*` using Next.js precedence, then supplies `NEXT_PUBLIC_API_MODE=backend` and `NEXT_PUBLIC_BANKING_API_BASE_URL=http://localhost:18080` as development/type-generation defaults. Exported environment values override files. `pnpm dev:mock` explicitly selects MSW without Spring. Build/start default to backend but require an explicit API origin; no localhost fallback is supplied for those commands. Set public variables before building. Next.js inlines these values into browser code, so changing them requires a restart/rebuild. Direct Next CLI invocation must supply the backend base URL through its environment or `apps/web/.env.local`.

Unknown modes and missing/invalid backend URLs fail validation. A single trailing slash is normalized. Credentials, paths, query strings and fragments are rejected in the configured origin. There is no automatic fallback.

Backend mode never starts MSW. Before enabling consumers it removes Aster's legacy mock financial sessionStorage keys and unregisters only `mockServiceWorker.js`; an already-controlled document reloads before releasing API requests. Other service workers/storage remain untouched. Explicit mock mode retains existing Demo persistence for its test flows.

## Session, cookies and CSRF

Customer requests use `credentials: include`; anonymous Public requests use `omit`. GET requests carry AbortSignal and no CSRF header. Customer mutations read the JS-readable `XSRF-TOKEN` cookie and send `X-XSRF-TOKEN`. Missing tokens bootstrap with GET `/customer/session`; anonymous 401 is expected and still initializes the cookie. Concurrent bootstraps share one promise.

Login sends the frozen request, lets Spring rotate/create the HttpOnly SESSION cookie, then reads authoritative session state and fresh CSRF state. No token/session ID is read by JavaScript or stored in Web storage. Local cookies use SameSite=Lax, Path=/ and HTTP-compatible Secure=false; default backend policy remains Secure=true. Local CORS allows exactly `http://localhost:3000` with credentials and the CSRF/idempotency headers. Do not substitute 127.0.0.1 in only one side of this setup.

The shared `session` query has a 30-second stale time and no automatic retry. Route guards wait for it before mounting protected children. Spring remains the security boundary. A Customer 401 discards identity, Customer query data and mutation variables and redirects to login. A background Session failure also removes the query's retained previous identity. An in-memory identity revision rejects late responses from a cleared session; an old 401 cannot log out a newer session. Public queries survive. Logout submits CSRF, invalidates the real server session, clears Customer memory and uses SPA navigation. Domain 403 errors are not treated as logout. A security 403/INVALID_REQUEST refreshes CSRF state, reports the original error and waits for explicit retry; mutations are never automatically replayed.

ApiError retains HTTP status, frozen code, message, error kind and exposed `X-Correlation-Id`. Network errors show retry UI. There is no backend-error branch that imports fixtures or calls an MSW service.

## Cache and mutation rules

| Scope               | Query key prefixes                                                                                           | Success invalidation                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Identity            | session                                                                                                      | authoritative login GET; logout/401 clears Customer              |
| Accounts/read model | overview, accounts                                                                                           | Transfer/investment refresh both                                 |
| Transactions        | transactions + filters, transaction + ID                                                                     | Transfer/investment discard cursor pages and refresh details     |
| Payments            | recipients, transfer-intents, transfers                                                                      | cache receipt; refresh intent/accounts/overview                  |
| Cards               | cards, card-intents, card-actions                                                                            | refresh cards/overview/intent; discard step-up grants            |
| Security            | step-up + challenge ID                                                                                       | zero inactive GC; discard after terminal rejection or execution  |
| Spending/Recurring  | spending + filters, recurring, recurring-intents, recurring-actions                                          | refresh recurring/overview/spending; no client total subtraction |
| Wealth              | portfolio, wealth-products, wealth-product, risk-profile, suitability, investment-intents, investment-orders | refresh portfolio/accounts/transactions/overview/spending        |
| Public              | public + home/navigation/catalog/rates/offers/support/search                                                 | independent; preserved at logout/401                             |

Fees use Public reference content. Agent v2 uses the real tool loop, a separate same-origin server proxy and optional durable task storage; it is not an informational placeholder. See the [current architecture](../architecture/overview.md) for the boundaries and remaining acceptance gaps.

All execution buttons retain `confirm_<intentId>` for the immutable backend intent and exact request. Network retries and review reloads recover the original receipt with that key. A newly prepared intent has a new ID/key. Mutation retry is disabled. A definite authorization rejection discards the grant and requires verification again; an uncertain response keeps the original request for idempotent recovery. Authorization exists only in flow memory. Password/code fields and their mutation variables are cleared after submission; no persistent query cache or IndexedDB adapter is installed.

Amounts remain decimal strings; only formatting occurs in React. Fees, projected balances, risk direction, suitability, pending amounts and Spending totals all come from Spring responses. Transaction filters/search are part of the query key and URL, with opaque cursor pagination and abortable GETs. No frontend scanning of loaded transactions computes authoritative analytics.

## Boundaries and evidence

Current bank operation coverage is checked against the 87 Customer and 9 Public operations by the contract audit; historical counts are not current coverage. Agent proxy routes are separate from bank contracts. `pnpm test:e2e:backend` starts an isolated real system; see [E2E instructions](../testing/real-backend-e2e.md). Mock regression remains available with `pnpm test:e2e:mock`. Neither suite should attach to an already-running Web server.

This is a local competition Demo. Frozen `SIMULATED_AUTH` naming remains unchanged even though sessions now live in PostgreSQL. No production identity delivery, live financial connection or deployment is included. M23 hardening retains this integration architecture.

M23 adds a 20-second deadline covering response headers and bodies. Timeout/cancellation aborts transport. A 409 invalidates authoritative resources and disables the rejected confirmation; an uncertain network outcome retains its idempotency key for explicit retry. Security response headers and deployment limits are documented in [ADR 0020](../adr/0020-web-release-candidate-hardening.md).
