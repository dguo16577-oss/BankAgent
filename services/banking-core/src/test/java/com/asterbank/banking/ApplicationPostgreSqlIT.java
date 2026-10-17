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
class ApplicationPostgreSqlIT {
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
      if (path.startsWith("/customer/applications")) builder.header("Idempotency-Key", key);
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

    final java.util.Map<String, JsonNode> prepared = new java.util.HashMap<>();
    final java.util.Map<String, String> grants = new java.util.HashMap<>();

    HttpResponse<String> postVerified(String path, String body) throws Exception {
      if (!path.equals(PATH)) return post(path, body);
      var input = JSON.readTree(body);
      if (!input.isObject()) return post(path, body);
      synchronized (prepared) {
        var intent = prepared.get(key);
        if (intent == null) {
          var review = post("/customer/application-intents", body);
          if (review.statusCode() != 201 && review.statusCode() != 200) return review;
          intent = JSON.readTree(review.body());
          prepared.put(key, intent);
          B4TestVerification.phones(db);
          var identity = JSON.readTree(get("/customer/session").body());
          var session = identity.path("id").asText();
          var grant =
              B4TestVerification.grant(
                  db,
                  context.getBean(com.asterbank.banking.security.application.SecurityService.class),
                  new com.asterbank.banking.security.domain.SecurityState.Binding(
                      identity.path("user").path("id").asText(),
                      session,
                      "APPLICATION_INTENT",
                      intent.path("id").asText(),
                      intent.path("intentHash").asText()),
                  com.asterbank.banking.security.domain.VerificationAction.valueOf(
                      intent.path("actionType").asText()));
          grants.put(key, grant);
        }
        var object = (tools.jackson.databind.node.ObjectNode) input;
        object.put("intentId", intent.path("id").asText());
        object.put("intentHash", intent.path("intentHash").asText());
        object.put("actionAuthorizationId", grants.get(key));
        body = JSON.writeValueAsString(object);
      }
      return post(path, body);
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

  static final String PATH = "/customer/applications";

  static String request(String product, String account) {
    var details =
        switch (product) {
          case "everyday-debit-card", "travel-credit-card" -> "\"cardUsage\":\"EVERYDAY\"";
          case "personal-loan" -> "\"employmentStatus\":\"EMPLOYED\"";
          case "home-mortgage" ->
              "\"employmentStatus\":\"EMPLOYED\",\"propertyType\":\"APARTMENT\"";
          case "overdraft" -> "\"employmentStatus\":\"EMPLOYED\"";
          case "flexible-savings" ->
              "\"savingsGoal\":\"GENERAL\",\"plannedMonthlyContribution\":{\"amount\":\"500.00\",\"currency\":\"CNY\"}";
          case "life-insurance" ->
              "\"coverageAmount\":{\"amount\":\"100000.00\",\"currency\":\"CNY\"},\"beneficiaryRelationship\":\"SPOUSE\"";
          case "health-insurance" ->
              "\"coverageAmount\":{\"amount\":\"100000.00\",\"currency\":\"CNY\"},\"householdSize\":2";
          case "travel-insurance" ->
              "\"tripStartDate\":\"2026-11-01\",\"tripEndDate\":\"2026-11-14\"";
          case "home-insurance" ->
              "\"coverageAmount\":{\"amount\":\"500000.00\",\"currency\":\"CNY\"},\"propertyType\":\"APARTMENT\"";
          default -> "";
        };
    return "{\"productId\":\""
        + product
        + "\",\"accountId\":\""
        + account
        + "\",\"contactEmail\":\"alex@example.com\",\"consent\":true,\"applicationDetails\":{"
        + details
        + "}}";
  }

  static String card() {
    return request("everyday-debit-card", "acc_current");
  }

  static String loan() {
    return request("personal-loan", "acc_current")
        .replaceFirst(
            "}$",
            ",\"monthlyIncome\":{\"amount\":\"12000.00\",\"currency\":\"CNY\"},\"requestedAmount\":{\"amount\":\"10000.00\",\"currency\":\"CNY\"},\"termMonths\":12,\"purpose\":\"PERSONAL\"}");
  }

  static String mortgage() {
    return request("home-mortgage", "acc_current")
        .replaceFirst(
            "}$",
            ",\"monthlyIncome\":{\"amount\":\"30000.00\",\"currency\":\"CNY\"},\"requestedAmount\":{\"amount\":\"1000000.00\",\"currency\":\"CNY\"},\"termMonths\":240,\"purpose\":\"HOME_PURCHASE\"}");
  }

  static String overdraft() {
    return request("overdraft", "acc_current")
        .replaceFirst(
            "}$",
            ",\"monthlyIncome\":{\"amount\":\"12000.00\",\"currency\":\"CNY\"},\"requestedAmount\":{\"amount\":\"10000.00\",\"currency\":\"CNY\"}}");
  }

  @Test
  void mortgageAndOverdraftPersistAsReviewOnlyRequests() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var balances = db.queryForList("select account_id,balance from accounts order by account_id");
      assertThat(
              b.post(
                      "/customer/application-intents",
                      overdraft().replace("acc_current", "acc_savings"))
                  .statusCode())
          .isEqualTo(400);
      for (var item :
          List.of(Map.entry("home-mortgage", mortgage()), Map.entry("overdraft", overdraft()))) {
        b.key = "intake-" + item.getKey();
        var response = b.postVerified(PATH, item.getValue());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        var body = JSON.readTree(response.body());
        assertThat(body.path("status").asText()).isEqualTo("SUBMITTED");
        assertThat(body.path("productType").asText()).isIn("MORTGAGE", "OVERDRAFT");
        assertThat(b.get(PATH + "/" + body.path("id").asText()).statusCode()).isEqualTo(200);
      }
      assertThat(db.queryForList("select account_id,balance from accounts order by account_id"))
          .isEqualTo(balances);
      assertThat(db.queryForObject("select count(*) from product_applications", Integer.class))
          .isEqualTo(2);
      assertThatThrownBy(
              () ->
                  db.update(
                      "update product_applications set purpose=null where product_type='MORTGAGE'"))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
  }

  @Test
  void authenticatesAndProtectsCsrf() throws Exception {
    try (var b = new Browser()) {
      assertThat(b.get(PATH).statusCode()).isEqualTo(401);
      b.login("alex@aster.local");
      assertThat(b.call("POST", PATH, card(), false).statusCode()).isEqualTo(403);
      var r = b.postVerified(PATH, card());
      assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
      assertThat(JSON.readTree(r.body()).path("status").asText()).isEqualTo("SUBMITTED");
      assertThat(JSON.readTree(b.get(PATH).body()).path("items").size()).isEqualTo(1);
    }
  }

  @Test
  void loanPersistsWithoutMovingBalancesOrIssuingCards() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before =
          db.queryForList(
              "select account_id,balance,pending_amount from accounts order by account_id");
      var result = b.postVerified(PATH, loan());
      assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
      var id = JSON.readTree(result.body()).path("id").asText();
      assertThat(
              JSON.readTree(b.get(PATH + "/" + id).body())
                  .path("requestedAmount")
                  .path("amount")
                  .asText())
          .isEqualTo("10000.00");
      assertThat(
              db.queryForList(
                  "select account_id,balance,pending_amount from accounts order by account_id"))
          .isEqualTo(before);
      context.close();
      open("local", "test");
      assertThat(b.get(PATH + "/" + id).statusCode()).isEqualTo(200);
      assertThat(db.queryForObject("select count(*) from product_applications", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void savingsAndInsuranceIntakePersistWithoutOpeningAccountsOrPolicies() throws Exception {
    try (var b = new Browser()) {
      for (var slug : List.of("flexible-savings", "life-insurance")) {
        var detail = b.get("/public/catalog/" + slug);
        assertThat(detail.statusCode()).as(detail.body()).isEqualTo(200);
        assertThat(detail.body()).contains("Apply on this page after signing in.");
      }
      b.login("alex@aster.local");
      var before = db.queryForList("select account_id,balance from accounts order by account_id");
      String finalId = null;
      for (var product :
          List.of(
              "flexible-savings",
              "life-insurance",
              "health-insurance",
              "travel-insurance",
              "home-insurance")) {
        b.key = "intake-" + product;
        var result = b.postVerified(PATH, request(product, "acc_current"));
        assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
        var body = JSON.readTree(result.body());
        finalId = body.path("id").asText();
        assertThat(body.path("status").asText()).isEqualTo("SUBMITTED");
        assertThat(body.path("monthlyIncome").isMissingNode()).isTrue();
        assertThat(body.path("applicationDetails").isObject()).isTrue();
        assertThat(
                JSON.readTree(b.get(PATH + "/" + body.path("id").asText()).body())
                    .path("applicationDetails"))
            .isEqualTo(body.path("applicationDetails"));
      }
      assertThat(db.queryForList("select account_id,balance from accounts order by account_id"))
          .isEqualTo(before);
      assertThat(db.queryForObject("select count(*) from product_applications", Integer.class))
          .isEqualTo(5);
      context.close();
      open("local", "test");
      assertThat(
              JSON.readTree(b.get(PATH + "/" + finalId).body())
                  .path("applicationDetails")
                  .path("propertyType")
                  .asText())
          .isEqualTo("APARTMENT");
    }
  }

  @Test
  void isolatesCustomerAndRejectsForeignAccount() throws Exception {
    try (var a = new Browser();
        var b = new Browser()) {
      a.login("alex@aster.local");
      b.login("other@aster.local");
      var result = a.postVerified(PATH, card());
      assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
      var id = JSON.readTree(result.body()).path("id").asText();
      assertThat(b.get(PATH + "/" + id).statusCode()).isEqualTo(404);
      assertThat(JSON.readTree(b.get(PATH).body()).path("items").size()).isZero();
      assertThat(b.postVerified(PATH, card()).statusCode()).isEqualTo(404);
      assertThat(b.postVerified(PATH, request("everyday-debit-card", "acc_other")).statusCode())
          .isEqualTo(201);
    }
  }

  @Test
  void idempotencyAndConcurrentSubmissionProduceOneRow() throws Exception {
    try (var a = new Browser()) {
      a.login("alex@aster.local");
      try (var pool = Executors.newFixedThreadPool(2)) {
        var one = pool.submit(() -> a.postVerified(PATH, card()));
        var two = pool.submit(() -> a.postVerified(PATH, card()));
        var r1 = one.get();
        var r2 = two.get();
        assertThat(r1.statusCode()).as(r1.body()).isEqualTo(201);
        assertThat(r2.statusCode()).as(r2.body()).isEqualTo(201);
        assertThat(JSON.readTree(r1.body()).path("id"))
            .isEqualTo(JSON.readTree(r2.body()).path("id"));
      }
      assertThat(
              a.postVerified(PATH, card().replace("alex@example.com", "different@example.com"))
                  .statusCode())
          .isEqualTo(409);
      a.key = "different";
      assertThat(a.postVerified(PATH, card()).statusCode()).isEqualTo(409);
      assertThat(db.queryForObject("select count(*) from product_applications", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void invalidInputsAreRejectedAndSensitiveFieldsNeverReturned() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      for (String input :
          List.of(
              card().replace("true", "false"),
              card().replace("alex@example.com", "invalid"),
              card().replace("\"consent\":true", "\"customerId\":\"someone\",\"consent\":true"),
              card().replace("\"cardUsage\":\"EVERYDAY\"", "\"savingsGoal\":\"GENERAL\""),
              request("travel-insurance", "acc_current").replace("2026-11-14", "2026-10-01"),
              loan().replace("10000.00", "-100.00"),
              loan().replace("12000.00", "0.00"),
              loan().replace("12,", "7,"),
              loan().replace("CNY", "USD"),
              loan().replace("\"10000.00\"", "10000.00"))) {
        var r = b.postVerified(PATH, input);
        assertThat(r.statusCode()).as(r.body() + input).isEqualTo(400);
      }
      var r = b.postVerified(PATH, card());
      assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
      assertThat(r.body())
          .contains("••••")
          .doesNotContain("customerId", "password", "idempotency", "consent");
      assertThat(b.get(PATH + "/missing").statusCode()).isEqualTo(404);
    }
  }
}
