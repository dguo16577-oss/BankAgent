package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.SecurityState.*;
import com.asterbank.banking.shared.adapter.persistence.DemoDataInitializer;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SecurityPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final String ALEX = "usr_aster_alex";
  static final JsonMapper JSON = JsonMapper.builder().build();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
  static SecurityService service;
  static TransferFixtures.TestClock clock;
  static String base;

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    JdbcConnectionDetails connectionDetails() {
      return new JdbcConnectionDetails() {
        public String getJdbcUrl() {
          return POSTGRES.getJdbcUrl();
        }

        public String getUsername() {
          return POSTGRES.getUsername();
        }

        public String getPassword() {
          return POSTGRES.getPassword();
        }

        public String getDriverClassName() {
          return "org.postgresql.Driver";
        }
      };
    }

    @Bean
    @Primary
    OtpGenerator deterministicOtp() {
      return () -> "012345";
    }

    @Bean
    @Primary
    TransferFixtures.TestClock testClock() {
      return new TransferFixtures.TestClock();
    }
  }

  static void open(String... profiles) {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(Config.class)
            .profiles(profiles)
            .run(
                "--server.port=0",
                "--DB_HOST=localhost",
                "--DB_NAME=test",
                "--DB_USER=test",
                "--DB_PASSWORD=test-only");
    db = context.getBean(JdbcTemplate.class);
    service = context.getBean(SecurityService.class);
    clock = context.getBean(TransferFixtures.TestClock.class);
    base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
  }

  @BeforeAll
  static void start() {
    POSTGRES.start();
    open("demo", "local", "test");
  }

  @AfterAll
  static void stop() {
    if (context != null) context.close();
    POSTGRES.stop();
  }

  @BeforeEach
  void reset() throws Exception {
    db.execute("truncate spring_session cascade");
    db.execute("truncate customers cascade");
    clock.value = Instant.parse("2026-09-28T08:00:00Z");
    context
        .getBean(DemoDataInitializer.class)
        .initialize(ReadDomainFixtures.withOther(JSON), TransferFixtures.recipients());
    var encoder = context.getBean(PasswordEncoder.class);
    var hash = encoder.encode("demo-password");
    db.update(
        "insert into customer_credentials values(?,?,?,true),(?,?,?,true)",
        ALEX,
        "alex@aster.local",
        hash,
        "customer_other",
        "other@aster.local",
        hash);
    B4TestVerification.phones(db);
  }

  static final class Browser implements AutoCloseable {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(String method, String path, String body, boolean csrf)
        throws Exception {
      var builder =
          HttpRequest.newBuilder(URI.create(base + path))
              .header("Content-Type", "application/json");
      if (csrf) {
        var token =
            cookies.getCookieStore().getCookies().stream()
                .filter(c -> c.getName().equals("XSRF-TOKEN") && !c.hasExpired())
                .findFirst();
        token.ifPresent(c -> builder.header("X-XSRF-TOKEN", c.getValue()));
      }
      return client.send(
          builder
              .method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(body))
              .build(),
          HttpResponse.BodyHandlers.ofString());
    }

    HttpResponse<String> get(String path) throws Exception {
      return call("GET", path, null, false);
    }

    HttpResponse<String> post(String path, String body) throws Exception {
      return call("POST", path, body, true);
    }

    JsonNode login(String email) throws Exception {
      assertThat(get("/customer/session").statusCode()).isEqualTo(401);
      var response =
          post(
              "/customer/auth/login",
              JSON.writeValueAsString(Map.of("email", email, "password", "demo-password")));
      assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
      var result = JSON.readTree(response.body());
      assertThat(get("/customer/session").statusCode()).isEqualTo(200);
      return result;
    }

    String challenge() throws Exception {
      var r =
          post(
              "/customer/auth/step-up-challenges",
              "{\"actionType\":\"CARD_UNFREEZE\",\"resourceType\":\"CARD_ACTION_INTENT\",\"resourceId\":\"intent_security_test\",\"resourceHash\":\"sha256:test-binding\"}");
      assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
      return JSON.readTree(r.body()).path("id").asText();
    }

    public void close() {
      client.close();
    }
  }

  Binding binding(String session) {
    return new Binding(
        ALEX, session, "CARD_ACTION_INTENT", "intent_security_test", "sha256:test-binding");
  }

  void failure(Runnable action, String code) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(SecurityFailure.class, f -> assertThat(f.code()).isEqualTo(code));
  }

  long count(String table) {
    return db.queryForObject("select count(*) from " + table, Long.class);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/customer/auth/login",
        "/customer/auth/logout",
        "/customer/transfer-intents",
        "/customer/transfers",
        "/customer/card-action-intents",
        "/customer/card-actions",
        "/customer/auth/step-up-challenges",
        "/customer/auth/step-up-challenges/unknown/verify",
        "/customer/recurring-payment-action-intents",
        "/customer/recurring-payment-actions",
        "/customer/wealth/suitability-checks",
        "/customer/investment-order-intents",
        "/customer/investment-orders"
      })
  void everyFrozenMutationRejectsMissingCsrf(String path) throws Exception {
    try (var browser = new Browser()) {
      browser.login("alex@aster.local");
      var response = browser.call("POST", path, "{}", false);
      assertThat(response.statusCode()).as(path).isEqualTo(403);
      assertThat(JSON.readTree(response.body()).path("code").asText()).isEqualTo("INVALID_REQUEST");
      assertThat(response.body()).doesNotContain("demo-password", "246810", "jdbc:", "Exception");
      assertThat(response.headers().firstValue("X-Correlation-Id")).isPresent();
    }
  }

  @Test
  void realHttpLoginEnablesExistingReadDomainsAndAal1Session() throws Exception {
    try (var b = new Browser()) {
      for (var path :
          List.of("/customer/accounts", "/customer/transactions", "/customer/recipients"))
        assertThat(b.get(path).statusCode()).isEqualTo(401);
      var session = b.login("alex@aster.local");
      assertThat(session.path("user").path("id").asText()).isEqualTo(ALEX);
      assertThat(session.path("assuranceLevel").asText()).isEqualTo("AAL1");
      assertThat(session.path("status").asText()).isEqualTo("ACTIVE");
      for (var path :
          List.of("/customer/accounts", "/customer/transactions", "/customer/recipients"))
        assertThat(b.get(path).statusCode()).isEqualTo(200);
      assertThat(count("spring_session")).isEqualTo(1);
      assertThat(count("security_sessions")).isEqualTo(1);
    }
  }

  @Test
  void invalidCredentialsAreIndistinguishableAndAuditedWithoutSecrets() throws Exception {
    try (var b = new Browser()) {
      b.get("/customer/session");
      var wrong =
          b.post("/customer/auth/login", "{\"email\":\"alex@aster.local\",\"password\":\"wrong\"}");
      var absent =
          b.post(
              "/customer/auth/login", "{\"email\":\"unknown@aster.local\",\"password\":\"wrong\"}");
      assertThat(wrong.statusCode()).isEqualTo(401);
      assertThat(absent.statusCode()).isEqualTo(401);
      assertThat(wrong.body()).isEqualTo(absent.body()).contains("INVALID_CREDENTIALS");
      assertThat(count("spring_session")).isZero();
      assertThat(count("security_events")).isEqualTo(2);
      assertThat(db.queryForList("select * from security_events").toString())
          .doesNotContain("alex@aster.local", "wrong", "unknown@aster.local", "demo-password");
    }
  }

  @Test
  void sessionFixationRotatesIdAndRejectsPreviousCookie() throws Exception {
    try (var b = new Browser();
        var old = new Browser()) {
      var first = b.login("alex@aster.local");
      b.cookies
          .getCookieStore()
          .getCookies()
          .forEach(c -> old.cookies.getCookieStore().add(URI.create(base), c));
      var response =
          b.post(
              "/customer/auth/login",
              "{\"email\":\"alex@aster.local\",\"password\":\"demo-password\"}");
      assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
      assertThat(JSON.readTree(response.body()).path("id").asText())
          .isNotEqualTo(first.path("id").asText());
      assertThat(old.get("/customer/accounts").statusCode()).isEqualTo(401);
      assertThat(
              db.queryForObject(
                  "select status from security_sessions where session_id=?",
                  String.class,
                  first.path("id").asText()))
          .isEqualTo("REVOKED");
    }
  }

  @Test
  void logoutInvalidatesCookieAndRevokesBoundState() throws Exception {
    try (var b = new Browser();
        var old = new Browser()) {
      var s = b.login("alex@aster.local");
      b.cookies
          .getCookieStore()
          .getCookies()
          .forEach(c -> old.cookies.getCookieStore().add(URI.create(base), c));
      var c = b.challenge();
      B4TestVerification.verify(db, service, ALEX, s.path("id").asText(), c, "246810", null);
      var pending = b.challenge();
      var response = b.post("/customer/auth/logout", null);
      assertThat(response.statusCode()).isEqualTo(200);
      assertThat(response.headers().allValues("set-cookie").toString())
          .contains("SESSION=", "Max-Age=0");
      assertThat(old.get("/customer/accounts").statusCode()).isEqualTo(401);
      assertThat(db.queryForObject("select status from action_authorizations", String.class))
          .isEqualTo("REVOKED");
      assertThat(
              db.queryForObject(
                  "select status from step_up_challenges where challenge_id=?",
                  String.class,
                  pending))
          .isEqualTo("CANCELLED");
      assertThat(
              db.queryForObject(
                  "select count(*) from security_events where type='LOGOUT'", Long.class))
          .isEqualTo(1);
    }
  }

  @Test
  void absoluteSessionExpiryUsesInjectedClockAtBoundary() throws Exception {
    try (var b = new Browser()) {
      var s = b.login("alex@aster.local");
      clock.value = Instant.parse(s.path("expiresAt").asText()).minusNanos(1000);
      assertThat(b.get("/customer/accounts").statusCode()).isEqualTo(200);
      clock.value = clock.value.plusNanos(1000);
      var r = b.get("/customer/session");
      assertThat(r.statusCode()).isEqualTo(401);
      assertThat(r.body()).contains("SESSION_EXPIRED");
      assertThat(db.queryForObject("select status from security_sessions", String.class))
          .isEqualTo("EXPIRED");
      assertThat(b.get("/customer/accounts").statusCode()).isEqualTo(401);
    }
  }

  @Test
  void httpCustomersAreIsolatedWithoutRequestIdentity() throws Exception {
    try (var a = new Browser();
        var b = new Browser()) {
      a.login("alex@aster.local");
      b.login("other@aster.local");
      assertThat(a.get("/customer/accounts").body())
          .contains("acc_current")
          .doesNotContain("acc_other");
      assertThat(b.get("/customer/accounts").body())
          .contains("acc_other")
          .doesNotContain("acc_current");
      assertThat(b.get("/customer/transactions").body())
          .contains("txn_other")
          .doesNotContain("Starbucks");
      assertThat(b.get("/customer/accounts/acc_current").statusCode()).isEqualTo(404);
      assertThat(a.get("/customer/accounts/acc_other").statusCode()).isEqualTo(404);
    }
  }

  @Test
  void transferMutationRequiresRealCsrfAndLoginIsNotExempt() throws Exception {
    try (var b = new Browser()) {
      assertThat(b.call("POST", "/customer/auth/login", "{}", false).statusCode()).isEqualTo(403);
      b.login("alex@aster.local");
      String body =
          "{\"sourceAccountId\":\"acc_current\",\"recipientId\":\"recipient_zhang\",\"amount\":{\"amount\":\"10.00\",\"currency\":\"CNY\"},\"note\":\"Security test\"}";
      assertThat(b.call("POST", "/customer/transfer-intents", body, false).statusCode())
          .isEqualTo(403);
      var r = b.post("/customer/transfer-intents", body);
      assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
    }
  }

  @Test
  void csrfAndSessionCookiesHaveSeparateAttributes() throws Exception {
    try (var b = new Browser()) {
      var boot = b.get("/customer/session");
      assertThat(boot.statusCode()).isEqualTo(401);
      var csrf =
          boot.headers().allValues("set-cookie").stream()
              .filter(s -> s.startsWith("XSRF-TOKEN="))
              .findFirst()
              .orElseThrow();
      assertThat(csrf).contains("Path=/", "SameSite=Lax").doesNotContain("HttpOnly", "Secure");
      var r =
          b.post(
              "/customer/auth/login",
              "{\"email\":\"alex@aster.local\",\"password\":\"demo-password\"}");
      var cookie =
          r.headers().allValues("set-cookie").stream()
              .filter(s -> s.startsWith("SESSION="))
              .findFirst()
              .orElseThrow();
      assertThat(cookie).contains("HttpOnly", "Path=/", "SameSite=Lax").doesNotContain("Secure");
    }
  }

  @Test
  void corsAllowsOnlyExactLocalOriginWithCredentials() throws Exception {
    try (var client = HttpClient.newHttpClient()) {
      for (var origin : List.of("http://localhost:3000", "https://attacker.example")) {
        var r =
            client.send(
                HttpRequest.newBuilder(URI.create(base + "/customer/transfer-intents"))
                    .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                    .header("Origin", origin)
                    .header("Access-Control-Request-Method", "POST")
                    .header("Access-Control-Request-Headers", "X-XSRF-TOKEN,Content-Type")
                    .build(),
                HttpResponse.BodyHandlers.ofString());
        if (origin.equals("http://localhost:3000")) {
          assertThat(r.statusCode()).isEqualTo(200);
          assertThat(r.headers().firstValue("Access-Control-Allow-Credentials")).contains("true");
          assertThat(r.headers().firstValue("Access-Control-Allow-Origin")).contains(origin);
        } else assertThat(r.statusCode()).isEqualTo(403);
      }
    }
  }

  @Test
  void unauthenticatedChallengeRejectedAndBindingsValidated() throws Exception {
    try (var b = new Browser()) {
      assertThat(b.post("/customer/auth/step-up-challenges", "{}").statusCode()).isEqualTo(401);
      b.login("alex@aster.local");
      var r =
          b.post(
              "/customer/auth/step-up-challenges",
              "{\"actionType\":\"CARD_UNFREEZE\",\"resourceType\":\"CARD_ACTION_INTENT\",\"resourceId\":\"\",\"resourceHash\":\"hash\"}");
      assertThat(r.statusCode()).isEqualTo(400);
    }
  }

  @Test
  void wrongCodePersistsAttemptsAndTerminalFailure() throws Exception {
    try (var b = new Browser()) {
      var s = b.login("alex@aster.local").path("id").asText();
      var c = b.challenge();
      for (int i = 2; i >= 0; i--) {
        var r =
            b.post(
                "/customer/auth/step-up-challenges/" + c + "/verify",
                "{\"code\":\"000000\",\"password\":\"wrong\"}");
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(service.challenge(ALEX, s, c).attemptsRemaining()).isEqualTo(i);
      }
      failure(
          () -> B4TestVerification.verify(db, service, ALEX, s, c, "246810", null),
          "STEP_UP_CHALLENGE_FAILED");
      assertThat(count("action_authorizations")).isZero();
    }
  }

  @Test
  void challengeExpiresExactlyAtFiveMinutes() throws Exception {
    try (var b = new Browser()) {
      var s = b.login("alex@aster.local").path("id").asText();
      var c = b.challenge();
      clock.value = clock.value.plusSeconds(300);
      failure(
          () -> B4TestVerification.verify(db, service, ALEX, s, c, "246810", null),
          "STEP_UP_CHALLENGE_EXPIRED");
      assertThat(service.challenge(ALEX, s, c).status()).isEqualTo(ChallengeStatus.EXPIRED);
    }
  }

  @Test
  void correctCodeIssuesOnlyBoundAal2AndLeavesSessionAal1() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var c = b.challenge();
      var r =
          b.post(
              "/customer/auth/step-up-challenges/" + c + "/verify",
              JSON.writeValueAsString(
                  Map.of("code", B4TestVerification.code(db, c), "password", "demo-password")));
      assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
      var value = JSON.readTree(r.body());
      assertThat(value.path("challenge").path("status").asText()).isEqualTo("VERIFIED");
      assertThat(value.path("authorization").path("assuranceLevel").asText()).isEqualTo("AAL2");
      assertThat(JSON.readTree(b.get("/customer/session").body()).path("assuranceLevel").asText())
          .isEqualTo("AAL1");
      assertThat(count("action_authorizations")).isEqualTo(1);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"customer", "session", "type", "id", "hash"})
  void authorizationsRejectEveryBindingMismatch(String dimension) throws Exception {
    try (var b = new Browser();
        var other = new Browser()) {
      var s = b.login("alex@aster.local").path("id").asText();
      var s2 =
          other
              .login(dimension.equals("customer") ? "other@aster.local" : "alex@aster.local")
              .path("id")
              .asText();
      var a =
          B4TestVerification.verify(db, service, ALEX, s, b.challenge(), "246810", null)
              .authorization();
      var binding =
          new Binding(
              dimension.equals("customer") ? "customer_other" : ALEX,
              dimension.equals("customer") || dimension.equals("session") ? s2 : s,
              dimension.equals("type") ? "OTHER" : "CARD_ACTION_INTENT",
              dimension.equals("id") ? "other" : "intent_security_test",
              dimension.equals("hash") ? "other" : "sha256:test-binding");
      failure(() -> service.validate(a.id(), binding), "ACTION_AUTHORIZATION_MISMATCH");
      assertThat(service.validate(a.id(), binding(s)).status())
          .isEqualTo(AuthorizationStatus.ACTIVE);
    }
  }

  @Test
  void authorizationExpiresAtTwoMinutes() throws Exception {
    try (var b = new Browser()) {
      var s = b.login("alex@aster.local").path("id").asText();
      var a =
          B4TestVerification.verify(db, service, ALEX, s, b.challenge(), "246810", null)
              .authorization();
      clock.value = clock.value.plusSeconds(120);
      failure(() -> service.validate(a.id(), binding(s)), "ACTION_AUTHORIZATION_EXPIRED");
      assertThat(db.queryForObject("select status from action_authorizations", String.class))
          .isEqualTo("EXPIRED");
    }
  }

  @Test
  void consumptionIsSingleUseAndJoinsCallerRollback() throws Exception {
    try (var b = new Browser()) {
      var s = b.login("alex@aster.local").path("id").asText();
      var a =
          B4TestVerification.verify(db, service, ALEX, s, b.challenge(), "246810", null)
              .authorization();
      var tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
      assertThatThrownBy(
              () ->
                  tx.execute(
                      status -> {
                        service.consume(a.id(), binding(s), null);
                        throw new IllegalStateException("simulated mutation failure");
                      }))
          .isInstanceOf(IllegalStateException.class);
      assertThat(service.validate(a.id(), binding(s)).status())
          .isEqualTo(AuthorizationStatus.ACTIVE);
      service.consume(a.id(), binding(s), null);
      failure(() -> service.consume(a.id(), binding(s), null), "ACTION_AUTHORIZATION_CONSUMED");
      assertThat(
              db.queryForObject(
                  "select count(*) from security_events where type='AUTHORIZATION_CONSUMED'",
                  Long.class))
          .isEqualTo(1);
    }
  }

  @Test
  void concurrentCorrectVerificationCreatesOneLogicalAuthorization() throws Exception {
    try (var b = new Browser();
        var pool = Executors.newFixedThreadPool(2)) {
      var s = b.login("alex@aster.local").path("id").asText();
      var c = b.challenge();
      var start = new CountDownLatch(1);
      Callable<Boolean> work =
          () -> {
            start.await();
            try {
              B4TestVerification.verify(db, service, ALEX, s, c, "246810", null);
              return true;
            } catch (SecurityFailure f) {
              assertThat(f.code()).isEqualTo("STEP_UP_CHALLENGE_FAILED");
              return false;
            }
          };
      var x = pool.submit(work);
      var y = pool.submit(work);
      start.countDown();
      assertThat(List.of(x.get(), y.get())).containsExactlyInAnyOrder(true, false);
      assertThat(count("action_authorizations")).isEqualTo(1);
      assertThat(
              db.queryForObject(
                  "select count(*) from security_events where type='STEP_UP_VERIFIED'", Long.class))
          .isEqualTo(1);
    }
  }

  @Test
  void subsequentChallengeSupersedesPriorActiveResourceAuthorization() throws Exception {
    try (var b = new Browser()) {
      var s = b.login("alex@aster.local").path("id").asText();
      var a =
          B4TestVerification.verify(db, service, ALEX, s, b.challenge(), "246810", null)
              .authorization();
      B4TestVerification.verify(db, service, ALEX, s, b.challenge(), "246810", null);
      failure(() -> service.validate(a.id(), binding(s)), "INSUFFICIENT_AUTH_ASSURANCE");
      assertThat(
              db.queryForObject(
                  "select count(*) from action_authorizations where status='ACTIVE'", Long.class))
          .isEqualTo(1);
    }
  }

  @Test
  void secretsNeverEnterResponsesEventsOrSerializedSession() throws Exception {
    try (var b = new Browser()) {
      var login = b.login("alex@aster.local");
      var c = b.challenge();
      var verified =
          b.post(
              "/customer/auth/step-up-challenges/" + c + "/verify",
              JSON.writeValueAsString(
                  Map.of("code", B4TestVerification.code(db, c), "password", "demo-password")));
      var hash =
          db.queryForObject(
              "select password_hash from customer_credentials where customer_id=?",
              String.class,
              ALEX);
      assertThat(hash).startsWith("$2");
      assertThat(context.getBean(PasswordEncoder.class).matches("demo-password", hash)).isTrue();
      var bodies =
          login.toString()
              + verified.body()
              + b.get("/customer/session").body()
              + db.queryForList("select * from security_events");
      assertThat(bodies).doesNotContain("demo-password", "246810", hash, "passwordHash");
      for (byte[] bytes :
          db.queryForList("select attribute_bytes from spring_session_attributes", byte[].class))
        assertThat(new String(bytes, java.nio.charset.StandardCharsets.ISO_8859_1))
            .doesNotContain("demo-password", hash, "246810", "CustomerJpaEntity");
    }
  }

  @Test
  void challengeReadIsSessionBoundAndUnknownIdIs404() throws Exception {
    try (var a = new Browser();
        var b = new Browser()) {
      a.login("alex@aster.local");
      b.login("alex@aster.local");
      var id = a.challenge();
      assertThat(a.get("/customer/auth/step-up-challenges/" + id).statusCode()).isEqualTo(200);
      for (var response :
          List.of(
              b.get("/customer/auth/step-up-challenges/" + id),
              a.get("/customer/auth/step-up-challenges/unknown"))) {
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).contains("STEP_UP_CHALLENGE_NOT_FOUND");
      }
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"RECIPIENT_DEACTIVATE", "TRANSFER_EXECUTE", "CARD_UNFREEZE"})
  void b4RequiredFactorsAndOtpReplay(String name) throws Exception {
    try (var b = new Browser()) {
      var session = b.login("alex@aster.local").path("id").asText();
      var action = com.asterbank.banking.security.domain.VerificationAction.valueOf(name);
      var binding =
          new Binding(ALEX, session, action.resourceType(), "b4-intent", "sha256:b4-binding");
      var c = service.create(binding, action, null);
      assertThat(service.create(binding, action, null).id()).isEqualTo(c.id());
      var profile = b.get("/customer/security/profile");
      assertThat(profile.statusCode()).isEqualTo(200);
      assertThat(profile.body()).contains("+86138****5678").doesNotContain("+8613812345678");
      assertThat(c.requirement())
          .isEqualTo(com.asterbank.banking.security.domain.VerificationPolicy.resolve(action));
      if (c.requirement().sms()) {
        assertThat(B4TestVerification.code(db, c.id())).isEqualTo("012345");
        assertThat(c.otpHash()).startsWith("$2").doesNotContain("012345");
        assertThat(b.get("/customer/demo/sms/" + c.id()).body())
            .contains("012345")
            .doesNotContain("+8613812345678");
        assertThat(db.queryForObject("select count(*) from demo_sms_outbox", Long.class))
            .isEqualTo(1);
      } else
        assertThat(db.queryForObject("select count(*) from demo_sms_outbox", Long.class)).isZero();
      failure(
          () -> service.verify(ALEX, session, c.id(), "999999", "wrong", null),
          "INVALID_VERIFICATION");
      assertThat(service.challenge(ALEX, session, c.id()).attemptsRemaining()).isEqualTo(2);
      var result =
          service.verify(
              ALEX,
              session,
              c.id(),
              c.requirement().sms() ? "012345" : null,
              c.requirement().password() ? "demo-password" : null,
              null);
      service.require(result.authorization().id(), binding, action);
      failure(
          () -> service.verify(ALEX, session, c.id(), "012345", "demo-password", null),
          "STEP_UP_CHALLENGE_FAILED");
      var different =
          action == com.asterbank.banking.security.domain.VerificationAction.CARD_UNFREEZE
              ? com.asterbank.banking.security.domain.VerificationAction.CARD_CONTROL_PROTECTIVE
              : com.asterbank.banking.security.domain.VerificationAction.CARD_UNFREEZE;
      failure(
          () -> service.require(result.authorization().id(), binding, different),
          "ACTION_AUTHORIZATION_MISMATCH");
      service.consume(result.authorization().id(), binding, null);
      failure(
          () -> service.require(result.authorization().id(), binding, action),
          "ACTION_AUTHORIZATION_CONSUMED");
    }
  }

  @Test
  void b4SmsCannotBeReadAcrossCustomersOrSessions() throws Exception {
    try (var a = new Browser();
        var b = new Browser();
        var c = new Browser()) {
      a.login("alex@aster.local");
      b.login("other@aster.local");
      c.login("alex@aster.local");
      var id = a.challenge();
      assertThat(a.get("/customer/demo/sms/" + id).statusCode()).isEqualTo(200);
      assertThat(b.get("/customer/demo/sms/" + id).statusCode()).isEqualTo(404);
      assertThat(c.get("/customer/demo/sms/" + id).statusCode()).isEqualTo(404);
    }
  }

  @Test
  void b4BothFactorsMustSucceedTogether() throws Exception {
    try (var b = new Browser()) {
      var session = b.login("alex@aster.local").path("id").asText();
      var id = b.challenge();
      failure(
          () -> service.verify(ALEX, session, id, "012345", "wrong", null), "INVALID_VERIFICATION");
      failure(
          () -> service.verify(ALEX, session, id, "999999", "demo-password", null),
          "INVALID_VERIFICATION");
      assertThat(count("action_authorizations")).isZero();
      service.verify(ALEX, session, id, "012345", "demo-password", null);
      assertThat(count("action_authorizations")).isEqualTo(1);
    }
  }

  @Test
  void requestHeadersCannotSupplyCustomerIdentity() throws Exception {
    try (var client = HttpClient.newHttpClient()) {
      var response =
          client.send(
              HttpRequest.newBuilder(URI.create(base + "/customer/accounts"))
                  .header("X-Customer-Id", ALEX)
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      assertThat(response.statusCode()).isEqualTo(401);
    }
  }

  @Test
  void securityWireValidationDoesNotCoerceOrIgnoreUnknownFields() throws Exception {
    try (var b = new Browser()) {
      b.get("/customer/session");
      for (var body :
          List.of(
              "{\"email\":\"alex@aster.local\",\"password\":123}",
              "{\"email\":\"alex@aster.local\",\"password\":\"demo-password\",\"customerId\":\"other\"}",
              "{\"email\":\"alex@aster.local\"}")) {
        var r = b.post("/customer/auth/login", body);
        assertThat(r.statusCode()).isEqualTo(400);
        assertThat(r.body()).contains("INVALID_REQUEST").doesNotContain("demo-password");
      }
    }
  }

  void defaultSessionCookieIsSecureEvenWithoutHttpsRequest() {
    var serializer =
        context.getBean(org.springframework.session.web.http.DefaultCookieSerializer.class);
    var request = new org.springframework.mock.web.MockHttpServletRequest();
    var response = new org.springframework.mock.web.MockHttpServletResponse();
    serializer.writeCookieValue(
        new org.springframework.session.web.http.CookieSerializer.CookieValue(
            request, response, "test-session"));
    assertThat(response.getHeader("Set-Cookie"))
        .contains("Secure", "HttpOnly", "SameSite=Lax", "Path=/");
  }

  @Test
  void securityFlowsDoNotLogCredentialsHashesOrCodes() throws Exception {
    var logger =
        (ch.qos.logback.classic.Logger)
            org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    var appender =
        new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
    appender.start();
    logger.addAppender(appender);
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var c = b.challenge();
      b.post(
          "/customer/auth/step-up-challenges/" + c + "/verify",
          JSON.writeValueAsString(
              Map.of("code", B4TestVerification.code(db, c), "password", "demo-password")));
      b.post(
          "/customer/auth/login",
          "{\"email\":\"alex@aster.local\",\"password\":\"wrong-secret-marker\"}");
      var hash =
          db.queryForObject(
              "select password_hash from customer_credentials where customer_id=?",
              String.class,
              ALEX);
      var output =
          appender.list.stream()
              .map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
              .reduce("", (a, v) -> a + "\n" + v);
      assertThat(output).doesNotContain("demo-password", "wrong-secret-marker", "012345", hash);
    } finally {
      logger.detachAppender(appender);
      appender.stop();
    }
  }

  @Test
  void allFrozenCustomerOperationsAreImplemented() {
    var mapping =
        context.getBean(
            "requestMappingHandlerMapping",
            org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
                .class);
    var paths =
        mapping.getHandlerMethods().entrySet().stream()
            .filter(e -> e.getValue().getBeanType().getName().contains(".adapter.web."))
            .flatMap(e -> e.getKey().getPatternValues().stream())
            .filter(p -> p.startsWith("/customer/"))
            .toList();
    assertThat(paths)
        .hasSize(87)
        .contains(
            "/customer/session",
            "/customer/auth/login",
            "/customer/auth/logout",
            "/customer/auth/step-up-challenges",
            "/customer/auth/step-up-challenges/{challengeId}",
            "/customer/auth/step-up-challenges/{challengeId}/verify");
  }

  @Test
  @Order(Integer.MAX_VALUE - 1)
  void sessionsChallengesAuthorizationsEventsSurviveApplicationReconstruction() throws Exception {
    try (var b = new Browser()) {
      var s = b.login("alex@aster.local").path("id").asText();
      var c = b.challenge();
      var a = B4TestVerification.verify(db, service, ALEX, s, c, "246810", null).authorization();
      var events = count("security_events");
      var time = clock.value;
      context.close();
      open("demo", "local", "test");
      clock.value = time;
      assertThat(b.get("/customer/accounts").statusCode()).isEqualTo(200);
      assertThat(b.get("/customer/auth/step-up-challenges/" + c).statusCode()).isEqualTo(200);
      assertThat(service.validate(a.id(), binding(s)).status())
          .isEqualTo(AuthorizationStatus.ACTIVE);
      assertThat(count("security_events")).isEqualTo(events);
      assertThat(b.get("/customer/demo/sms/" + c).body()).contains("012345");
    }
  }

  @Test
  @Order(Integer.MAX_VALUE)
  void defaultProfileHasSecureCookiesNoDemoSeedOrLocalCors() throws Exception {
    context.close();
    // Remove demo fixture, proving a default startup cannot seed credentials.
    try (var connection =
            java.sql.DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        var statement = connection.createStatement()) {
      statement.execute("truncate customers cascade");
      statement.execute("truncate spring_session cascade");
    }
    open("integration");
    assertThat(count("customer_credentials")).isZero();
    assertThat(context.getBean(SmsSender.class).available()).isFalse();
    assertThat(context.getBean(SmsSender.class).demoInboxAvailable()).isFalse();
    defaultSessionCookieIsSecureEvenWithoutHttpsRequest();
    // Seed only from the test to exercise an authenticated default-profile customer.
    context
        .getBean(DemoDataInitializer.class)
        .initialize(ReadDomainFixtures.withOther(JSON), TransferFixtures.recipients());
    B4TestVerification.phones(db);
    service.login(ALEX, "production-isolation", null);
    failure(
        () ->
            service.create(
                new Binding(
                    ALEX,
                    "production-isolation",
                    "TRANSFER_INTENT",
                    "intent-production",
                    "hash-production"),
                com.asterbank.banking.security.domain.VerificationAction.TRANSFER_EXECUTE,
                null),
        "VERIFICATION_UNAVAILABLE");
    failure(
        () -> service.message(ALEX, "production-isolation", "any-challenge"),
        "DEMO_SMS_UNAVAILABLE");
    assertThat(count("demo_sms_outbox")).isZero();
    assertThat(count("step_up_challenges")).isZero();
    try (var b = new Browser();
        var client = HttpClient.newHttpClient()) {
      assertThat(b.get("/customer/session").headers().allValues("set-cookie").toString())
          .contains("Secure");
      var r =
          client.send(
              HttpRequest.newBuilder(URI.create(base + "/customer/session"))
                  .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                  .header("Origin", "http://localhost:3000")
                  .header("Access-Control-Request-Method", "GET")
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      assertThat(r.statusCode()).isEqualTo(403);
    }
  }
}
