# Web security review — M24

Scope: local Aster Bank competition Demo. No new contract operations, credentials mechanism, deployment or external security certification.

## Controls and evidence

| Area              | Boundary / verification                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication    | BCrypt; indistinguishable wrong password/unknown email; SecurityPostgreSqlIT                                                                       |
| Session           | Spring Session JDBC, fixation rotation, absolute expiry using Clock, logout and restart persistence                                                |
| Cookies           | SESSION HttpOnly, Path=/, SameSite=Lax; Secure by default, local profile exception only; XSRF-TOKEN intentionally JS-readable                      |
| CSRF              | all 13 frozen POST patterns tested without token, including login, logout and all financial mutations                                              |
| CORS              | exact local origin and credentials; disallowed/default origins rejected; no wildcard                                                               |
| Customer identity | lightweight serializable principal; no caller-supplied customerId/header authority                                                                 |
| Step-up           | customer/session/type/ID/hash binding, 3 failures, expiry, one grant under concurrent verification; session remains AAL1                           |
| Idempotency       | all four execution domains lock and persist intent-scoped outcomes; same key/body replays, changed body rejects                                    |
| Sensitive data    | masked identifiers in API; no raw passwords/codes in security events; credentials hold hashes; no financial/session persistence in browser storage |
| Exceptions        | fixed external error messages, correlation ID, framework stack/body details disabled                                                               |
| Headers           | Next CSP, DENY frames, nosniff, referrer and permissions policies; see ADR 0020 for inline-script limitation                                       |
| Cache             | Customer no-store; API client no-store; no persistent TanStack cache. Public anonymous GETs do not create a Customer session                       |

## Ownership rejection matrix

These tests exercise two owners. A 404 hides whether a resource belongs to someone else. Authorization mismatch is 403; the grant is not consumed by the rejected request.

| Resource                                | External / domain rejection                                                                | Existing blocking coverage                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Account                                 | 404 ACCOUNT_NOT_FOUND                                                                      | read-domain web tests; SecurityPostgreSqlIT.httpCustomersAreIsolatedWithoutRequestIdentity                                |
| Transaction                             | 404 TRANSACTION_NOT_FOUND                                                                  | read-domain tests; PostgreSqlIT.customerIsolationCoversAllResourcesAndKeyScopes                                           |
| Transfer intent / receipt               | 404 TRANSFER_INTENT_NOT_FOUND / TRANSFER_NOT_FOUND                                         | PostgreSqlIT customer isolation; payment web tests                                                                        |
| Card / intent / receipt                 | 404 CARD_NOT_FOUND / CARD_ACTION_INTENT_NOT_FOUND / CARD_ACTION_NOT_FOUND                  | CardPostgreSqlIT.realHttpCustomerIsolationAndCallerSuppliedCustomerAreRejected                                            |
| Challenge                               | 404 STEP_UP_CHALLENGE_NOT_FOUND                                                            | SecurityPostgreSqlIT.challengeReadIsSessionBoundAndUnknownIdIs404                                                         |
| Action authorization                    | 403 ACTION_AUTHORIZATION_MISMATCH                                                          | SecurityPostgreSqlIT.authorizationsRejectEveryBindingMismatch; CardPostgreSqlIT.everyUsableGrantMustMatchExecutionBinding |
| Recurring / intent / receipt            | 404 corresponding RECURRING_PAYMENT_*_NOT_FOUND                                            | RecurringSpendingPostgreSqlIT isolation cases                                                                             |
| Suitability / investment intent / order | 404 SUITABILITY_CHECK_NOT_FOUND / INVESTMENT_INTENT_NOT_FOUND / INVESTMENT_ORDER_NOT_FOUND | WealthPostgreSqlIT.ownerIsolationAtEveryStage                                                                             |

The real browser suite also logs in a second customer and checks status + frozen error code for all 14 readable resource families against existing Alex records. It emits an ownership-rejections attachment. Authorization grants have no read endpoint: customer/session/type/ID/hash rejection and non-consumption remain covered by PostgreSQL application/execution tests.

## Deployment limits

Demo credentials/code are enabled only in local/test/demo; prod rejects mixed development profiles and never seeds them. M24 verifies a self-contained deployment, same-origin cookies/CSRF, restart durability and basic backup/restore, and supplies a TLS template. Real identity delivery/recovery, live banking networks, target-specific secret management, rate limiting, monitoring, DR/PITR and stricter CSP remain future work. The HTTPS proxy owns HSTS. This release does not process real money. Base-image findings and incomplete backend scanning are documented in the deployment foundation.

## M24 部署边界

代理覆盖不可信 forwarded headers，Spring 使用 framework 策略；backend 不直接发布端口。demo HTTP 与 prod HTTPS Cookie 分离，prod 不启用 seeds/code，禁止混合开发 profile。CSRF 保留，同源无额外 CORS。TLS 模板由代理独占 HSTS，保留原 CSP。数据库不发布端口，秘密与备份不进入 Git/build context。详见 [生产基础](../deployment/production-foundation.md)。
