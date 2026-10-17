package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;

import com.asterbank.banking.security.adapter.security.DemoCredentialSeed;
import com.asterbank.banking.security.application.SecurityService;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.security.domain.VerificationAction;
import com.asterbank.banking.shared.adapter.persistence.DemoDataInitializer;
import com.asterbank.banking.shared.config.DemoSeed;
import java.net.*;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Two independent browser sessions against a disposable PostgreSQL database. */
class DemoInternalTransferPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final JsonMapper JSON = JsonMapper.builder().build();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
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
  }

  @BeforeAll
  static void start() {
    POSTGRES.start();
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(Config.class)
            .profiles("local", "demo", "test")
            .run(
                "--server.port=0",
                "--DB_HOST=localhost",
                "--DB_NAME=test",
                "--DB_USER=test",
                "--DB_PASSWORD=test-only");
    db = context.getBean(JdbcTemplate.class);
    base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
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
    context.getBean(DemoCredentialSeed.class).run(new DefaultApplicationArguments(new String[0]));
  }

  static final class Browser implements AutoCloseable {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(String method, String path, String body, String key)
        throws Exception {
      var request =
          HttpRequest.newBuilder(URI.create(base + path))
              .header("Content-Type", "application/json");
      if (key != null) request.header("Idempotency-Key", key);
      var csrf =
          cookies.getCookieStore().getCookies().stream()
              .filter(cookie -> cookie.getName().equals("XSRF-TOKEN") && !cookie.hasExpired())
              .findFirst();
      if (!method.equals("GET"))
        csrf.ifPresent(cookie -> request.header("X-XSRF-TOKEN", cookie.getValue()));
      return client.send(
          request
              .method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(body))
              .build(),
          HttpResponse.BodyHandlers.ofString());
    }

    HttpResponse<String> get(String path) throws Exception {
      return call("GET", path, null, null);
    }

    HttpResponse<String> post(String path, String body, String key) throws Exception {
      return call("POST", path, body, key);
    }

    String login(String email) throws Exception {
      assertThat(get("/customer/session").statusCode()).isEqualTo(401);
      var response =
          post(
              "/customer/auth/login",
              JSON.writeValueAsString(Map.of("email", email, "password", "demo-password")),
              null);
      assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
      assertThat(get("/customer/session").statusCode()).isEqualTo(200);
      return JSON.readTree(response.body()).path("id").asText();
    }

    public void close() {
      client.close();
    }
  }

  static JsonNode ok(HttpResponse<String> response) throws Exception {
    assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    return JSON.readTree(response.body());
  }

  static String accountBalance(Browser browser, String account) throws Exception {
    return ok(browser.get("/customer/accounts/" + account)).path("balance").path("amount").asText();
  }

  static JsonNode prepare(Browser alex, String amount) throws Exception {
    return prepare(alex, amount, null);
  }

  static JsonNode prepare(Browser alex, String amount, String note) throws Exception {
    var body = new LinkedHashMap<String, Object>();
    body.put("sourceAccountId", "acc_current");
    body.put("recipientId", "recipient_lin");
    body.put("amount", Map.of("amount", amount, "currency", "CNY"));
    if (note != null) body.put("note", note);
    var response = alex.post("/customer/transfer-intents", JSON.writeValueAsString(body), null);
    assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
    return JSON.readTree(response.body());
  }

  static String authorization(String session, JsonNode intent) {
    return B4TestVerification.grant(
        db,
        context.getBean(SecurityService.class),
        new Binding(
            "usr_aster_alex",
            session,
            "TRANSFER_INTENT",
            intent.path("id").asText(),
            intent.path("intentHash").asText()),
        VerificationAction.TRANSFER_EXECUTE);
  }

  static String execution(JsonNode intent, String grant) throws Exception {
    return JSON.writeValueAsString(
        Map.of(
            "intentId", intent.path("id").asText(),
            "intentHash", intent.path("intentHash").asText(),
            "actionAuthorizationId", grant));
  }

  @Test
  void prepareReplayReturnsSameIntentAndNeverRevivesCancelledState() throws Exception {
    try (var alex = new Browser()) {
      alex.login("alex@aster.local");
      var body =
          JSON.writeValueAsString(
              Map.of(
                  "sourceAccountId",
                  "acc_current",
                  "recipientId",
                  "recipient_lin",
                  "amount",
                  Map.of("amount", "10.00", "currency", "CNY")));
      var first = alex.post("/customer/transfer-intents", body, "prepare-once");
      assertThat(first.statusCode()).as(first.body()).isEqualTo(201);
      var id = JSON.readTree(first.body()).path("id").asText();
      var replay = alex.post("/customer/transfer-intents", body, "prepare-once");
      assertThat(replay.statusCode()).as(replay.body()).isEqualTo(201);
      assertThat(JSON.readTree(replay.body()).path("id").asText()).isEqualTo(id);
      assertThat(
              alex.post(
                      "/customer/transfer-intents", body.replace("10.00", "11.00"), "prepare-once")
                  .statusCode())
          .isEqualTo(409);
      assertThat(
              db.queryForObject("select count(*) from transfer_prepare_idempotency", Integer.class))
          .isEqualTo(1);
      assertThat(db.queryForObject("select count(*) from transfer_intents", Integer.class))
          .isEqualTo(1);
      ok(
          alex.post(
              "/customer/transfer-intents/" + id + "/cancel",
              "{\"reason\":\"USER_CANCELLED\"}",
              null));
      var terminal = alex.post("/customer/transfer-intents", body, "prepare-once");
      assertThat(JSON.readTree(terminal.body()).path("status").asText()).isEqualTo("CANCELLED");
      assertThat(db.queryForObject("select count(*) from transfer_intents", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void splitRequestIsPersistentVisibleOnlyToParticipantsAndDoesNotDebit() throws Exception {
    try (var alex = new Browser();
        var lin = new Browser();
        var zhang = new Browser()) {
      var session = alex.login("alex@aster.local");
      lin.login("lin@aster.local");
      zhang.login("zhang@aster.local");
      var before = accountBalance(alex, "acc_current");
      var prepareBody =
          JSON.writeValueAsString(
              Map.of(
                  "actionType",
                  "CREATE",
                  "receiveAccountId",
                  "acc_current",
                  "totalAmount",
                  Map.of("amount", "100.00", "currency", "CNY"),
                  "payerShare",
                  Map.of("amount", "33.34", "currency", "CNY"),
                  "participants",
                  List.of(
                      Map.of(
                          "recipientId",
                          "recipient_lin",
                          "amountDue",
                          Map.of("amount", "33.33", "currency", "CNY")),
                      Map.of(
                          "recipientId",
                          "recipient_zhang",
                          "amountDue",
                          Map.of("amount", "33.33", "currency", "CNY")))));
      var intent = ok(alex.post("/customer/split-action-intents", prepareBody, null));
      assertThat(intent.path("status").asText()).isEqualTo("PREPARED");
      assertThat(lin.get("/customer/split-bills?role=PARTICIPANT").body()).contains("\"items\":[]");
      var grant =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(
                  "usr_aster_alex",
                  session,
                  "SPLIT_ACTION_INTENT",
                  intent.path("id").asText(),
                  intent.path("intentHash").asText()),
              VerificationAction.SPLIT_REQUEST_CREATE);
      var executeBody =
          JSON.writeValueAsString(
              Map.of(
                  "intentId",
                  intent.path("id").asText(),
                  "intentHash",
                  intent.path("intentHash").asText(),
                  "actionAuthorizationId",
                  grant));
      var committed = ok(alex.post("/customer/split-actions", executeBody, "split-create-once"));
      assertThat(ok(alex.post("/customer/split-actions", executeBody, "split-create-once")))
          .isEqualTo(committed);
      assertThat(committed.path("participants").size()).isEqualTo(2);
      assertThat(accountBalance(alex, "acc_current")).isEqualTo(before);
      assertThat(accountBalance(lin, "acc_lin_current")).isEqualTo("1000.00");
      var id = committed.path("id").asText();
      assertThat(ok(lin.get("/customer/split-bills/" + id)).path("participants").size())
          .isEqualTo(1);
      assertThat(ok(zhang.get("/customer/split-bills/" + id)).path("participants").size())
          .isEqualTo(1);
      assertThat(db.queryForObject("select count(*) from split_bills", Integer.class)).isEqualTo(1);
      assertThat(db.queryForObject("select count(*) from split_participants", Integer.class))
          .isEqualTo(2);
      var cancelIntent =
          ok(
              alex.post(
                  "/customer/split-action-intents",
                  JSON.writeValueAsString(
                      Map.of(
                          "actionType",
                          "CANCEL",
                          "splitId",
                          id,
                          "expectedVersion",
                          committed.path("version").asInt())),
                  null));
      assertThat(cancelIntent.path("status").asText()).isEqualTo("PREPARED");
      var cancelGrant =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(
                  "usr_aster_alex",
                  session,
                  "SPLIT_ACTION_INTENT",
                  cancelIntent.path("id").asText(),
                  cancelIntent.path("intentHash").asText()),
              VerificationAction.SPLIT_REQUEST_CANCEL);
      var cancelBody =
          JSON.writeValueAsString(
              Map.of(
                  "intentId",
                  cancelIntent.path("id").asText(),
                  "intentHash",
                  cancelIntent.path("intentHash").asText(),
                  "actionAuthorizationId",
                  cancelGrant));
      var cancelled = ok(alex.post("/customer/split-actions", cancelBody, "split-cancel-once"));
      assertThat(cancelled.path("status").asText()).isEqualTo("CANCELLED");
      assertThat(ok(alex.post("/customer/split-actions", cancelBody, "split-cancel-once")))
          .isEqualTo(cancelled);
      assertThat(ok(lin.get("/customer/split-bills/" + id)).path("participants").size())
          .isEqualTo(1);
      assertThat(accountBalance(alex, "acc_current")).isEqualTo(before);
      assertThat(accountBalance(lin, "acc_lin_current")).isEqualTo("1000.00");
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class)).isZero();
    }
  }

  @Test
  void concurrentSplitConfirmationCreatesOneBillAndNoDebit() throws Exception {
    try (var alex = new Browser();
        var pool = Executors.newFixedThreadPool(2)) {
      var session = alex.login("alex@aster.local");
      var before = accountBalance(alex, "acc_current");
      var intent =
          ok(
              alex.post(
                  "/customer/split-action-intents",
                  JSON.writeValueAsString(
                      Map.of(
                          "actionType",
                          "CREATE",
                          "receiveAccountId",
                          "acc_current",
                          "totalAmount",
                          Map.of("amount", "100.00", "currency", "CNY"),
                          "payerShare",
                          Map.of("amount", "50.00", "currency", "CNY"),
                          "participants",
                          List.of(
                              Map.of(
                                  "recipientId",
                                  "recipient_lin",
                                  "amountDue",
                                  Map.of("amount", "50.00", "currency", "CNY"))))),
                  null));
      var grant =
          B4TestVerification.grant(
              db,
              context.getBean(SecurityService.class),
              new Binding(
                  "usr_aster_alex",
                  session,
                  "SPLIT_ACTION_INTENT",
                  intent.path("id").asText(),
                  intent.path("intentHash").asText()),
              VerificationAction.SPLIT_REQUEST_CREATE);
      var body =
          JSON.writeValueAsString(
              Map.of(
                  "intentId",
                  intent.path("id").asText(),
                  "intentHash",
                  intent.path("intentHash").asText(),
                  "actionAuthorizationId",
                  grant));
      var gate = new CountDownLatch(1);
      var jobs =
          List.of(
              pool.submit(
                  () -> {
                    gate.await();
                    return alex.post("/customer/split-actions", body, "split-race");
                  }),
              pool.submit(
                  () -> {
                    gate.await();
                    return alex.post("/customer/split-actions", body, "split-race");
                  }));
      gate.countDown();
      var first = ok(jobs.get(0).get());
      var second = ok(jobs.get(1).get());
      assertThat(first).isEqualTo(second);
      assertThat(db.queryForObject("select count(*) from split_bills", Integer.class)).isEqualTo(1);
      assertThat(db.queryForObject("select count(*) from split_participants", Integer.class))
          .isEqualTo(1);
      assertThat(accountBalance(alex, "acc_current")).isEqualTo(before);
      assertThat(db.queryForObject("select count(*) from transfers", Integer.class)).isZero();
    }
  }

  @Test
  void transferCreditsSecondCustomerExactlyOnceAndKeepsSessionsIsolated() throws Exception {
    try (var alex = new Browser();
        var lin = new Browser()) {
      var alexSession = alex.login("alex@aster.local");
      lin.login("lin@aster.local");
      assertThat(accountBalance(alex, "acc_current")).isEqualTo("23842.31");
      assertThat(accountBalance(lin, "acc_lin_current")).isEqualTo("1000.00");
      assertThat(alex.get("/customer/accounts/acc_lin_current").statusCode()).isEqualTo(404);
      assertThat(lin.get("/customer/accounts/acc_current").statusCode()).isEqualTo(404);

      var intent = prepare(alex, "25.00");
      var body = execution(intent, authorization(alexSession, intent));
      var first = ok(alex.post("/customer/transfers", body, "demo-lin-once"));
      var replay = ok(alex.post("/customer/transfers", body, "demo-lin-once"));
      assertThat(replay).isEqualTo(first);
      assertThat(alex.post("/customer/transfers", body, "demo-lin-other-key").statusCode())
          .isEqualTo(409);
      assertThat(accountBalance(alex, "acc_current")).isEqualTo("23817.31");
      assertThat(accountBalance(lin, "acc_lin_current")).isEqualTo("1025.00");
      assertThat(lin.get("/customer/transfers/" + first.path("id").asText()).statusCode())
          .isEqualTo(404);
      var senderTransaction =
          ok(alex.get("/customer/transactions/" + first.path("transactionId").asText()));
      var ownerScopedReceipt = ok(alex.get("/customer/transfers/" + first.path("id").asText()));
      assertThat(senderTransaction.path("reference").asText())
          .isEqualTo("ASTER-" + ownerScopedReceipt.path("id").asText());
      assertThat(ownerScopedReceipt.path("transactionId").asText())
          .isEqualTo(senderTransaction.path("id").asText());
      assertThat(ownerScopedReceipt.path("recipient").path("id").asText())
          .isEqualTo("recipient_lin");
      var credit = ok(lin.get("/customer/transactions?direction=CREDIT"));
      assertThat(credit.path("items").toString())
          .contains(first.path("reference").asText(), "BANK_TRANSFER", "25.00");
      assertThat(
              db.queryForObject(
                  "select count(*) from transactions where customer_id='usr_aster_lin' and direction='CREDIT' and reference=?",
                  Integer.class,
                  first.path("reference").asText()))
          .isEqualTo(1);
    }
  }

  @Test
  void preparedNotePersistsOnSenderTransactionAndIsSearchableWithoutRecipientDisclosure()
      throws Exception {
    try (var alex = new Browser();
        var lin = new Browser()) {
      var session = alex.login("alex@aster.local");
      lin.login("lin@aster.local");
      var note = "项目聚餐";
      var intent = prepare(alex, "5.00", note);
      assertThat(
              db.queryForObject(
                  "select snapshot::text from transfer_intents where intent_id=?",
                  String.class,
                  intent.path("id").asText()))
          .contains(note);
      var paid =
          ok(
              alex.post(
                  "/customer/transfers",
                  execution(intent, authorization(session, intent)),
                  "note-once"));
      var query = java.net.URLEncoder.encode(note, java.nio.charset.StandardCharsets.UTF_8);
      var results = ok(alex.get("/customer/transactions?search=" + query));
      assertThat(results.path("items").size()).isEqualTo(1);
      var debit = results.path("items").get(0);
      assertThat(debit.path("note").asText()).isEqualTo(note);
      assertThat(debit.path("counterparty").path("name").asText()).isEqualTo("Lin Wei");
      assertThat(
              ok(alex.get("/customer/transactions/" + debit.path("id").asText()))
                  .path("note")
                  .asText())
          .isEqualTo(note);
      assertThat(
              db.queryForObject(
                  "select note from transactions where transaction_id=?",
                  String.class,
                  debit.path("id").asText()))
          .isEqualTo(note);
      assertThat(ok(lin.get("/customer/transactions?search=" + query)).path("items").size())
          .isZero();
      assertThat(
              db.queryForObject(
                  "select note from transactions where customer_id='usr_aster_lin' and reference=?",
                  String.class,
                  paid.path("reference").asText()))
          .isNull();
      assertThat(
              db.queryForObject(
                  "select count(*) from transactions where customer_id='usr_aster_alex' and note is null",
                  Integer.class))
          .isPositive();
    }
  }

  @Test
  void failedRecipientCreditRollsBackBothAccountsAndAllowsSameKeyRetry() throws Exception {
    try (var alex = new Browser();
        var lin = new Browser()) {
      var session = alex.login("alex@aster.local");
      lin.login("lin@aster.local");
      var intent = prepare(alex, "25.00");
      var body = execution(intent, authorization(session, intent));
      db.execute(
          "alter table accounts add constraint demo_credit_failure check(account_id <> 'acc_lin_current' or balance <= 1000.00) not valid");
      try {
        assertThat(alex.post("/customer/transfers", body, "demo-lin-retry").statusCode())
            .isEqualTo(500);
        assertThat(accountBalance(alex, "acc_current")).isEqualTo("23842.31");
        assertThat(accountBalance(lin, "acc_lin_current")).isEqualTo("1000.00");
        assertThat(
                db.queryForObject(
                    "select count(*) from idempotency_records where operation='EXECUTE_TRANSFER'",
                    Integer.class))
            .isZero();
      } finally {
        db.execute("alter table accounts drop constraint demo_credit_failure");
      }
      ok(alex.post("/customer/transfers", body, "demo-lin-retry"));
      assertThat(accountBalance(lin, "acc_lin_current")).isEqualTo("1025.00");
    }
  }

  @Test
  void existingAlexDatabaseGetsLinWithoutResettingFinancialState() throws Exception {
    db.execute("truncate customers cascade");
    var seed = context.getBean(DemoDataInitializer.class);
    var original = DemoSeed.load(JSON);
    seed.initialize(original, DemoDataInitializer.alexRecipients());
    db.update("update accounts set balance=20000.00 where account_id='acc_current'");

    seed.initializeDemo(original);
    seed.initializeDemo(original);
    assertThat(
            db.queryForObject(
                "select balance from accounts where account_id='acc_current'", String.class))
        .isEqualTo("20000.00");
    assertThat(
            db.queryForObject(
                "select count(*) from recipients where customer_id='usr_aster_alex' and destination_ref='demo-lin'",
                Integer.class))
        .isEqualTo(1);
    assertThat(
            db.queryForObject(
                "select count(*) from demo_internal_destinations where destination_ref='demo-lin' and target_account_id='acc_lin_current'",
                Integer.class))
        .isEqualTo(1);
  }
}
