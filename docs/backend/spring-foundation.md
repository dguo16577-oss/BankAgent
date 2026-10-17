# Spring Banking Core foundation — M12

Independent Java 21 / Spring Boot 4.1.1 modular monolith at `services/banking-core`. Maven Wrapper pins Maven 3.9.11 and its distribution checksum. Enforcer rejects Java outside 21. Spotless 3.0.0 with Google Java Format 1.28.0 is the single Java formatter; generated sources are excluded. `verify` checks formatting, compilation and tests.

## HTTP and trust boundaries

Only `GET /actuator/health` and `GET /actuator/info` are implemented infrastructure endpoints. Health hides components/details; env, beans, configprops and heapdump are neither exposed nor permitted. Public anonymous paths reach MVC and unknown paths return 404. Anonymous Customer GETs return JSON 401; unknown arbitrary routes are denied. No generated interface is implemented or scanned as a controller.

CSRF retains Spring Security defaults; unsafe requests without a token return 403, including the unimplemented login path. CORS handles approved preflights before authentication without granting data access. Only `local` allows localhost:3000. Default/test configuration allows no origins. Unapproved origins return 403. Credentialed CORS requires explicit origin matching; wildcard configuration fails startup.

There is no authentication provider, generated demo user, cookie issuance, token endpoint or header-based identity. Session policy is stateless for M12. Real authenticated sessions and CSRF token lifecycle must be implemented together later. The frozen contract's `x-session-required` remains a logical requirement, not a selected credential transport.

## Generation

OpenAPI Generator Maven Plugin 7.25.0 has two executions reading the repository contracts directly. Both use Spring server generation with `useSpringBoot4=true`, `interfaceOnly=true`, `skipDefaultInterface=true` and Jakarta validation. Documentation libraries and supporting files are disabled. Jackson 3 is used by Boot 4 generation; generated JSON inclusion/null-setter annotations are explicitly enabled.

The generator's default OffsetDateTime mapping incorrectly receives Jakarta `@Pattern` from the frozen wire schema. Configuration maps `DateTime=String` at the HTTP boundary so the offset pattern actually validates; domain time conversion belongs in future mappers. A test checks valid offset timestamps, missing-offset rejection and nullable bookedAt without validator type errors. No contract edit or hand-written DTO is involved. The generator also warns about Money composition; a validation test verifies the generated transaction amount keeps its stricter non-negative constraint while general Money permits signed values.

`openApiNullable=false` avoids a Jackson 2 nullable-wrapper dependency. Future patch-style absent/null distinctions require explicit adapter review; generated DTOs do not become authoritative domain objects. Nullable response fields remain nullable Java references.

Generation and compilation occur automatically before tests. `GeneratedContractTest` compares every compiled API method's HTTP verb, path and operationId to source YAML, then checks counts against the freeze manifest. It rejects concrete/default API implementations. No generated Java is committed; no equivalent DTO is hand-written.

## Architecture and time

Application root: `com.asterbank.banking`; future domains: `customer` and `publiccontent`; infrastructure: `shared`. ArchUnit prevents any `..domain..` or `..application..` dependency on generated contracts. Empty matching sets are allowed today; no artificial domain classes were created.

`ClockConfiguration` provides `Clock.systemUTC()` and backs off when a Clock is supplied. Tests verify `Clock.fixed` injection. Architecture checks reject no-argument Instant/OffsetDateTime/LocalDateTime `now()` calls in application code. Future business timestamps use the injected Clock.

## Error and logging boundary

`UnexpectedExceptionAdvice` uses generated Customer `ApiError` / Public `PublicApiError` and generic messages for unexpected 500s. Expected framework errors retain their HTTP status with sanitized Problem Details. No empty domain exception hierarchy or new error codes were added. Test-only controllers exercise failures and are not packaged.

The correlation filter precedes security, validates IDs, returns the header, scopes MDC and cleans it even after failure. See [logging policy](logging.md). Tests check that exception text, class names, SQL, paths and secret markers are absent from responses.

## Dependencies and scope

Runtime starters: web, validation, actuator, security. SnakeYAML is a runtime dependency for application YAML and is also used for manifest verification. Test dependencies: starter-test, spring-security-test, ArchUnit. JUnit 5.13.4 is explicitly pinned instead of Boot 4's JUnit 6 default. Test starters provide AssertJ and MockMvc.

Verified compatibility detail: Spring 7's SpringExtension invokes `ExtensionContext.Store.computeIfAbsent`, which is not available in JUnit 5.13.4. Web tests therefore use JUnit 5 lifecycle methods to start/close the real Spring application on a random port and construct MockMvc with its real security filter chain. No SpringExtension or `@SpringBootTest` is used; Boot, Spring and frozen contracts are unchanged. Each context closes after its suite.

The validation starter includes Hibernate **Validator**, the Bean Validation implementation. Hibernate ORM/JPA, database drivers and persistence starters are absent. No Redis, Kafka, Lombok, Spring AI, Agent or banking operation was introduced.

## References

- [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html)
- [Spring generator options](https://openapi-generator.tech/docs/generators/spring/)
- [Spring Boot testing](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html)
