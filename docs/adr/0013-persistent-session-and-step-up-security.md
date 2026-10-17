# ADR 0013: Persistent sessions and action-bound step-up security

Status: Accepted — M16

## Decision

Customer authentication uses server-side sessions. Sessions are transported with secure cookies. Spring Security's AuthenticationManager and BCrypt authenticate credentials; a lightweight serializable CustomerPrincipal supplies CustomerId exclusively to the runtime identity boundary.

Spring Session JDBC persists sessions in PostgreSQL. Flyway owns the session and security schema; runtime schema creation is disabled. Session IDs rotate using Spring's fixation strategy. An absolute Clock-based expiry and retained lifecycle metadata supplement Spring Session's idle timeout and cleanup. Unexpired sessions survive a compatible application restart.

Cookie-authenticated mutations retain CSRF protection, including login. The existing GET session response sets a JS-readable CSRF cookie even on anonymous 401, without changing its body/schema. Clients echo X-XSRF-TOKEN and bootstrap again after login. No endpoint or blanket auth CSRF exemption is added.

SESSION is HttpOnly, host-only, Path=/, SameSite=Lax and Secure by default. Only the local profile relaxes Secure for localhost HTTP. Credentialed CORS uses exact origins, with localhost enabled only locally.

Step-up does not globally elevate the session. AAL2 authority is represented by a short-lived, single-use, customer/session/resource/hash-bound ActionAuthorization. Challenge, authorization and audit state persist in PostgreSQL. Row locks and unique constraints protect transitions across processes. Consumption joins the future Card mutation transaction.

## Consequences

The Web continues to use MSW. Backend security is tested independently through real HTTP cookies and PostgreSQL. Domain/application code remains independent of Spring Security, HTTP, JPA and generated contracts.

The frozen response value SIMULATED_AUTH remains unchanged despite real server persistence. Demo BCrypt credential seed and deterministic code verifier exist only in local/test profiles. Default runtime does not create demo identities.

Card resource binding is syntactically validated here; actual Card intent validation belongs to its future implementation. No fake Card domain is created. Operational session/event retention, production identity lifecycle and abuse controls remain future work.
