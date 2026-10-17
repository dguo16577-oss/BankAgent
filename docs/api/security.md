# Security API — M8

## Simulator boundary

All authentication is `SIMULATED_AUTH`. This is a local, single-user Banking Simulator, not production authentication. It uses the active session in the tab's MockBankingStore; no bearer token, real cookie, SMS, OTP service or external identity provider is implemented. Browser storage is user-editable and is not a security boundary. A future backend must enforce the same contract and policies with trusted session transport and storage.

The only local credential and code values live in `apps/web/src/mocks/data/security-fixture.ts`. Open that local file for manual testing. Neither credentials nor the correct verification code are returned by any API, embedded in UI components, or written to security logs.

## Authentication and session

- `POST /customer/auth/login` accepts email/password and returns a Session with user, ID, authenticated, status, assuranceLevel, authenticatedAt, expiresAt and mode.
- Normal login is AAL1. Successful login revokes the previous session and its pending challenges/active grants.
- `GET /customer/session` reuses the original endpoint. Unauthenticated requests return 401; they do not expose a user profile.
- `POST /customer/auth/logout` revokes the active session and its pending challenges/active grants.
- Session lifetime is 60 minutes according to the injected deterministic DemoClock. No wall-clock or random expiry logic is used. Tests advance this clock explicitly. The demo clock normally advances only when simulator actions advance it; this is not a production idle timeout.
- Every `/customer/*` route except POST login passes through one MSW session guard, including security APIs and existing domain APIs. Missing/expired/revoked sessions return `UNAUTHENTICATED`, `SESSION_EXPIRED`, `SESSION_REVOKED` (401).
- The Banking layout renders children only after a successful Session read. API 401 clears authenticated queries and mutations and navigates to login. Expiry is explained there. Logout cancels requests, clears the client and navigates to login. New reads and mutations remain denied after browser back.

## Intent-bound verification

1. Prepare and review a CardActionIntent. Banking CardService decides its authorizationRequirement.
2. POST `/customer/auth/step-up-challenges` with `resourceType: CARD_ACTION_INTENT`, original resourceId (intentId), and resourceHash (intentHash).
3. GET `/customer/auth/step-up-challenges/{challengeId}` returns its public status, remaining attempts and expiry. It is readable only in the creating session.
4. POST `/customer/auth/step-up-challenges/{challengeId}/verify` with `{code}`. Correct verification returns the challenge and an ActionAuthorization. A verified challenge also exposes its actionAuthorizationId to allow review recovery after refresh.
5. Return to the original review URL with challengeId; read the same immutable intent and verified challenge. Do not create a new draft or intent.
6. POST `/customer/card-actions` with intentId, intentHash, actionAuthorizationId and Idempotency-Key.

Challenges last at most 5 minutes and never outlive the prepared intent. Three incorrect attempts exhaust the challenge. Each failure commits its decremented counter and an event before returning the error. Failed, expired, cancelled or previously verified challenges cannot issue another grant. Users may begin a fresh verification from an unexpired original review.

## ActionAuthorization and execution

An authorization contains ID, resourceType, resourceId, resourceHash, AAL2, status, issuedAt, expiresAt and nullable consumedAt. Its internal owner is the creating Session. It lasts 2 minutes and can be consumed once. Normal Session remains AAL1: AAL2 on this grant does not grant global permission.

CardService verifies session, grant existence, active status, expiry, owner, resource type, intent ID/hash and AAL2. Existing card state/version, intent expiry and hash checks still apply. Card mutation, receipt, idempotency record, intent execution, authorization consumption and consumption event are persisted in one atomic store replacement. Failed persistence leaves all untouched.

FREEZE and control ON→OFF still require ordinary confirmation. UNFREEZE and OFF→ON require the bound authorization. Transfer, recurring stop and investment authorization policies are unchanged.

After session validation, exact idempotent replay is recognized before checking consumed authorization or intent state. The request identity includes actionAuthorizationId; changed request with the same key returns 409. A fresh key with a consumed grant is denied. Replay does not mutate the card or emit another consumption event.

## Errors and logging

401: invalid credentials / absent / expired / revoked session. 404: unknown challenge or authorization. 403: missing step-up, mismatched authorization, expired grant or insufficient assurance. 409: expired/unusable challenge, consumed grant, changed intent/card or conflicting idempotency key. Wrong code returns 422, with `STEP_UP_CHALLENGE_FAILED` when attempts reach zero.

SecurityEvent is machine-readable: ID, type, occurredAt and optional sessionId/resourceId. Events cover LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, STEP_UP_CREATED, STEP_UP_FAILED, STEP_UP_VERIFIED, AUTHORIZATION_ISSUED and AUTHORIZATION_CONSUMED. Input passwords/codes and other secrets are never logged.

## State and reset

Store version 8 adds sessions, stepUpChallenges, actionAuthorizations and securityEvents. Migration from M4–M7 preserves financial/card/recurring/investment state, but starts unauthenticated. Reset removes all security state. Session storage is scoped to one tab and is intended only for demo continuity. Production shared-session coordination and enforcement remain future work.
