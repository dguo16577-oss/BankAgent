# M8 — Security / Authentication / Step-Up Authorization

## Delivered behavior

M8 adds local simulated authentication, protected Banking pages/APIs, session expiry/logout, and intent-bound card authorization. It closes the previously blocked unfreeze and control-enable flows. No M9 feature, real authentication provider, backend, database, risk engine or Agent was implemented.

## Contract

`contracts/openapi/customer.yaml` is version 1.8.0. Generated frontend DTOs remain exclusively in `apps/web/src/generated/customer-api.d.ts`.

- POST `/customer/auth/login`
- POST `/customer/auth/logout`
- GET `/customer/session` (expanded original endpoint)
- POST `/customer/auth/step-up-challenges`
- GET `/customer/auth/step-up-challenges/{challengeId}`
- POST `/customer/auth/step-up-challenges/{challengeId}/verify`
- POST `/customer/card-actions` now accepts actionAuthorizationId.

Session includes status, AAL1/AAL2, authentication/expiry timestamps and SIMULATED_AUTH. Challenge and ActionAuthorization bind resourceType + original intent ID + original hash; private ownership also binds the session. Code and credentials never appear in API responses.

## Security semantics

- Session: 60 minutes on the existing deterministic clock; ordinary login remains AAL1.
- Challenge: 5 minutes maximum, three failed attempts, no reuse after verification.
- ActionAuthorization: AAL2, two minutes, single-use; AAL2 on a Session alone does not permit sensitive execution.
- Original Review → challenge → code verification → original Review → explicit execution → receipt. Refresh preserves the reviewed intent and challenge reference.
- Card mutation, grant consumption, receipt, intent status, idempotency and AUTHORIZATION_CONSUMED event commit atomically. Storage failure changes none of them.
- Exact idempotency replay is recognized before consumed-grant checks, after Session validation. Changed request or authorization ID with the same key is rejected.
- Existing card state/hash/expiry checks continue to apply. Protective card changes still use confirmation; transfer, recurring and investment policies remain unchanged.
- Security events: LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, STEP_UP_CREATED, STEP_UP_FAILED, STEP_UP_VERIFIED, AUTHORIZATION_ISSUED, AUTHORIZATION_CONSUMED. No input passwords/codes are logged.
- Unified Banking AuthBoundary plus API guard protects all existing routes. Logout clears client state; expiry produces 401 and an explanatory login message.

## File manifest

### New implementation

- `apps/web/src/mocks/data/security-fixture.ts`
- `apps/web/src/mocks/bank/security-service.ts`
- `apps/web/src/mocks/security-handlers.ts`
- `apps/web/src/lib/api/security.ts`
- `apps/web/src/features/security/use-security.ts`
- `apps/web/src/features/security/auth-boundary.tsx`
- `apps/web/src/features/security/login-form.tsx`
- `apps/web/src/features/security/step-up-page.tsx`
- `apps/web/src/app/app/security/step-up/[challengeId]/page.tsx`

### Updated implementation/contract

- `contracts/openapi/customer.yaml`
- `apps/web/src/generated/customer-api.d.ts`
- `apps/web/src/mocks/bank/store.ts` (v8 security state and migration)
- `apps/web/src/mocks/bank/card-service.ts`
- `apps/web/src/mocks/data/demo-profile.ts`
- `apps/web/src/mocks/handlers.ts`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/api/session.ts`
- `apps/web/src/components/providers.tsx`
- `apps/web/src/components/banking-layout.tsx`
- `apps/web/src/app/app/layout.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/app/cards/[cardId]/actions/review/[intentId]/page.tsx`
- `apps/web/src/features/cards/card-action-review.tsx`
- `apps/web/src/features/cards/use-cards.ts`

### Tests and documentation

- New: `apps/web/src/mocks/bank/security-service.test.ts`
- New: `apps/web/src/features/security/security.test.tsx`
- New: `apps/web/e2e/security.spec.ts`
- New: `apps/web/e2e/authenticated-test.ts`
- Updated: all seven existing E2E suites now log in through the form.
- Updated: `apps/web/src/test/setup.ts`, `apps/web/vitest.config.mts` (bounded workers).
- Updated: card/transfer/recurring/wealth service tests for session expiry or store migration.
- New: `docs/api/security.md`
- New: `docs/adr/0006-intent-bound-step-up-authorization.md`
- Updated: root README, API README, architecture overview, Cards API documentation.
- New: this report and `docs/screenshots/m8-*.png`.

## Validation

All required commands were actually run and passed:

| Command                     | Result                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| `pnpm lint`                 | ESLint and Prettier passed                                                   |
| `pnpm typecheck`            | OpenAPI generation check, Next route types and strict TypeScript passed      |
| `pnpm test`                 | 304 tests passed across 20 files; 43 new M8 tests                            |
| `pnpm build`                | Production build passed                                                      |
| `pnpm exec playwright test` | 42 passed using installed Edge (`PLAYWRIGHT_CHANNEL=msedge`); 4 new M8 tests |

Coverage includes valid/invalid login, session expiry/logout/protection, attempt exhaustion, challenge and authorization expiry, exact ID/hash/session binding, AAL2 not being global permission, successful unfreeze/control enable, consumed/incorrect grants, stale card state, atomic persistence failure, safe idempotent replay, no financial side effects and reset/migration isolation. Browser tests exercise both complete Step-up flows, wrong code, refresh, logout/back, expired-session messaging and 320/390/1440px overflow checks.

During validation, unrestricted Vitest workers hit a Windows worker exit; the configuration now uses two workers and the complete suite passes. E2E waits explicitly for navigation and MSW readiness before inspecting the new URL or making direct API assertions. No failed checks remain.

## Screenshots

Captured actual application pages at 320, 390 and 1440 pixels, with full-page screenshots. Development tooling overlays are hidden only for image capture.

For each width:

- `m8-login-{width}.png`
- `m8-unfreeze-verification-{width}.png`
- `m8-unfreeze-review-{width}.png`
- `m8-unfreeze-receipt-{width}.png`
- `m8-enable-verification-{width}.png`
- `m8-enable-review-{width}.png`
- `m8-enable-receipt-{width}.png`

## Manual start and local test values

Run `pnpm dev`, then open `http://localhost:3000/login`. Read the local credentials and demo security code in `apps/web/src/mocks/data/security-fixture.ts`. These values are intentionally not returned by an API or copied into React.

## Deferred scope

The browser's per-tab simulated store is not a trusted security boundary. Production session transport, trusted backend enforcement, shared storage, real authentication factors, rate limiting and operational audit retention require a later approved milestone. The deterministic demo clock is not a wall-clock idle timeout. No real SMS, OTP, OAuth, passkey, Spring Security, banking backend, database or Agent was added. Stop at M8.
