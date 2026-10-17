package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.deposit.DepositFailure;
import com.asterbank.banking.customer.deposit.DepositService;
import com.asterbank.banking.security.adapter.security.DemoCredentialSeed;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.net.*;
import java.net.http.*;
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

/** Exercises the actual Flyway schema, row locks and transaction rollback on PostgreSQL. */
class DepositPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final CustomerId ALEX = new CustomerId("usr_aster_alex");
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
  static DepositService deposits;

  @TestConfiguration(proxyBeanMethods = false)
  static class Database {
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
            .sources(Database.class)
            .profiles("local", "demo", "test")
            .run(
                "--server.port=0",
                "--DB_HOST=localhost",
                "--DB_NAME=test",
                "--DB_USER=test",
                "--DB_PASSWORD=test-only");
    db = context.getBean(JdbcTemplate.class);
    deposits = context.getBean(DepositService.class);
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

  @Test
  void currencyAccountsAreIndependentPerCurrencyAndOwned() {
    String jpy = deposits.openCurrencyAccount(ALEX, "JPY");
    String eur = deposits.openCurrencyAccount(ALEX, "EUR");
    assertThat(jpy).isNotEqualTo(eur);
    assertThat(
            db.queryForObject(
                "select currency from accounts where account_id=?", String.class, jpy))
        .isEqualTo("JPY");
    assertThat(
            db.queryForObject(
                "select equivalent_amount from accounts where account_id=?", BigDecimal.class, jpy))
        .isEqualByComparingTo("0.00");
    assertThatThrownBy(() -> deposits.openCurrencyAccount(ALEX, "JPY"))
        .isInstanceOf(DepositFailure.class)
        .hasMessage("CURRENCY_ACCOUNT_ALREADY_OPEN");
  }

  @Test
  void depositPostsBothSidesAndIdempotencyPreventsDoubleDebit() {
    BigDecimal before = balance("acc_current");
    var first = deposits.openTimeDeposit(ALEX, "acc_current", "100.00", "deposit-test-1");
    var replay = deposits.openTimeDeposit(ALEX, "acc_current", "100.00", "deposit-test-1");
    assertThat(replay.id()).isEqualTo(first.id());
    assertThat(balance("acc_current"))
        .isEqualByComparingTo(before.subtract(new BigDecimal("100.00")));
    assertThat(balance(first.depositAccountId())).isEqualByComparingTo("100.00");
    assertThat(
            db.queryForObject(
                "select count(*) from transactions where reference=?", Integer.class, first.id()))
        .isEqualTo(2);
    assertThat(
            db.queryForObject(
                "select count(*) from time_deposits where customer_id=?",
                Integer.class,
                ALEX.value()))
        .isEqualTo(1);
    assertThatThrownBy(
            () -> deposits.openTimeDeposit(ALEX, "acc_current", "101.00", "deposit-test-1"))
        .isInstanceOf(DepositFailure.class)
        .hasMessage("IDEMPOTENCY_KEY_REUSED");
  }

  @Test
  void insufficientFundsLeaveLedgerUntouched() {
    BigDecimal before = balance("acc_current");
    int accounts =
        db.queryForObject(
            "select count(*) from accounts where customer_id=?", Integer.class, ALEX.value());
    assertThatThrownBy(
            () -> deposits.openTimeDeposit(ALEX, "acc_current", "1000000.00", "too-large"))
        .isInstanceOf(DepositFailure.class)
        .hasMessage("INSUFFICIENT_FUNDS");
    assertThat(balance("acc_current")).isEqualByComparingTo(before);
    assertThat(
            db.queryForObject(
                "select count(*) from accounts where customer_id=?", Integer.class, ALEX.value()))
        .isEqualTo(accounts);
  }

  @Test
  void concurrentSameKeyCreatesOneDeposit() throws Exception {
    try (var pool = Executors.newFixedThreadPool(2)) {
      var start = new CountDownLatch(1);
      Callable<String> task =
          () -> {
            start.await();
            return deposits.openTimeDeposit(ALEX, "acc_current", "50.00", "same-key").id();
          };
      var first = pool.submit(task);
      var second = pool.submit(task);
      start.countDown();
      assertThat(first.get(20, TimeUnit.SECONDS)).isEqualTo(second.get(20, TimeUnit.SECONDS));
    }
    assertThat(
            db.queryForObject(
                "select count(*) from time_deposits where idempotency_key='same-key'",
                Integer.class))
        .isEqualTo(1);
  }

  @Test
  void realHttpRequiresSessionCsrfAndPasswordBeforeDebit() throws Exception {
    String base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
    var cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    try (var client = HttpClient.newBuilder().cookieHandler(cookies).build()) {
      var unauthenticated =
          client.send(
              HttpRequest.newBuilder(URI.create(base + "/customer/accounts")).GET().build(),
              HttpResponse.BodyHandlers.ofString());
      assertThat(unauthenticated.statusCode()).isEqualTo(401);
      client.send(
          HttpRequest.newBuilder(URI.create(base + "/customer/session")).GET().build(),
          HttpResponse.BodyHandlers.ofString());
      var bootstrapToken =
          cookies.getCookieStore().getCookies().stream()
              .filter(cookie -> cookie.getName().equals("XSRF-TOKEN") && !cookie.hasExpired())
              .findFirst()
              .orElseThrow()
              .getValue();
      var login =
          client.send(
              HttpRequest.newBuilder(URI.create(base + "/customer/auth/login"))
                  .header("Content-Type", "application/json")
                  .header("X-XSRF-TOKEN", bootstrapToken)
                  .POST(
                      HttpRequest.BodyPublishers.ofString(
                          "{\"email\":\"alex@aster.local\",\"password\":\"demo-password\"}"))
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      assertThat(login.statusCode()).as(login.body()).isEqualTo(200);
      String body =
          "{\"sourceAccountId\":\"acc_current\",\"amount\":\"75.00\",\"password\":\"demo-password\",\"confirm\":true}";
      var noCsrf =
          client.send(depositRequest(base, body, null), HttpResponse.BodyHandlers.ofString());
      assertThat(noCsrf.statusCode()).isEqualTo(403);
      var token =
          cookies.getCookieStore().getCookies().stream()
              .filter(cookie -> cookie.getName().equals("XSRF-TOKEN") && !cookie.hasExpired())
              .findFirst()
              .orElseThrow()
              .getValue();
      var wrong =
          client.send(
              depositRequest(base, body.replace("demo-password", "wrong-password"), token),
              HttpResponse.BodyHandlers.ofString());
      assertThat(wrong.statusCode()).isEqualTo(401);
      var opened =
          client.send(depositRequest(base, body, token), HttpResponse.BodyHandlers.ofString());
      assertThat(opened.statusCode()).as(opened.body()).isEqualTo(201);
      assertThat(opened.body()).contains("depositAccountId").doesNotContain("demo-password");
    }
  }

  private static HttpRequest depositRequest(String base, String body, String csrf) {
    var request =
        HttpRequest.newBuilder(URI.create(base + "/customer/time-deposits"))
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", "http-deposit");
    if (csrf != null) request.header("X-XSRF-TOKEN", csrf);
    return request.POST(HttpRequest.BodyPublishers.ofString(body)).build();
  }

  private static BigDecimal balance(String id) {
    return db.queryForObject(
        "select balance from accounts where account_id=?", BigDecimal.class, id);
  }
}
