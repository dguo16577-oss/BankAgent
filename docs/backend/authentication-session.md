# Persistent customer authentication and sessions (M16)

## Frozen surface

| Method | Path                  | Authentication                                        |
| ------ | --------------------- | ----------------------------------------------------- |
| POST   | /customer/auth/login  | CSRF bootstrap required                               |
| POST   | /customer/auth/logout | Session + CSRF                                        |
| GET    | /customer/session     | Session; anonymous gets 401 and CSRF bootstrap cookie |

The frozen Session body still requires `mode: SIMULATED_AUTH`. This legacy contract value describes the competition demo: it does **not** imply an in-memory backend session. No contract/schema/hash changes were made.

## Identity flow

Credential → Spring Security AuthenticationManager / DaoAuthenticationProvider → BCrypt verification → CustomerPrincipal → Spring SecurityContext → Spring Session JDBC → CurrentCustomerProvider → existing banking applications.

The serialized principal contains only customer ID and display name. Passwords, credential rows and JPA entities never enter SecurityContext. Application/domain code cannot access SecurityContextHolder, HttpSession, servlet requests, Spring Security, JPA or generated contracts. The existing identity boundary accepts Spring Security Test's UserDetails in legacy tests; runtime login creates CustomerPrincipal exclusively. No HTTP customer-ID header is trusted.

## Credentials and profiles

BCrypt cost 12; PostgreSQL stores only the encoded hash. Unknown email and incorrect password return identical HTTP 401 INVALID_CREDENTIALS bodies. DaoAuthenticationProvider provides its standard unknown-user timing mitigation.

Only local/test profiles seed `alex@aster.local` with demo password `demo-password`. Default runtime seeds no credentials and enables no demo security code. Seed is idempotent and does not reset an existing credential. There is no registration or password-management endpoint.

## Persistent transport

Spring Session JDBC 4.1.1 stores SecurityContext in spring_session / spring_session_attributes. Flyway V2 owns all schema; Hibernate remains validate-only and session schema initialization is disabled. Sessions survive application reconstruction/restart against the same PostgreSQL database while unexpired. Spring Session's serializer requires compatible Java classes across deployments; arbitrary incompatible upgrades are not guaranteed.

Login invokes Spring's ChangeSessionIdAuthenticationStrategy (including an existing anonymous session), rotates CSRF state, and explicitly saves the new SecurityContext. Re-login revokes the previous logical session and its pending challenges/active authorizations.

| Cookie     | HttpOnly            | SameSite | Path | Secure                            |
| ---------- | ------------------- | -------- | ---- | --------------------------------- |
| SESSION    | true                | Lax      | /    | true by default; local HTTP false |
| XSRF-TOKEN | false (JS-readable) | Lax      | /    | same profile policy               |

Both cookies are host-only. SESSION is a browser-session cookie without persistent max-age. The server additionally applies `aster.security.session-timeout` (default PT1H). Spring Session has a matching idle timeout; security_sessions enforces an absolute deadline using injected Clock, so traffic cannot extend authentication indefinitely.

Lifecycle metadata is retained separately from Spring Session cleanup: ACTIVE → EXPIRED at `now >= expiresAt`, or ACTIVE → REVOKED on logout/re-login. An expired loaded session gets SESSION_EXPIRED; a removed/unknown transport session gets UNAUTHENTICATED. Both are 401. Logout revokes bound security state, invalidates the persistent transport session, expires SESSION and CSRF cookies, and records LOGOUT. An old cookie cannot access banking APIs.

## CSRF and CORS

GET /customer/session materializes XSRF-TOKEN even when its frozen response is 401. Before login, send this cookie plus the matching X-XSRF-TOKEN header. Login itself is CSRF-protected. After successful login, GET session again to obtain the rotated token. Use the header for every mutation, including Transfer preparation/execution and logout.

The token is cookie/header based, never added to a frozen response body. The plain token request handler supports this JSON API header flow; tokens are not embedded in compressed HTML. All customer responses are no-store.

Local CORS allows exactly http://localhost:3000, credentials=true, Content-Type and X-XSRF-TOKEN (plus existing correlation/idempotency headers). Default configuration allows no origins. Browser clients must opt into credentials; Next.js remains on MSW in M16.

## Local verification

Start PostgreSQL using the existing Compose file and Banking Core with local profile. Port 18080 avoids the existing local service on 8080:

```powershell
docker compose -f infra/compose/postgres.compose.yml up -d --wait
cd services/banking-core
$env:JAVA_HOME='C:\Users\youch\.jdks\jdk-21.0.12.1+1'
& "$env:JAVA_HOME\bin\java.exe" -Xmx256m -XX:+UseSerialGC -jar target/banking-core-0.1.0-SNAPSHOT.jar --spring.profiles.active=local --server.port=18080
```

The reproducible PowerShell smoke script in this directory exercises bootstrap, login, session, Accounts/Transactions/Recipients, Transfer CSRF rejection/acceptance, logout and old-cookie rejection. It prepares a small demo transfer intent only; it does not execute a transfer.

## Limits

Competition demo credentials are not a production identity service. No login rate limiting, password recovery, external identity provider or distributed abuse controls are added. Session/event retention needs an operational policy before production. Default HTTPS cookie settings are secure, but TLS termination and trusted-proxy deployment configuration remain deployment work.

References: [Spring Session JDBC](https://docs.spring.io/spring-session/reference/guides/boot-jdbc.html), [Spring Security CSRF](https://www.springframework.org/spring-security/reference/servlet/exploits/csrf.html).
