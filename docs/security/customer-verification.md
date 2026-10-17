# Customer action verification (B4)

B4 extends the existing BCrypt credential, Spring Session JDBC, StepUpChallenge and ActionAuthorization infrastructure. Login remains password-based AAL1. Successful action verification never globally elevates the session.

## Policy

| Action                                   | Requirement               |
| ---------------------------------------- | ------------------------- |
| Login                                    | PASSWORD (existing login) |
| Recipient create                         | PASSWORD_AND_SMS_OTP      |
| Recipient deactivate                     | PASSWORD                  |
| Immediate transfer execute               | SMS_OTP                   |
| Scheduled payment create / modify        | SMS_OTP                   |
| Scheduled payment cancel                 | PASSWORD                  |
| Card freeze                              | NONE (confirmation only)  |
| Card unfreeze / risk-increasing controls | PASSWORD_AND_SMS_OTP      |
| Protective card controls                 | PASSWORD                  |
| Investment execute                       | PASSWORD_AND_SMS_OTP      |
| Stop future recurring payments           | PASSWORD                  |
| Card application submit                  | SMS_OTP                   |
| Loan application submit                  | PASSWORD_AND_SMS_OTP      |

`VerificationPolicy` is deterministic and action-based. There are no amount thresholds or risk scores. Business execution independently resolves its expected action; a client cannot select a weaker action to authorize the same mutation. Existing `authorizationRequirement` confirmation fields remain for compatibility; `verificationRequirement` describes B4 factors.

## Identity and phone

The authenticated principal supplies CustomerId. Each demo customer has one VERIFIED E.164 phone binding, enforced by the customer unique constraint. Alex's seeded number is internal; normal API responses contain `+86 138****5678`. Phone replacement, ownership enrollment, multiple phones and phone login are deferred.

PASSWORD means the current customer's existing enabled BCrypt-backed login credential. B4 adds no payment password, PIN or password lifecycle. Submitted passwords are not stored in challenges, events or responses.

## Lifecycle and binding

1. Prepare the existing immutable business intent; application intake now also has a persistent immutable intent.
2. Create a StepUpChallenge for the exact customer, session, action, resource type, resource ID and resource hash.
3. For SMS factors, SecureRandom generates a six-character string including leading zeros. The challenge stores a BCrypt hash; SmsSender delivers the code.
4. Verify every required factor in the same request/challenge. Incorrect factors return a generic error and decrement the shared three-attempt budget. Three failures make the challenge terminal.
5. At the five-minute boundary the challenge is expired. Injected Clock defines boundaries.
6. Success marks the challenge VERIFIED and issues one two-minute ActionAuthorization. A second verification cannot replay the code. PostgreSQL locking and uniqueness serialize concurrent verification.
7. Execution checks exact customer/session/action/resource/hash and consumes the authorization in the same database transaction as business writes. Rollback restores both. Existing identical idempotent requests may return the original receipt; they do not perform a second mutation.

Repeated creation for an identical live PENDING binding returns the existing challenge without resetting attempts or sending another SMS. B4 has no resend endpoint. A terminal/expired challenge can be replaced from the review; a newly verified grant revokes older active grants for that binding. Due-time scheduled execution uses the already-authorized instruction and performs B3 state revalidation; it does not request another OTP. Automatic scheduling remains deferred.

## Persistence and boundary

Flyway V10 adds `customer_phone_bindings`, `demo_sms_outbox` and `application_intents`, and extends `step_up_challenges`. It cancels legacy pending challenges and revokes old active grants so pre-B4 clients cannot bypass factors. Historical migrations are unchanged. Existing persistent sessions, authorizations and events remain authoritative.

Security Domain/Application depend on ports, Clock and domain values. Spring Security, JDBC/transactions, BCrypt and HTTP remain adapters. OTP generation, factor verification and SMS delivery are replaceable ports. Security events include OTP_ISSUED but contain no code, password or message body.

## API evolution

Customer 1.12.0 (52 operations) becomes 1.13.0 (55 operations). Added operations:

- `GET /customer/security/profile`: masked phone, verified state, available factors, demo inbox availability.
- `GET /customer/demo/sms/{challengeId}`: authenticated same-customer/same-session demo delivery only.
- `POST /customer/application-intents`: immutable card/loan application intake review.

Existing challenge create/verify endpoints carry action and factor fields. Mutation requests carry `actionAuthorizationId`. Required verification is enforced by the backend, including clients which omit the new field. Public remains 1.2.0 / 9 operations, unchanged. Generated TypeScript and Java remain contract-derived.

See [Demo SMS isolation](demo-sms.md) and [frontend workflow](../frontend/action-verification-workflow.md). Existing M24.1 unresolved image vulnerabilities continue to block public deployment clearance.
