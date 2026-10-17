# ADR 0020 — Web release candidate hardening

Date: 2026-09-29. Status: accepted.

## Decision

Freeze the existing Web + modular Spring Boot + PostgreSQL design for the Aster Bank Web RC1 competition Demo. Do not change frozen schemas, add capabilities or deploy as part of M23.

1. Keep cookie-based persistent sessions, exact credentialed CORS, CSRF on every Customer POST and customer identity derived exclusively from the principal.
2. Keep action-specific AAL2 grants; never globally elevate a session. Preserve database locking, intent hashing and atomic idempotent execution.
3. Bound browser API operations to 20 seconds. Abort on deadline/caller cancellation. Never automatically replay a mutation, including after CSRF refresh.
4. Refetch authoritative resources after a 409 and disable the rejected confirmation. A new action requires a new intent and review.
5. Require an explicit API origin for build/start. Only development and route type generation supply localhost defaults. Backend mode remains the default, with no mock fallback.
6. Add CSP, frame protection, nosniff, referrer and permissions policy at Next. Local HTTP omits HSTS; an explicit `ASTER_HTTPS=true` deployment setting enables it.
7. Use disposable, project-scoped PostgreSQL volumes for E2E. Unlike tmpfs, they survive actual container stop/start during recovery tests; final cleanup removes them.

## CSP tradeoff

The current statically rendered App Router shell uses inline hydration scripts. RC1 allows `script-src 'self' 'unsafe-inline'`, and allows `unsafe-eval` only in development. It denies plugins and framing, restricts base/form targets, loads fonts locally and permits API connections only to the configured origin. Inline styles remain necessary for current UI/chart primitives.

A per-request nonce would require dynamic rendering and a separate caching/performance decision across the static shell. RC1 does not silently make that architecture change. This CSP is useful defense in depth but does not prevent all inline-script XSS. A stricter nonce/hash policy is a documented deployment review item; RC1 is not a claim of production security certification.

## Consequences

Build automation must supply public API variables before compilation; changing them later requires rebuilding. Test infrastructure can interrupt only its own services. Release evidence must distinguish intentional failure injection from clean journey errors and report remaining limits honestly.
