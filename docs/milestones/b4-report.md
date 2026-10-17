# B4 — Customer Verification Foundation

Status: **COMPLETE** — verified 2026-09-30.

Development line: v1.1-dev. B3.1 automatic scheduled-payment triggering remains deferred.

## Security foundation

Before B4, persistent sessions, intent-bound authorization and atomic business execution already existed, but some actions needed only confirmation and the demo step-up code was fixed. B4 reuses the existing BCrypt credential, Spring Session JDBC, StepUpChallenge, ActionAuthorization, SecurityEvent and intent infrastructure. There is no parallel authentication framework or separate payment password.

`CustomerPhoneBinding` has a primary key, unique customer FK, normalized E.164 value, VERIFIED status and timestamps. Every demo customer is seeded deterministically; Alex's internal number is masked as `+86 138****5678` for normal UI/API presentation. Phone ownership enrollment, change and multiple numbers are deferred.

`VerificationRequirement` is NONE, PASSWORD, SMS_OTP or PASSWORD_AND_SMS_OTP. The [complete policy matrix](../security/customer-verification.md#policy) is enforced again at business execution, not trusted from the client. LOGIN still uses the existing password flow without mandatory SMS or global session elevation.

## Challenge, factors and authority

Runtime Java OTPs come from SecureRandom and are six-digit strings, preserving zeros. MSW uses Web Crypto. Test-only deterministic injection proves `012345`; no universal runtime OTP remains. Challenges store BCrypt hashes, five-minute expiry and three failed attempts. Wrong password/OTP combinations share a generic error and attempt budget. A verified, failed or expired challenge cannot be replayed. Repeated requests for a live identical pending binding reuse it without more delivery; resend is not implemented.

SmsSender isolates delivery. DatabaseDemoSmsSender persists a simulated message, while authoritative verification uses the challenge hash. The explicit demo-only inbox checks customer and session ownership. Default/production-oriented SMS-required actions fail closed without a provider; local/test may persist delivery, but only demo exposes the inbox. Passwords are verified against the current enabled customer credential using BCrypt and never saved in challenges or returned.

Both factors must succeed for one challenge. Success issues the existing two-minute single-use ActionAuthorization, bound to customer, session, action, resource type, resource ID and intent hash. It does not make the whole session AAL2. Database locking/uniqueness serialize verification and consumption. Business mutation and authorization consumption share one database transaction. Idempotent receipt replay does not perform another mutation.

Security events record challenge creation, OTP issuance, failures, verification and grant issue/consume. They contain no password, OTP, hash or SMS body. Demo outbox delivery is not verification evidence.

## Integrated behavior

| Domain             | B4 integration                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Immediate transfer | Prepare → review → SMS → bound grant → atomic execution → receipt                                         |
| Recipients         | Create requires password + SMS; deactivate requires password                                              |
| Scheduled payments | Create/modify requires SMS; cancel requires password; due processor retains B3 validation with no new OTP |
| Cards              | Freeze retains confirmation; unfreeze/risky controls requires both; protective controls requires password |
| Investments        | Suitability → immutable intent → both factors → execute; suitability remains authoritative                |
| Recurring          | Password to stop future bank-side payments; merchant contract is not cancelled                            |
| Card applications  | Existing persistent intake gains immutable intent + SMS                                                   |
| Loan applications  | Existing persistent intake gains immutable intent + both factors; no approval/disbursement added          |

All review flows use the reusable inline ActionVerification component. The original business context stays visible; there is no Personal Center/security-page detour. Password/code inputs clear after use and are not persisted in URLs/caches. The simulated SMS button is driven by backend demo availability. Double clicks are locked; failures/expiry support retry. Completed-receipt navigation hints contain only receipt paths, are scoped to browser session storage and cleared with customer caches; they confer no execution authority.

## Database and contracts

Flyway `V10__customer_verification.sql` adds phone bindings, demo outbox, application intents and challenge factor/action fields. Historical migrations remain unchanged. Legacy pending challenges are cancelled and old active grants revoked. Constraints cover phone/customer uniqueness, factor/hash consistency, challenge/outbox owner, session/customer application binding and completion references. No trigger orchestrates security.

Customer before: **1.12.0 / 52 operations**. Customer after: **1.13.0 / 55 operations**. Public: **1.2.0 / 9 operations**, unchanged. Total: **64**.

New operations are getCustomerVerificationProfile, getDemoSmsMessage and prepareApplicationIntent. Existing challenge and execute requests evolve to action-specific factors/grants. TypeScript and Java are generated from the contract; no parallel DTO model was introduced. B3 is archived alongside B2, pre-B2 and M24 releases.

| Contract             | SHA-256                                                          |
| -------------------- | ---------------------------------------------------------------- |
| B4 Customer          | d98175dc20be79eff2b6ca7baf2d1da26295c8aa8041c77813c06e64eb6b5312 |
| Public (unchanged)   | 460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef |
| B3 Customer archive  | 6a153199be386850719e0903afdce3e1643acf2b9af0b3ec682e1c716fb2777d |
| B2 Customer archive  | 9c57a2a135e1e3ac42f490b58c9b2bd9d183708b305c909db18076a843fcfead |
| M24 Customer archive | 602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5 |

## Validation

All required validation gates are closed. Mock results below explicitly distinguish the full run from the corrected targeted rerun.

| Check                                  | Result                                                                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maven clean verify                     | **582 passed**: 194 unit + 388 PostgreSQL integration; zero failures/errors/skips; Spotless/ArchUnit included                                                                                                           |
| Frontend unit + contract hash tests    | **452 passed** in 36 files, plus **3 hash tests passed**                                                                                                                                                                |
| pnpm lint / typecheck / build          | Passed, including final backend-mode production build targeting localhost:18080                                                                                                                                         |
| Mock E2E                               | **97 scenarios covered**: 96 passed in the full run; the one fragment-return failure was fixed, then all 11 login/navigation/security scenarios passed on the corrected build. This is not a single fresh 97-test pass. |
| Real backend E2E                       | **20/20 passed** in one final run; MSW blocked                                                                                                                                                                          |
| Packaged stack                         | **5/5 passed** in one final run using the rebuilt B4 images; applications, banking, restore/production isolation, recipients and schedules                                                                              |
| Current and historical contract checks | Passed; Public and M24/pre-B2/B2/B3 archives unchanged                                                                                                                                                                  |

Local logs: `b4-java-final.log`, `b4-test-verified.log`, `b4-lint-verified.log`, `b4-typecheck-verified.log`, `b4-build-final.log`, `b4-contract-verified.log`, `b4-history-verified.log`, `b4-e2e-mock-final.log`, `b4-e2e-mock-recheck.log`, `b4-real-final.log`, `b4-packaged-verified.log`. Test outputs/logs are ignored local evidence, not source files.

The packaged production test first proves no auto-seeded customers. It then explicitly provisions test identity data and authenticates to prove demo-inbox denial and SMS-required 503 behavior, with no outbox messages created. Backup/restore, retained sessions, actual service/database outages and log-minimization assertions passed. An initial Public request-count test raced navigation before Offers finished; it now waits for each actual Public response rather than a static page heading.

Backend tests cover factor combinations, zero-prefixed OTP, attempt/expiry/replay boundaries, customer/session/action/resource/hash binding, concurrency, rollback, restart persistence and default-profile isolation. Direct HTTP transfer/investment/card tests prove missing verification cannot execute. Existing domain tests obtain real grants; runtime compatibility bypasses were not retained.

Validation uses isolated PostgreSQL containers. Windows currently has the user's prior backend JAR open, so `clean verify` uses `-Daster.build.directory=D:\BankProject\services\banking-core\target-b4`. The default build directory remains `target`. Real E2E supports an explicit isolated build directory and backend/web ports to avoid stopping the existing user service. Browser tests use installed Edge. No user database is reset by these tests.

## Main changes and screenshots

- Contract: `contracts/openapi/customer.yaml`, current freeze/manifests/generated TypeScript and generated Java inputs; B3 archive preserved.
- Backend: security domain policy/actions, factor/OTP/SMS ports, JDBC security adapter, demo seed, SecurityController, Flyway V10, and required verification in Transfer/Recipient/Schedule/Card/Wealth/Recurring/Application services.
- Web: shared `ActionVerification`, security API client/types, every existing action-review integration, immutable application review, Chinese messages, safe login fragment return and receipt navigation hints.
- Mock: shared verification policy/store, generated OTP hashes/outbox, current demo credential verification, and same-snapshot authorization consumption across mutations.
- Tests/tooling: PostgreSQL/HTTP security and business regressions, updated real-factor fixtures, RTL and browser flows; isolated Maven output and backend E2E ports. No new runtime dependency or major upgrade was needed.

Screenshots inspected for context, masked phone, empty password fields and narrow layout:

- [Desktop inline verification, 1440px](../screenshots/b4-enable-verification-1440.png)
- [Mobile inline verification and failed-attempt state, 390px](../screenshots/b4-unfreeze-verification-390.png)
- [Narrow verification, 320px](../screenshots/b4-unfreeze-verification-320.png)
- [Real backend verification, 390px](../screenshots/m23-b4-step-up-390.png)
- [Persistent application result, 390px](../screenshots/b4-backend-applications-390.png)

Current matrix: **64/64 IMPLEMENTED_POSTGRESQL, 0 NOT_IMPLEMENTED**. Demo-only endpoint availability is deliberately profile-gated. The existing developer JVM on :18080 and its retained database were not replaced; acceptance ran in isolated temporary environments. The verified JAR is in `services/banking-core/target-b4`. Run the updated backend with explicit `demo,local` for manual simulated-SMS UI; normal local without demo does not expose the inbox.

## Scope, coverage and known limits

No banking feature family is newly marked supported merely because verification exists. [Coverage metadata delta](../research/b4-verification-coverage-delta.md) retains B3 totals. Real SMS, phone lifecycle, login MFA, resend/cooldown, adaptive throttling, risk scoring and amount thresholds remain absent. Demo delivery retention is not production-grade. Application intake is not lending approval or card issuance. B3.1 automatic runtime trigger and Agent remain unimplemented.

M24.1 unresolved container vulnerabilities remain an independent public-deployment blocker. B4 is not a production security release or closure of that backlog.

See [security model](../security/customer-verification.md), [SMS isolation](../security/demo-sms.md), [frontend flow](../frontend/action-verification-workflow.md) and [ADR 0023](../adr/0023-customer-action-verification.md).

STOP AT B4.

## Completion summary

```text
B4 CUSTOMER VERIFICATION FOUNDATION COMPLETE
ACCOUNT PASSWORD RE-AUTH: IMPLEMENTED
VERIFIED PHONE BINDING: IMPLEMENTED
6-DIGIT SMS OTP: IMPLEMENTED
DEMO DATABASE SMS DELIVERY: IMPLEMENTED
PASSWORD-ONLY ACTIONS: IMPLEMENTED
OTP-ONLY ACTIONS: IMPLEMENTED
PASSWORD + OTP ACTIONS: IMPLEMENTED
ACTION AUTHORIZATION BINDING: IMPLEMENTED
REAL SMS PROVIDER: NOT IMPLEMENTED
DYNAMIC RISK ENGINE: NOT IMPLEMENTED
LOGIN MFA: NOT IMPLEMENTED
AGENT: NOT IMPLEMENTED
STOP AT B4.
```
