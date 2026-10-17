# Security, sensitive data and mutation audit — M11

## Trust boundaries

Public handlers precede the Customer guard and never import MockBankingStore. Anonymous, expired and revoked Customer sessions do not block Public APIs. `/login` is public; the `/app` layout owns AuthBoundary. Customer wildcard guard checks every private request before handlers; only POST login bypasses it. AAL2 belongs to a resource-bound authorization, never a global session permission.

The shared API client's 401 invalidation is now explicitly limited to `/customer/` and excludes login. AuthBoundary removes private cache entries on failed session checks; SessionInvalidation cancels and clears queries before redirect; logout clears the QueryClient and navigates to login. No Public component queries the Customer session.

## Mutation matrix

| Flow             | Immutable snapshot / hash                                     | Execute fields                                       | Execution revalidation                                                      | Atomic effects                                                         | Idempotency                                                         |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Transfer         | Source/recipient/amount/fee/projected funds + expiry          | intentId, intentHash                                 | Active account, recipient, CNY, available funds, reviewed recipient/masking | Debit, transaction, receipt, intent status, key, revision              | Same key/body returns original receipt                              |
| Card action      | Card summary and before/after versioned state + risk + expiry | intentId, intentHash, optional actionAuthorizationId | Current card state and bound authorization for risk increase                | Card state, receipt, intent, key, grant consumption, SecurityEvent     | Replay after valid session, before consumed/expired grant rejection |
| Recurring action | Complete arrangement + before/after + effect + expiry         | intentId, intentHash                                 | Complete reviewed arrangement, version, bank-managed capability             | Stop future bank-side payments, receipt, intent, key                   | Same key/body returns original receipt                              |
| Investment       | Product/account/suitability/amount/fees + expiry              | intentId, intentHash                                 | Product/account/profile/check versions and validity, risk, funds            | Debit, purchase transaction, position, portfolio, receipt, intent, key | Same key/body returns original receipt                              |

All four enforce a 1–128 character Idempotency-Key and reject same key/different execution request with 409. Card request identity includes the authorization ID. There is no await between final validation and commit; persistence is attempted before replacing state. Existing tests cover retry, concurrency, stale snapshots, expiry and persistence failure. The new cross-domain suite checks shared invariants after all four actions in sequence.

Differences are deliberate: Transfer permits a changed source balance if the reviewed amount is still funded; Investment requires the reviewed account snapshot to remain exact. Recurring has effectiveAt and no monetary posting; Card does not move money. Only risk-increasing Card actions require the M8 step-up flow. Prepare, suitability, login, logout and challenge/verify calls are not executor endpoints and do not promise Idempotency-Key replay. Retrying verification can consume attempts or encounter a terminal challenge; mutation hooks do not automatically retry these requests. Future distributed retries require the backend's concurrency/idempotency storage design.

## Authorization evidence

Existing SecurityService tests cover resource/hash/session binding, short expiry, three attempts, single consumption, stale card state, cross-session challenge concealment, replay after consumption and grant expiry, atomic failure, and refusal to interpret session AAL2 as permission for an arbitrary action. No authorization rule was broadened.

## Sensitive data

Source and fixture review found masked account/card identifiers at the Mock/API layer. No full PAN, CVV, PIN, password or verification code is returned in domain responses or written to SecurityEvent. Existing secret-exclusion tests and the cross-domain response/event walk verify this. API errors contain machine codes, never the submitted verification code.

The local credential fixture is imported by the browser MSW security simulator. Therefore the default DEMO build necessarily contains test credential material in its mock chunk; it is not production authentication. Login and verification UI explicitly disclose local testing and do not print secret values. Providers dynamically loads MSW only when mocking is enabled. Turning off MSW and replacing this trust boundary with a real backend is deferred to backend/security integration; client-side sessionStorage is not an authorization boundary for a real bank.

## Cache review

Transfer discards cursor pages and invalidates accounts/overview/transaction/intents. Ordinary bank transfers are excluded from spending, so no spending invalidation is required. Card invalidates cards/overview/intents; recurring invalidates arrangements/overview/intents; investment invalidates portfolio/accounts/overview/transactions/spending/intents. Receipt queries are seeded from execution responses. Existing E2E journeys verify immediate read-model changes and refresh persistence. Public query keys have a separate `public` prefix.
