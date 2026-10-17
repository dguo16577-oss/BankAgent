# Persistent Step-Up and ActionAuthorization (M16)

## Frozen operations

- POST /customer/auth/step-up-challenges
- GET /customer/auth/step-up-challenges/{challengeId}
- POST /customer/auth/step-up-challenges/{challengeId}/verify

All require an authenticated session. POST also requires CSRF.

## Challenge lifecycle

The application validates a nonblank CARD_ACTION_INTENT resource binding (opaque ID up to 200 characters, hash up to 256, no control characters). M16 does not pretend a Card intent exists: there is no Card backend lookup or execution. The future Card application must revalidate exact persisted intent terms, hash, status and expiry before consuming authorization.

PENDING lasts at most five minutes. Wrong codes decrement three attempts; the third failure stores FAILED. At the exact deadline, a pending challenge becomes EXPIRED. Logout cancels pending challenges. VERIFIED, FAILED, EXPIRED and CANCELLED cannot be verified again. Correct verification commits challenge, authorization and audit events together.

Local/test demo code is `246810`. Its verifier uses BCrypt; neither plaintext code nor a reusable code secret is persisted or logged. Default profile disables the verifier and cannot create demo challenges.

## Authorization semantics

Every authorization binds:

- customer ID
- session ID
- exact resource type, ID and hash
- source challenge ID (unique)
- AAL2, issued/expiry timestamps, status, consumedAt

ACTIVE expires at two minutes, inclusive at the boundary. Single use transitions to CONSUMED and timestamps consumption. Logout/re-login revokes active grants. A new verified challenge for the same session/resource supersedes the previous active grant; a partial unique index ensures at most one ACTIVE logical grant. Expired state is materialized when evaluated, not by a workflow trigger.

A second browser session, even for the same customer, cannot use the first session's grant. AAL2 exists only on this bound authorization; GET session remains AAL1 after verification.

## Concurrency and transaction boundary

SecurityStore uses JDBC and the existing JpaTransactionManager/data source. It joins an existing REQUIRED transaction. Operations lock the owning security_sessions row before challenge/authorization rows; challenge lookup also locks its row. Thus logout, verification and consumption serialize per session across processes. No JVM global lock is used.

A unique challenge_id on action_authorizations prevents duplicate issuance. Composite foreign keys protect customer/session/resource binding. PostgreSQL constraints cover status enums, attempt range, FAILED/zero-attempt consistency, lifetimes and consumedAt consistency.

ActionAuthorizationService exposes validate and consume. Future Card mutation must call consume inside the **same database transaction and transaction manager** as its update, and let authorization failures abort that mutation. Validation alone is not permission to execute later. A rollback test proves both consumption and AUTHORIZATION_CONSUMED event roll back with the enclosing transaction.

Expected attempt/expiry failures commit their lifecycle changes before returning an API error. For a caller-owned outer transaction, normal rollback semantics remain in force.

## Persistence and events

Flyway V2 adds customer_credentials, spring_session, spring_session_attributes, security_sessions, step_up_challenges, action_authorizations, security_events. V1 remains unchanged.

Indexes cover session owner/status, challenge session/status/expiry, active session/resource authorization uniqueness, and customer event time, plus Spring Session expiry/principal queries. No triggers orchestrate security.

Events support LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, STEP_UP_CREATED, STEP_UP_FAILED, STEP_UP_VERIFIED, AUTHORIZATION_ISSUED and AUTHORIZATION_CONSUMED. They store identifiers, type, timestamp, correlation ID and outcome only. Login failures omit supplied email/customer identity. No password/hash/code/full PAN/authorization secret is logged in security events.

## Verification

Real PostgreSQL Testcontainers tests cover login/cookies/business reads, CSRF/CORS, customer isolation, expiry boundaries, wrong attempts, binding mismatches, single use, caller rollback, concurrent verification and full application reconstruction. Production/default has neither demo seed nor local CORS. ArchUnit guards technology-independent domain/application packages.

No Card, Recurring, Wealth, external OTP or frontend integration is implemented.
