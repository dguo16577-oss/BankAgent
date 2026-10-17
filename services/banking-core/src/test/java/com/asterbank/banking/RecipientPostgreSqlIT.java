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
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RecipientPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final String ALEX = "usr_aster_alex";
  static final JsonMapper JSON = JsonMapper.builder().build();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;

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
    TransferFixtures.TestClock testClock() {
      return new TransferFixtures.TestClock();
    }
  }

  static void open(String... profiles) {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(Config.class)
            .profiles(profiles)
            .run("--server.port=0");
    db = context.getBean(JdbcTemplate.class);

    clock = context.getBean(TransferFixtures.TestClock.class);
    base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
  }

  @BeforeAll
  static void start() {
    POSTGRES.start();
    open("local", "test");
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
    String key = "application-test";
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(String method, String path, String body, boolean csrf)
        throws Exception {
      var builder =
          HttpRequest.newBuilder(URI.create(base + path))
              .header("Content-Type", "application/json");
      builder.header("Idempotency-Key", key);
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

    final java.util.Map<String, String> verifiedGrants = new java.util.HashMap<>();

    HttpResponse<String> postVerified(String path, String body) throws Exception {
      return post(
          path,
          B4TestVerification.verifiedBody(db, this::get, this::post, path, body, verifiedGrants));
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
              "{\"resourceType\":\"CARD_ACTION_INTENT\",\"resourceId\":\"intent_security_test\",\"resourceHash\":\"sha256:test-binding\"}");
      assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
      return JSON.readTree(r.body()).path("id").asText();
    }

    public void close() {
      client.close();
    }
  }

  static JsonNode ok(HttpResponse<String> response) {
    assertThat(response.statusCode()).as(response.body()).isIn(200, 201);
    return JSON.readTree(response.body());
  }

  static JsonNode prepare(Browser b, String destination) throws Exception {
    return ok(
        b.post(
            "/customer/recipient-action-intents",
            JSON.writeValueAsString(
                Map.of("actionType", "CREATE", "destinationRef", destination))));
  }

  static String execution(JsonNode i) {
    return JSON.writeValueAsString(
        Map.of("intentId", i.path("id").asText(), "intentHash", i.path("intentHash").asText()));
  }

  static JsonNode create(Browser b, String destination) throws Exception {
    return ok(b.postVerified("/customer/recipients", execution(prepare(b, destination))));
  }

  static JsonNode deactivate(Browser b, String id) throws Exception {
    var i =
        ok(
            b.post(
                "/customer/recipient-action-intents",
                JSON.writeValueAsString(Map.of("actionType", "DEACTIVATE", "recipientId", id))));
    b.key = UUID.randomUUID().toString();
    return ok(b.postVerified("/customer/recipient-actions", execution(i)));
  }

  static JsonNode transfer(Browser b, String recipient) throws Exception {
    return ok(
        b.post(
            "/customer/transfer-intents",
            JSON.writeValueAsString(
                Map.of(
                    "sourceAccountId",
                    "acc_current",
                    "recipientId",
                    recipient,
                    "amount",
                    Map.of("amount", "10.00", "currency", "CNY")))));
  }

  @Test
  void immediateTransferRejectsMissingVerificationOverRealHttp() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var intent = transfer(b, "recipient_zhang");
      var response = b.post("/customer/transfers", execution(intent));
      assertThat(response.statusCode()).as(response.body()).isEqualTo(403);
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class)).isZero();
      assertThat(db.queryForObject("select count(*) from action_authorizations", Integer.class))
          .isZero();
    }
  }

  @Test
  void createSearchDetailsAndOriginalCurrency() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var r = create(b, "demo-lin");
      var id = r.path("id").asText();
      assertThat(r.path("status").asText()).isEqualTo("ACTIVE");
      assertThat(r.path("verificationStatus").asText()).isEqualTo("UNVERIFIED");
      assertThat(ok(b.get("/customer/recipients/" + id))).isEqualTo(r);
      assertThat(ok(b.get("/customer/recipients?search=lin")).path("items").size()).isEqualTo(1);
      assertThat(ok(b.get("/customer/recipients?search=%25")).path("items").size()).isZero();
      b.key = "another";
      create(b, "demo-lin-savings");
      assertThat(ok(b.get("/customer/recipients?search=Lin")).path("items").size()).isEqualTo(2);
    }
  }

  @Test
  void recipientPhoneSearchIsOwnerScopedExactMaskedAndAllowsAmbiguity() throws Exception {
    assertThat(
            db.queryForObject(
                "select phone_e164 from recipients where recipient_id='recipient_zhang'",
                String.class))
        .isNull();
    db.update(
        "update recipients set phone_e164=? where recipient_id='recipient_zhang'",
        "+8613800138000");
    db.update(
        "update recipients set phone_e164=? where recipient_id='recipient_li'", "+8613800138000");
    db.update(
        "update recipients set phone_e164=? where recipient_id='recipient_other'",
        "+8613800138000");
    try (var alex = new Browser();
        var other = new Browser()) {
      alex.login("alex@aster.local");
      other.login("other@aster.local");
      for (var query :
          List.of(
              "13800138000", "%2B8613800138000", "%2B86%20138%200013%208000", "008613800138000")) {
        var items = ok(alex.get("/customer/recipients?search=" + query)).path("items");
        assertThat(items.size()).isEqualTo(2);
        assertThat(items.get(0).path("phoneMasked").asText()).isEqualTo("138****8000");
        assertThat(items.toString()).doesNotContain("13800138000", "+8613800138000");
      }
      assertThat(ok(other.get("/customer/recipients?search=13800138000")).path("items").size())
          .isEqualTo(1);
      assertThat(ok(alex.get("/customer/recipients?search=1380013800")).path("items").size())
          .isZero();
    }
  }

  @Test
  void deactivatePreservesHistoryAndRejectsOldReview() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var r = create(b, "demo-lin");
      var id = r.path("id").asText();
      var paid = ok(b.postVerified("/customer/transfers", execution(transfer(b, id))));
      var receiptBefore = b.get("/customer/transfers/" + paid.path("id").asText()).body();
      b.key = UUID.randomUUID().toString();
      var old = transfer(b, id);
      deactivate(b, id);
      b.key = "old-intent";
      var failed = b.postVerified("/customer/transfers", execution(old));
      assertThat(failed.statusCode()).as(failed.body()).isEqualTo(422);
      assertThat(JSON.readTree(failed.body()).path("code").asText())
          .isEqualTo("RECIPIENT_INACTIVE");
      assertThat(b.get("/customer/transfers/" + paid.path("id").asText()).body())
          .isEqualTo(receiptBefore);
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class)).isEqualTo(1);
    }
  }

  @Test
  void customerIsolationAndNoCSRF() throws Exception {
    try (var a = new Browser();
        var other = new Browser()) {
      a.login("alex@aster.local");
      other.login("other@aster.local");
      var r = create(a, "demo-lin");
      String id = r.path("id").asText();
      assertThat(other.get("/customer/recipients/" + id).statusCode()).isEqualTo(404);
      assertThat(
              other
                  .post(
                      "/customer/recipient-action-intents",
                      "{\"actionType\":\"DEACTIVATE\",\"recipientId\":\"" + id + "\"}")
                  .statusCode())
          .isEqualTo(404);
      assertThat(
              other
                  .post(
                      "/customer/transfer-intents",
                      "{\"sourceAccountId\":\"acc_other\",\"recipientId\":\""
                          + id
                          + "\",\"amount\":{\"amount\":\"1.00\",\"currency\":\"CNY\"}}")
                  .statusCode())
          .isEqualTo(404);
      assertThat(
              a.call(
                      "POST",
                      "/customer/recipient-action-intents",
                      "{\"actionType\":\"CREATE\",\"destinationRef\":\"demo-lin-savings\"}",
                      false)
                  .statusCode())
          .isEqualTo(403);
    }
  }

  @Test
  void idempotencyAndConcurrentDuplicates() throws Exception {
    try (var b = new Browser();
        var pool = Executors.newFixedThreadPool(2)) {
      b.login("alex@aster.local");
      var i = prepare(b, "demo-lin");
      var j = prepare(b, "demo-lin");
      var jobs =
          pool.invokeAll(
              List.<Callable<Integer>>of(
                  () -> b.postVerified("/customer/recipients", execution(i)).statusCode(),
                  () -> b.postVerified("/customer/recipients", execution(j)).statusCode()));
      assertThat(
              jobs.stream()
                  .map(
                      f -> {
                        try {
                          return f.get();
                        } catch (Exception e) {
                          throw new RuntimeException(e);
                        }
                      })
                  .toList())
          .containsExactlyInAnyOrder(200, 409);
      assertThat(
              db.queryForObject(
                  "select count(*) from recipients where destination_ref='demo-lin'",
                  Integer.class))
          .isEqualTo(1);
      var successful = ok(b.get("/customer/recipients?search=Lin")).path("items").get(0);
      var winning =
          successful.path("id").asText().equals(i.path("recipient").path("id").asText()) ? i : j;
      assertThat(ok(b.postVerified("/customer/recipients", execution(winning))))
          .isEqualTo(successful);
    }
  }

  @Test
  void differentKeysStillCannotDuplicateDestination() throws Exception {
    try (var b = new Browser();
        var pool = Executors.newFixedThreadPool(2)) {
      b.login("alex@aster.local");
      var i = prepare(b, "demo-lin");
      var j = prepare(b, "demo-lin");
      var svc =
          context.getBean(
              com.asterbank.banking.customer.payment.application.RecipientManagementService.class);
      var owner = new com.asterbank.banking.shared.domain.CustomerId(ALEX);
      String session =
          db.queryForObject(
              "select session_id from security_sessions where customer_id=? and status='ACTIVE'",
              String.class,
              ALEX);
      var granti =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(
                  ALEX,
                  session,
                  "RECIPIENT_ACTION_INTENT",
                  i.path("id").asText(),
                  i.path("intentHash").asText()),
              com.asterbank.banking.security.domain.VerificationAction.RECIPIENT_CREATE);
      var grantj =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(
                  ALEX,
                  session,
                  "RECIPIENT_ACTION_INTENT",
                  j.path("id").asText(),
                  j.path("intentHash").asText()),
              com.asterbank.banking.security.domain.VerificationAction.RECIPIENT_CREATE);
      var jobs =
          pool.invokeAll(
              List.<Callable<String>>of(
                  () -> {
                    try {
                      svc.execute(
                          owner,
                          session,
                          i.path("id").asText(),
                          i.path("intentHash").asText(),
                          "first",
                          com.asterbank.banking.customer.payment.domain.RecipientAction.Type.CREATE,
                          granti,
                          null);
                      return "ok";
                    } catch (Exception e) {
                      return e.getMessage();
                    }
                  },
                  () -> {
                    try {
                      svc.execute(
                          owner,
                          session,
                          j.path("id").asText(),
                          j.path("intentHash").asText(),
                          "second",
                          com.asterbank.banking.customer.payment.domain.RecipientAction.Type.CREATE,
                          grantj,
                          null);
                      return "ok";
                    } catch (Exception e) {
                      return e.getMessage();
                    }
                  }));
      assertThat(
              jobs.stream()
                  .map(
                      f -> {
                        try {
                          return f.get();
                        } catch (Exception e) {
                          throw new RuntimeException(e);
                        }
                      })
                  .toList())
          .containsExactlyInAnyOrder("ok", "RECIPIENT_ALREADY_EXISTS");
    }
  }

  @Test
  void transferIsSessionBoundAndCannotSubstituteRecipient() throws Exception {
    try (var a = new Browser();
        var b = new Browser()) {
      a.login("alex@aster.local");
      b.login("alex@aster.local");
      var i = transfer(a, "recipient_zhang");
      assertThat(b.postVerified("/customer/transfers", execution(i)).statusCode()).isEqualTo(403);
      String substituted = execution(i).replace("}", ",\"recipientId\":\"recipient_li\"}");
      assertThat(a.postVerified("/customer/transfers", substituted).statusCode()).isEqualTo(400);
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class)).isZero();
    }
  }

  @Test
  void explicitPaymentGrantConsumesOnceAndCardGrantRejected() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var i = transfer(b, "recipient_zhang");
      var security = context.getBean(SecurityService.class);
      String session =
          db.queryForObject(
              "select session_id from security_sessions where customer_id=? and status='ACTIVE'",
              String.class,
              ALEX);
      var card =
          B4TestVerification.create(
              db,
              security,
              new Binding(
                  ALEX,
                  session,
                  "CARD_ACTION_INTENT",
                  i.path("id").asText(),
                  i.path("intentHash").asText()),
              "b2");
      var cardGrant =
          B4TestVerification.verify(db, security, ALEX, session, card.id(), "246810", "b2")
              .authorization();
      String request =
          execution(i).replace("}", ",\"actionAuthorizationId\":\"" + cardGrant.id() + "\"}");
      assertThat(b.postVerified("/customer/transfers", request).statusCode()).isEqualTo(403);
      var challenge =
          ok(
              b.post(
                  "/customer/auth/step-up-challenges",
                  JSON.writeValueAsString(
                      Map.of(
                          "actionType",
                          "TRANSFER_EXECUTE",
                          "resourceType",
                          "TRANSFER_INTENT",
                          "resourceId",
                          i.path("id").asText(),
                          "resourceHash",
                          i.path("intentHash").asText()))));
      assertThat(challenge.path("resourceType").asText()).isEqualTo("TRANSFER_INTENT");
      var verified =
          ok(
              b.post(
                  "/customer/auth/step-up-challenges/" + challenge.path("id").asText() + "/verify",
                  JSON.writeValueAsString(
                      Map.of(
                          "code",
                          B4TestVerification.code(db, challenge.path("id").asText()),
                          "password",
                          "demo-password"))));
      var grant = verified.path("authorization");
      assertThat(grant.path("resourceType").asText()).isEqualTo("TRANSFER_INTENT");
      request =
          execution(i)
              .replace("}", ",\"actionAuthorizationId\":\"" + grant.path("id").asText() + "\"}");
      var paid = ok(b.postVerified("/customer/transfers", request));
      assertThat(ok(b.postVerified("/customer/transfers", request))).isEqualTo(paid);
      assertThat(
              db.queryForObject(
                  "select status from action_authorizations where authorization_id=?",
                  String.class,
                  grant.path("id").asText()))
          .isEqualTo("CONSUMED");
    }
  }

  @Test
  void expiryAndStrictCreationFields() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var i = prepare(b, "demo-lin");
      clock.value = clock.value.plusSeconds(900);
      assertThat(b.postVerified("/customer/recipients", execution(i)).statusCode()).isEqualTo(409);
      assertThat(
              b.post(
                      "/customer/recipient-action-intents",
                      "{\"actionType\":\"CREATE\",\"destinationRef\":\"demo-lin\",\"displayName\":\"Injected\"}")
                  .statusCode())
          .isEqualTo(400);
    }
  }

  @Test
  void mutationRollsBackInsideOuterTransaction() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var i = prepare(b, "demo-lin");
      var svc =
          context.getBean(
              com.asterbank.banking.customer.payment.application.RecipientManagementService.class);
      String session =
          db.queryForObject(
              "select session_id from security_sessions where customer_id=? and status='ACTIVE'",
              String.class,
              ALEX);
      var tx =
          new org.springframework.transaction.support.TransactionTemplate(
              context.getBean(org.springframework.transaction.PlatformTransactionManager.class));
      var grant =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(
                  ALEX,
                  session,
                  "RECIPIENT_ACTION_INTENT",
                  i.path("id").asText(),
                  i.path("intentHash").asText()),
              com.asterbank.banking.security.domain.VerificationAction.RECIPIENT_CREATE);
      tx.execute(
          s -> {
            svc.execute(
                new com.asterbank.banking.shared.domain.CustomerId(ALEX),
                session,
                i.path("id").asText(),
                i.path("intentHash").asText(),
                "rollback",
                com.asterbank.banking.customer.payment.domain.RecipientAction.Type.CREATE,
                grant,
                null);
            s.setRollbackOnly();
            return null;
          });
      assertThat(
              db.queryForObject(
                  "select count(*) from recipients where destination_ref='demo-lin'",
                  Integer.class))
          .isZero();
      assertThat(
              db.queryForObject(
                  "select count(*) from idempotency_records where operation='RECIPIENT_CREATE'",
                  Integer.class))
          .isZero();
      ok(b.postVerified("/customer/recipients", execution(i)));
    }
  }

  @Test
  void concurrentDeactivationAndTransferHaveOneSerialOutcome() throws Exception {
    try (var b = new Browser();
        var pool = Executors.newFixedThreadPool(2)) {
      b.login("alex@aster.local");
      var recipient = create(b, "demo-lin");
      String id = recipient.path("id").asText();
      var payment = transfer(b, id);
      var action =
          ok(
              b.post(
                  "/customer/recipient-action-intents",
                  JSON.writeValueAsString(Map.of("actionType", "DEACTIVATE", "recipientId", id))));
      var gate = new CountDownLatch(1);
      var disable =
          pool.submit(
              () -> {
                gate.await();
                return b.postVerified("/customer/recipient-actions", execution(action));
              });
      var execute =
          pool.submit(
              () -> {
                gate.await();
                return b.postVerified("/customer/transfers", execution(payment));
              });
      gate.countDown();
      assertThat(disable.get().statusCode()).isEqualTo(200);
      var result = execute.get();
      assertThat(result.statusCode()).as(result.body()).isIn(200, 422);
      assertThat(ok(b.get("/customer/recipients/" + id)).path("status").asText())
          .isEqualTo("INACTIVE");
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class))
          .isEqualTo(result.statusCode() == 200 ? 1 : 0);
      assertThat(
              db.queryForObject(
                  "select balance from accounts where account_id='acc_current'",
                  java.math.BigDecimal.class))
          .isEqualByComparingTo(result.statusCode() == 200 ? "23832.31" : "23842.31");
    }
  }

  @Test
  void paymentGrantRejectsWrongHashAndExpiresWithoutDebit() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var i = transfer(b, "recipient_zhang");
      var security = context.getBean(SecurityService.class);
      String session =
          db.queryForObject(
              "select session_id from security_sessions where customer_id=? and status='ACTIVE'",
              String.class,
              ALEX);
      for (String hash : List.of("sha256:wrong", i.path("intentHash").asText())) {
        var challenge =
            B4TestVerification.create(
                db,
                security,
                new Binding(ALEX, session, "TRANSFER_INTENT", i.path("id").asText(), hash),
                "b2");
        var grant =
            B4TestVerification.verify(db, security, ALEX, session, challenge.id(), "246810", "b2")
                .authorization();
        if (hash.equals(i.path("intentHash").asText())) clock.value = clock.value.plusSeconds(120);
        var request =
            JSON.writeValueAsString(
                Map.of(
                    "intentId",
                    i.path("id").asText(),
                    "intentHash",
                    i.path("intentHash").asText(),
                    "actionAuthorizationId",
                    grant.id()));
        assertThat(b.postVerified("/customer/transfers", request).statusCode()).isIn(403, 409);
      }
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class)).isZero();
    }
  }

  @Test
  void upgradeFromV7PreservesExistingRecipientAndUnknownAge() {
    String schema = "b2_upgrade";
    var flyway =
        org.flywaydb.core.Flyway.configure()
            .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
            .schemas(schema)
            .defaultSchema(schema)
            .target("7")
            .load();
    flyway.migrate();
    db.update(
        "insert into b2_upgrade.customers(customer_id,display_name,created_at,account_as_of) values('legacy','Legacy',now(),now())");
    db.update(
        "insert into b2_upgrade.recipients values('legacy_recipient','legacy','Zhang San','Demo','****6018','CNY')");
    org.flywaydb.core.Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .schemas(schema)
        .defaultSchema(schema)
        .load()
        .migrate();
    var row =
        db.queryForMap("select * from b2_upgrade.recipients where recipient_id='legacy_recipient'");
    assertThat(row.get("destination_ref")).isEqualTo("legacy_recipient");
    assertThat(row.get("status")).isEqualTo("ACTIVE");
    assertThat(row.get("created_at")).isNull();
    assertThat(row.get("version")).isEqualTo(0);
    assertThat(db.queryForObject("select count(*) from b2_upgrade.recipients", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void paymentDebitAndGrantConsumptionRollBackTogether() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var i = transfer(b, "recipient_zhang");
      var security = context.getBean(SecurityService.class);
      String session =
          db.queryForObject(
              "select session_id from security_sessions where customer_id=? and status='ACTIVE'",
              String.class,
              ALEX);
      var challenge =
          B4TestVerification.create(
              db,
              security,
              new Binding(
                  ALEX,
                  session,
                  "TRANSFER_INTENT",
                  i.path("id").asText(),
                  i.path("intentHash").asText()),
              "b2");
      var grant =
          B4TestVerification.verify(db, security, ALEX, session, challenge.id(), "246810", "b2")
              .authorization();
      var svc =
          context.getBean(
              com.asterbank.banking.customer.payment.application.TransferExecutionService.class);
      var tx =
          new org.springframework.transaction.support.TransactionTemplate(
              context.getBean(org.springframework.transaction.PlatformTransactionManager.class));
      tx.execute(
          state -> {
            svc.execute(
                new com.asterbank.banking.shared.domain.CustomerId(ALEX),
                i.path("id").asText(),
                i.path("intentHash").asText(),
                "rollback-payment",
                session,
                grant.id(),
                "b2");
            state.setRollbackOnly();
            return null;
          });
      assertThat(
              db.queryForObject(
                  "select status from action_authorizations where authorization_id=?",
                  String.class,
                  grant.id()))
          .isEqualTo("ACTIVE");
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class)).isZero();
      assertThat(
              db.queryForObject(
                  "select balance from accounts where account_id='acc_current'",
                  java.math.BigDecimal.class))
          .isEqualByComparingTo("23842.31");
      assertThat(
              db.queryForObject(
                  "select count(*) from security_events where type='AUTHORIZATION_CONSUMED'",
                  Integer.class))
          .isZero();
    }
  }

  @Test
  @Order(99)
  void recipientsAndReceiptsSurviveApplicationRestart() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var r = create(b, "demo-lin");
      String id = r.path("id").asText();
      context.close();
      open("local", "test");
      assertThat(ok(b.get("/customer/recipients/" + id)).path("id").asText()).isEqualTo(id);
    }
  }
}
