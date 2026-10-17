package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.SecurityState.*;
import com.asterbank.banking.shared.adapter.persistence.DemoDataInitializer;
import com.asterbank.banking.shared.domain.CustomerId;
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
class ScheduledPaymentPostgreSqlIT {
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

  static final String DUE = "2026-09-29T09:00:00+08:00";

  ScheduledPaymentService service() {
    return context.getBean(ScheduledPaymentService.class);
  }

  JsonNode prepare(
      Browser b,
      String type,
      String id,
      Integer version,
      String amount,
      String due,
      String recipient)
      throws Exception {
    var body = new LinkedHashMap<String, Object>();
    body.put("actionType", type);
    if (id != null) {
      body.put("scheduleId", id);
      body.put("expectedVersion", version);
    }
    if (!type.equals("CANCEL")) {
      body.put("sourceAccountId", "acc_current");
      body.put("recipientId", recipient);
      body.put("amount", Map.of("amount", amount, "currency", "CNY"));
      body.put("dueAt", due);
    }
    return ok(b.post("/customer/scheduled-payment-intents", JSON.writeValueAsString(body)));
  }

  String confirmation(JsonNode a) {
    return JSON.writeValueAsString(
        Map.of("intentId", a.path("id").asText(), "intentHash", a.path("intentHash").asText()));
  }

  JsonNode confirm(Browser b, JsonNode a) throws Exception {
    b.key = UUID.randomUUID().toString();
    return ok(b.postVerified("/customer/scheduled-payment-actions", confirmation(a)));
  }

  JsonNode create(Browser b) throws Exception {
    return confirm(b, prepare(b, "CREATE", null, null, "500.00", DUE, "recipient_zhang"));
  }

  java.math.BigDecimal balance() {
    return db.queryForObject(
        "select balance from accounts where account_id='acc_current'", java.math.BigDecimal.class);
  }

  long transfers() {
    return db.queryForObject("select count(*) from transfers", Long.class);
  }

  long transactions() {
    return db.queryForObject("select count(*) from transactions", Long.class);
  }

  void due() {
    clock.value = OffsetDateTime.parse(DUE).toInstant();
    service().processDue();
  }

  JsonNode detail(Browser b, JsonNode p) throws Exception {
    return ok(b.get("/customer/scheduled-payments/" + p.path("id").asText()));
  }

  @Test
  void createReviewConfirmListDetailNoDebitAndReplay() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before = balance();
      long tx = transactions();
      var i = prepare(b, "CREATE", null, null, "500.00", DUE, "recipient_zhang");
      assertThat(db.queryForObject("select count(*) from scheduled_payments", Long.class)).isZero();
      var p = confirm(b, i);
      assertThat(p.path("status").asText()).isEqualTo("SCHEDULED");
      assertThat(detail(b, p)).isEqualTo(p);
      assertThat(ok(b.get("/customer/scheduled-payments")).path("items").size()).isEqualTo(1);
      assertThat(ok(b.postVerified("/customer/scheduled-payment-actions", confirmation(i))))
          .isEqualTo(p);
      assertThat(balance()).isEqualByComparingTo(before);
      assertThat(transfers()).isZero();
      assertThat(transactions()).isEqualTo(tx);
    }
  }

  @Test
  void revokingPreparedActionInvalidatesOldConfirmationInTheBank() throws Exception {
    try (var b = new Browser();
        var otherSession = new Browser()) {
      b.login("alex@aster.local");
      otherSession.login("alex@aster.local");
      var before = balance();
      var intent = prepare(b, "CREATE", null, null, "500.00", DUE, "recipient_zhang");
      var path = "/customer/scheduled-payment-intents/" + intent.path("id").asText() + "/cancel";
      var reason = "{\"reason\":\"TASK_REVISED\"}";
      assertThat(otherSession.post(path, reason).statusCode()).isEqualTo(403);
      assertThat(b.call("POST", path, reason, false).statusCode()).isEqualTo(403);
      assertThat(ok(b.post(path, reason)).path("status").asText()).isEqualTo("CANCELLED");
      assertThat(ok(b.post(path, reason)).path("status").asText()).isEqualTo("CANCELLED");
      assertThat(
              ok(b.get("/customer/scheduled-payment-intents/" + intent.path("id").asText()))
                  .path("status")
                  .asText())
          .isEqualTo("CANCELLED");
      b.key = "cancelled-review";
      assertThat(b.postVerified("/customer/scheduled-payment-actions", confirmation(intent)).body())
          .contains("SCHEDULE_INTENT_UNAVAILABLE");
      assertThat(balance()).isEqualByComparingTo(before);
      assertThat(db.queryForObject("select count(*) from scheduled_payments", Long.class)).isZero();
      assertThat(transfers()).isZero();
    }
  }

  @Test
  void pastAndExactNowRejected() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      for (var at : List.of("2026-09-28T07:59:59Z", "2026-09-28T08:00:00Z")) {
        var body =
            Map.of(
                "actionType",
                "CREATE",
                "sourceAccountId",
                "acc_current",
                "recipientId",
                "recipient_zhang",
                "amount",
                Map.of("amount", "500.00", "currency", "CNY"),
                "dueAt",
                at);
        var r = b.post("/customer/scheduled-payment-intents", JSON.writeValueAsString(body));
        assertThat(r.statusCode()).isEqualTo(422);
        assertThat(r.body()).contains("INVALID_SCHEDULE_TIME");
      }
    }
  }

  @Test
  void customerIsolationAndCsrf() throws Exception {
    try (var b = new Browser();
        var other = new Browser()) {
      b.login("alex@aster.local");
      var p = create(b);
      other.login("other@aster.local");
      assertThat(other.get("/customer/scheduled-payments/" + p.path("id").asText()).statusCode())
          .isEqualTo(404);
      assertThat(ok(other.get("/customer/scheduled-payments")).path("items").isEmpty()).isTrue();
      assertThat(b.call("POST", "/customer/scheduled-payment-intents", "{}", false).statusCode())
          .isEqualTo(403);
    }
  }

  @Test
  void amendAmountTimeRecipientAndStaleReview() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before = balance();
      var p = create(b);
      var id = p.path("id").asText();
      var a = prepare(b, "AMEND", id, 0, "600.00", "2026-09-30T09:00:00+08:00", "recipient_li");
      var stale = prepare(b, "CANCEL", id, 0, null, null, null);
      var updated = confirm(b, a);
      assertThat(updated.path("amount").path("amount").asText()).isEqualTo("600.00");
      assertThat(updated.path("recipient").path("id").asText()).isEqualTo("recipient_li");
      b.key = "stale";
      assertThat(b.postVerified("/customer/scheduled-payment-actions", confirmation(stale)).body())
          .contains("SCHEDULE_STATE_CHANGED");
      assertThat(balance()).isEqualByComparingTo(before);
      assertThat(transfers()).isZero();
    }
  }

  @Test
  void cancelRemainsHistoricalAndNeverExecutes() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before = balance();
      var p = create(b);
      var i = prepare(b, "CANCEL", p.path("id").asText(), 0, null, null, null);
      var cancelled = confirm(b, i);
      assertThat(cancelled.path("status").asText()).isEqualTo("CANCELLED");
      assertThat(ok(b.postVerified("/customer/scheduled-payment-actions", confirmation(i))))
          .isEqualTo(cancelled);
      due();
      assertThat(balance()).isEqualByComparingTo(before);
      assertThat(transfers()).isZero();
      assertThat(service().get(new CustomerId(ALEX), p.path("id").asText()).status())
          .isEqualTo(ScheduledPayment.Status.CANCELLED);
    }
  }

  @Test
  void dueCreatesExactlyOneDebitTransferTransactionAndLinkAfterLogout() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before = balance();
      long tx = transactions();
      var p = create(b);
      ok(b.post("/customer/auth/logout", "{}"));
      clock.value = OffsetDateTime.parse(DUE).toInstant().minusNanos(1);
      service().processDue();
      assertThat(transfers()).isZero();
      due();
      service().processDue();
      assertThat(balance())
          .isEqualByComparingTo(before.subtract(new java.math.BigDecimal("500.00")));
      assertThat(transfers()).isEqualTo(1);
      assertThat(transactions()).isEqualTo(tx + 1);
      var done = service().get(new CustomerId(ALEX), p.path("id").asText());
      assertThat(done.status()).isEqualTo(ScheduledPayment.Status.EXECUTED);
      assertThat(done.transferId()).isNotBlank();
      assertThat(done.transactionId()).isNotBlank();
    }
  }

  @Test
  void insufficientFundsFinalFailure() throws Exception {
    failure(
        "update accounts set balance=100,pending_amount=0 where account_id='acc_current'",
        "INSUFFICIENT_FUNDS");
  }

  @Test
  void inactiveRecipientFinalFailure() throws Exception {
    failure(
        "update recipients set status='INACTIVE',version=version+1 where recipient_id='recipient_zhang'",
        "RECIPIENT_INACTIVE");
  }

  @Test
  void frozenAccountFinalFailure() throws Exception {
    failure(
        "update accounts set status='FROZEN' where account_id='acc_current'",
        "ACCOUNT_NOT_ELIGIBLE");
  }

  void failure(String sql, String reason) throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var p = create(b);
      db.update(sql);
      var before = balance();
      long tx = transactions();
      due();
      var failed = service().get(new CustomerId(ALEX), p.path("id").asText());
      assertThat(failed.status()).isEqualTo(ScheduledPayment.Status.FAILED);
      assertThat(failed.failureReason()).isEqualTo(reason);
      assertThat(balance()).isEqualByComparingTo(before);
      assertThat(transfers()).isZero();
      assertThat(transactions()).isEqualTo(tx);
      service().processDue();
      assertThat(transfers()).isZero();
    }
  }

  @Test
  void concurrentProcessorsExactlyOnce() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before = balance();
      long tx = transactions();
      create(b);
      clock.value = OffsetDateTime.parse(DUE).toInstant();
      try (var pool = Executors.newFixedThreadPool(2)) {
        var latch = new CountDownLatch(1);
        var a =
            pool.submit(
                () -> {
                  latch.await();
                  return service().processDue();
                });
        var z =
            pool.submit(
                () -> {
                  latch.await();
                  return service().processDue();
                });
        latch.countDown();
        a.get();
        z.get();
      }
      assertThat(balance())
          .isEqualByComparingTo(before.subtract(new java.math.BigDecimal("500.00")));
      assertThat(transfers()).isEqualTo(1);
      assertThat(transactions()).isEqualTo(tx + 1);
    }
  }

  @Test
  void failureBeforeFinalizationRollsBackEveryFinancialArtifact() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before = balance();
      long tx = transactions();
      var p = create(b);
      db.execute(
          "alter table scheduled_payments add constraint test_reject_execution check(status<>'EXECUTED')");
      try {
        assertThatThrownBy(this::due).isInstanceOf(RuntimeException.class);
      } finally {
        db.execute("alter table scheduled_payments drop constraint test_reject_execution");
      }
      assertThat(balance()).isEqualByComparingTo(before);
      assertThat(transfers()).isZero();
      assertThat(transactions()).isEqualTo(tx);
      assertThat(service().get(new CustomerId(ALEX), p.path("id").asText()).status())
          .isEqualTo(ScheduledPayment.Status.SCHEDULED);
      service().processDue();
      assertThat(transfers()).isEqualTo(1);
    }
  }

  @Test
  void sessionHashAndResourceBinding() throws Exception {
    try (var b = new Browser();
        var other = new Browser()) {
      b.login("alex@aster.local");
      var a = prepare(b, "CREATE", null, null, "500.00", DUE, "recipient_zhang");
      other.login("alex@aster.local");
      assertThat(
              other
                  .postVerified("/customer/scheduled-payment-actions", confirmation(a))
                  .statusCode())
          .isEqualTo(403);
      assertThat(
              b.postVerified(
                      "/customer/scheduled-payment-actions",
                      JSON.writeValueAsString(
                          Map.of("intentId", a.path("id").asText(), "intentHash", "wrong")))
                  .body())
          .contains("SCHEDULE_INTENT_HASH_MISMATCH");
      assertThat(transfers()).isZero();
    }
  }

  @Test
  void dueCancellationRejectedAndStaleConfirmationExpires() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var p = create(b);
      var a = prepare(b, "CANCEL", p.path("id").asText(), 0, null, null, null);
      clock.value = clock.value.plusSeconds(900);
      b.key = "expired";
      assertThat(b.postVerified("/customer/scheduled-payment-actions", confirmation(a)).body())
          .contains("SCHEDULE_INTENT_UNAVAILABLE");
      clock.value = OffsetDateTime.parse(DUE).toInstant();
      assertThatThrownBy(
              () ->
                  service()
                      .prepare(
                          new CustomerId(ALEX),
                          "session",
                          ScheduleAction.Type.CANCEL,
                          p.path("id").asText(),
                          0,
                          null,
                          null))
          .hasMessage("SCHEDULE_ALREADY_DUE");
    }
  }

  @Test
  @Order(90)
  void restartPersistsAndExecutesMissedInstruction() throws Exception {
    String id;
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      id = create(b).path("id").asText();
    }
    var before = balance();
    context.close();
    open("local", "test");
    clock.value = OffsetDateTime.parse(DUE).toInstant().plusSeconds(3600);
    service().processDue();
    var restored = service().get(new CustomerId(ALEX), id);
    assertThat(restored.status())
        .as(restored.failureReason())
        .isEqualTo(ScheduledPayment.Status.EXECUTED);
    assertThat(balance()).isEqualByComparingTo(before.subtract(new java.math.BigDecimal("500.00")));
  }

  @Test
  void spendingAndRecurringUnchangedThroughoutLifecycle() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      create(b);
      clock.value = OffsetDateTime.parse(DUE).toInstant();
      b.login("alex@aster.local");
      var recurring = ok(b.get("/customer/recurring-payments"));
      // Compare the same reporting clock before and after actual BANK_TRANSFER execution.
      var before = ok(b.get("/customer/spending/summary"));
      service().processDue();
      var after = ok(b.get("/customer/spending/summary"));
      assertThat(after).isEqualTo(before);
      assertThat(ok(b.get("/customer/recurring-payments"))).isEqualTo(recurring);
    }
  }

  @Test
  void inactiveAtCreationDenied() throws Exception {
    db.update("update recipients set status='INACTIVE' where recipient_id='recipient_zhang'");
    assertThatThrownBy(
            () ->
                service()
                    .prepare(
                        new CustomerId(ALEX),
                        "s",
                        ScheduleAction.Type.CREATE,
                        null,
                        null,
                        new PrepareTransfer(
                            new com.asterbank.banking.customer.account.domain.AccountId(
                                "acc_current"),
                            new RecipientId("recipient_zhang"),
                            com.asterbank.banking.shared.domain.Money.of("500.00", "CNY"),
                            null),
                        OffsetDateTime.parse(DUE)))
        .hasMessage("RECIPIENT_INACTIVE");
    assertThat(transfers()).isZero();
  }

  @Test
  void tamperedMandateFailsWithoutDebit() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var p = create(b);
      var before = balance();
      db.update(
          "update scheduled_payments set snapshot=jsonb_set(snapshot,'{mandateHash}',to_jsonb('tampered'::text)) where schedule_id=?",
          p.path("id").asText());
      due();
      assertThat(service().get(new CustomerId(ALEX), p.path("id").asText()).failureReason())
          .isEqualTo("SCHEDULE_TERMS_INVALID");
      assertThat(balance()).isEqualByComparingTo(before);
    }
  }

  @Test
  void grantConsumedAtConfirmationAndNotNeededAtDueTime() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var a = prepare(b, "CREATE", null, null, "500.00", DUE, "recipient_zhang");
      var challenge =
          ok(
              b.post(
                  "/customer/auth/step-up-challenges",
                  JSON.writeValueAsString(
                      Map.of(
                          "actionType",
                          "SCHEDULED_PAYMENT_CREATE",
                          "resourceType",
                          "SCHEDULE_ACTION_INTENT",
                          "resourceId",
                          a.path("id").asText(),
                          "resourceHash",
                          a.path("intentHash").asText()))));
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
      var grant = verified.path("authorization").path("id").asText();
      var result =
          ok(
              b.postVerified(
                  "/customer/scheduled-payment-actions",
                  JSON.writeValueAsString(
                      Map.of(
                          "intentId",
                          a.path("id").asText(),
                          "intentHash",
                          a.path("intentHash").asText(),
                          "actionAuthorizationId",
                          grant))));
      assertThat(
              db.queryForObject(
                  "select status from action_authorizations where authorization_id=?",
                  String.class,
                  grant))
          .isEqualTo("CONSUMED");
      due();
      assertThat(service().get(new CustomerId(ALEX), result.path("id").asText()).status())
          .isEqualTo(ScheduledPayment.Status.EXECUTED);
    }
  }

  @Test
  void crashBeforeTransferRollsBackAndCanRestart() throws Exception {
    rollbackAt("transfer_intents", "intent_id not like 'scheduled_transfer_intent_%'");
  }

  @Test
  void crashAfterDebitBeforeTransactionRollsBack() throws Exception {
    rollbackAt("transactions", "type<>'BANK_TRANSFER'");
  }

  void rollbackAt(String table, String condition) throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var p = create(b);
      var before = balance();
      long count = transactions();
      db.execute(
          "alter table " + table + " add constraint test_crash check(" + condition + ") not valid");
      try {
        assertThatThrownBy(this::due).isInstanceOf(RuntimeException.class);
      } finally {
        db.execute("alter table " + table + " drop constraint test_crash");
      }
      assertThat(balance()).isEqualByComparingTo(before);
      assertThat(transfers()).isZero();
      assertThat(transactions()).isEqualTo(count);
      assertThat(service().get(new CustomerId(ALEX), p.path("id").asText()).status())
          .isEqualTo(ScheduledPayment.Status.SCHEDULED);
      service().processDue();
      assertThat(transfers()).isEqualTo(1);
    }
  }

  @Test
  void immediateAndScheduledCannotOverspend() throws Exception {
    db.update("update accounts set balance=800,pending_amount=0 where account_id='acc_current'");
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      create(b);
      clock.value = OffsetDateTime.parse(DUE).toInstant();
      var session = b.login("alex@aster.local").path("id").asText();
      var preparation = context.getBean(TransferPreparationService.class);
      var executor = context.getBean(TransferExecutionService.class);
      var intent =
          preparation.prepare(
              new CustomerId(ALEX),
              new PrepareTransfer(
                  new com.asterbank.banking.customer.account.domain.AccountId("acc_current"),
                  new RecipientId("recipient_li"),
                  com.asterbank.banking.shared.domain.Money.of("500.00", "CNY"),
                  null),
              session);
      var grant =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(
                  ALEX, session, "TRANSFER_INTENT", intent.terms().id(), intent.intentHash()),
              com.asterbank.banking.security.domain.VerificationAction.TRANSFER_EXECUTE);
      try (var pool = Executors.newFixedThreadPool(2)) {
        var latch = new CountDownLatch(1);
        var a =
            pool.submit(
                () -> {
                  latch.await();
                  return service().processDue();
                });
        var z =
            pool.submit(
                () -> {
                  latch.await();
                  try {
                    executor.execute(
                        new CustomerId(ALEX),
                        intent.terms().id(),
                        intent.intentHash(),
                        "immediate-race",
                        session,
                        grant,
                        null);
                  } catch (PaymentFailure e) {
                    assertThat(e.code()).isEqualTo(PaymentFailure.Code.INSUFFICIENT_FUNDS);
                  }
                  return true;
                });
        latch.countDown();
        a.get();
        z.get();
      }
      assertThat(balance()).isEqualByComparingTo("300.00");
      assertThat(transfers()).isEqualTo(1);
    }
  }

  @Test
  void deactivationAndDueProcessingSerializeAndPreserveReceipt() throws Exception {
    try (var b = new Browser()) {
      var session = b.login("alex@aster.local").path("id").asText();
      var soon = clock.value.plusSeconds(60);
      var p =
          confirm(
              b, prepare(b, "CREATE", null, null, "500.00", soon.toString(), "recipient_zhang"));
      var recipients = context.getBean(RecipientManagementService.class);
      var a =
          recipients.prepare(
              new CustomerId(ALEX),
              session,
              RecipientAction.Type.DEACTIVATE,
              null,
              "recipient_zhang");
      var grant =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(ALEX, session, "RECIPIENT_ACTION_INTENT", a.id(), a.hash()),
              com.asterbank.banking.security.domain.VerificationAction.RECIPIENT_DEACTIVATE);
      clock.value = soon;
      try (var pool = Executors.newFixedThreadPool(2)) {
        var latch = new CountDownLatch(1);
        var x =
            pool.submit(
                () -> {
                  latch.await();
                  return service().processDue();
                });
        var y =
            pool.submit(
                () -> {
                  latch.await();
                  return recipients.execute(
                      new CustomerId(ALEX),
                      session,
                      a.id(),
                      a.hash(),
                      "deactivate-race",
                      RecipientAction.Type.DEACTIVATE,
                      grant,
                      null);
                });
        latch.countDown();
        x.get();
        y.get();
      }
      var done = service().get(new CustomerId(ALEX), p.path("id").asText());
      assertThat(done.status())
          .isIn(ScheduledPayment.Status.EXECUTED, ScheduledPayment.Status.FAILED);
      assertThat(transfers()).isEqualTo(done.status() == ScheduledPayment.Status.EXECUTED ? 1 : 0);
      if (done.status() == ScheduledPayment.Status.EXECUTED)
        assertThat(
                context
                    .getBean(TransferExecutionService.class)
                    .get(new CustomerId(ALEX), done.transferId())
                    .recipient()
                    .status())
            .isEqualTo(Recipient.Status.ACTIVE);
    }
  }

  @Test
  void competingAmendAndCancelReviewsCannotBothCommit() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var p = create(b);
      var id = p.path("id").asText();
      var amend = prepare(b, "AMEND", id, 0, "600.00", DUE, "recipient_li");
      var cancel = prepare(b, "CANCEL", id, 0, null, null, null);
      var session =
          db.queryForObject("select session_id from spring_session limit 1", String.class);
      try (var pool = Executors.newFixedThreadPool(2)) {
        var latch = new CountDownLatch(1);
        var futures = new ArrayList<Future<Boolean>>();
        for (var i : List.of(amend, cancel)) {
          var grant =
              B4TestVerification.grant(
                  db,
                  context.getBean(SecurityService.class),
                  new Binding(
                      ALEX,
                      session,
                      "SCHEDULE_ACTION_INTENT",
                      i.path("id").asText(),
                      i.path("intentHash").asText()),
                  com.asterbank.banking.security.domain.VerificationAction.valueOf(
                      i.path("actionType").asText().equals("AMEND")
                          ? "SCHEDULED_PAYMENT_MODIFY"
                          : "SCHEDULED_PAYMENT_CANCEL"));
          futures.add(
              pool.submit(
                  () -> {
                    latch.await();
                    try {
                      service()
                          .confirm(
                              new CustomerId(ALEX),
                              session,
                              i.path("id").asText(),
                              i.path("intentHash").asText(),
                              UUID.randomUUID().toString(),
                              grant,
                              "race");
                      return true;
                    } catch (PaymentFailure e) {
                      assertThat(e.code()).isEqualTo(PaymentFailure.Code.SCHEDULE_STATE_CHANGED);
                      return false;
                    }
                  }));
        }
        latch.countDown();
        int successes = 0;
        for (var f : futures) if (f.get()) successes++;
        assertThat(successes).isEqualTo(1);
      }
      assertThat(transfers()).isZero();
      assertThat(service().get(new CustomerId(ALEX), id).version()).isEqualTo(1);
    }
  }

  @Test
  void v8UpgradeRetainsExistingRecipientAndFinancialState() {
    String schema = "b3_upgrade";
    db.execute("create schema " + schema);
    var flyway =
        org.flywaydb.core.Flyway.configure()
            .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
            .schemas(schema)
            .defaultSchema(schema)
            .locations("classpath:db/migration")
            .target("8")
            .load();
    flyway.migrate();
    db.update(
        "insert into "
            + schema
            + ".customers(customer_id,display_name,created_at,account_as_of) values('upgrade','Upgrade',now(),now())");
    db.update(
        "insert into "
            + schema
            + ".recipients(recipient_id,customer_id,display_name,bank_name,masked_identifier,currency,destination_ref,status,version) values('r','upgrade','Saved','Demo','••1234','CNY','demo-upgrade','INACTIVE',2)");
    org.flywaydb.core.Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .schemas(schema)
        .defaultSchema(schema)
        .locations("classpath:db/migration")
        .load()
        .migrate();
    assertThat(
            db.queryForObject(
                "select status from " + schema + ".recipients where recipient_id='r'",
                String.class))
        .isEqualTo("INACTIVE");
    assertThat(
            db.queryForObject(
                "select version from " + schema + ".recipients where recipient_id='r'",
                Integer.class))
        .isEqualTo(2);
    assertThat(
            db.queryForObject("select count(*) from " + schema + ".scheduled_payments", Long.class))
        .isZero();
    db.execute("drop schema " + schema + " cascade");
  }
}
