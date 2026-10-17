# ADR 0019 — Frontend real backend integration

Status: accepted for M22. Date: 2026-09-29.

## Decision

Normal Next.js runtime uses the real Spring Backend. The browser calls configured `/customer/*` and `/public/*` APIs directly through one typed transport. There is no Next.js BFF/proxy, new endpoint or frozen contract change. MSW is restricted to tests and explicit mock mode; backend failures never trigger fallback.

Customer identity uses Spring's persistent server-side session transported by an HttpOnly cookie. Mutations retain CSRF protection: existing GET Session bootstraps the JS-readable XSRF cookie, and the transport sends its corresponding header. Login is not exempted. After login the client reads authoritative Session and refreshed CSRF state. Customer requests include cookies; anonymous Public requests omit them. Local CORS permits exactly localhost:3000 with credentials. Production policy is unchanged.

Customer cache lives in memory and is removed on logout/401; Public cache remains independent. Frontend route guards provide UX only. ActionAuthorization remains short-lived, intent/session/hash-bound flow state; it never globally elevates Session or enters persistent browser storage. User-confirmed execution retains the same key/request after an uncertain response. The transport never automatically retries a mutation.

Real E2E owns an ephemeral PostgreSQL container, real Spring and real backend-mode Next.js. Fixed E2E time is enabled only with local,e2e profiles; neither authentication nor CSRF is bypassed. The daily development volume is never a test target. Existing mock regression remains separate.

## Consequences

Development normally requires PostgreSQL and Spring on port 18080 in addition to Web on 3000. Public env settings are build-time Next.js values and require restart/rebuild. Direct browser cross-origin integration must preserve cookie/CORS/CSRF configuration. This milestone validates local HTTP competition Demo behavior, not production deployment, external authentication or live banking integrations. Stop at M22.
