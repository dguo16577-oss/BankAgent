# ADR 0023: Customer action verification

Status: Accepted for v1.1-dev B4.

## Decision

Reuse the existing account login password for action re-authentication. Do not introduce a separate payment password. Each demo customer has one verified phone binding. A deterministic action policy chooses NONE, PASSWORD, SMS_OTP or PASSWORD_AND_SMS_OTP; dynamic risk scores and amount thresholds are deferred.

Extend the existing StepUpChallenge and ActionAuthorization. A cryptographically generated six-digit OTP is bound to the customer, session, action and immutable resource/hash. Store its BCrypt hash in the challenge. The demo outbox simulates external delivery and may contain the plaintext SMS message; it is not proof of verification.

SmsSender isolates delivery so a real provider can replace the demo adapter without changing policy or banking execution. Only the explicit demo profile exposes the inbox. Missing production delivery configuration fails closed.

ActionAuthorization remains the short-lived single-use execution authority, consumed atomically with business mutation. Session assurance does not globally increase. Scheduled instructions verify at creation/modification; the deterministic due processor does not ask for an offline user's OTP.

## Consequences

Existing flows gain inline factor input while preserving review context and business idempotency. Flyway migrates security state and invalidates pre-B4 pending authority. Application intake receives an immutable intent because persistent submission already exists. B4 does not add lending decisions, card issuance, login MFA, phone enrollment, real SMS, automatic schedule triggering or Agent functionality.
