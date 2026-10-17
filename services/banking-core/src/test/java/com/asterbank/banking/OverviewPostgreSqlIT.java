package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.card.adapter.persistence.DemoCardSeed;
import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.customer.card.domain.CardActionType;
import com.asterbank.banking.customer.overview.application.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.recurring.adapter.persistence.DemoRecurringSeed;
import com.asterbank.banking.customer.recurring.application.*;
import com.asterbank.banking.customer.spending.application.*;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.wealth.adapter.persistence.DemoWealthSeed;
import com.asterbank.banking.customer.wealth.application.*;
import com.asterbank.banking.customer.wealth.domain.Portfolio;
import com.asterbank.banking.shared.adapter.persistence.*;
import com.asterbank.banking.shared.application.*;
import com.asterbank.banking.shared.domain.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Qualifier;
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
class OverviewPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES =
      new PostgreSQLContainer("postgres:17-alpine")
          .withCommand("postgres", "-c", "shared_preload_libraries=pg_stat_statements");
  static final CustomerId ALEX = new CustomerId("usr_aster_alex"),
      OTHER = new CustomerId("customer_other");
  static final JsonMapper JSON = JsonMapper.builder().build();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
  static OverviewQueryService overview;
  static TransferFixtures.TestClock clock;
  static String base, credentialHash;
  static ProfileProbe profiles;
  static PortfolioProbe portfolio;

  static class ProfileProbe implements CustomerProfileQuery {
    final CustomerProfileQuery source;
    final JdbcTemplate sql;
    volatile CountDownLatch read, release;
    volatile String isolation, readOnly;

    ProfileProbe(CustomerProfileQuery source, JdbcTemplate sql) {
      this.source = source;
      this.sql = sql;
    }

    public Profile profile(CustomerId owner) {
      var result = source.profile(owner);
      var signal = read;
      if (signal != null) {
        isolation = sql.queryForObject("show transaction_isolation", String.class);
        readOnly = sql.queryForObject("show transaction_read_only", String.class);
        signal.countDown();
        try {
          if (!release.await(15, TimeUnit.SECONDS))
            throw new IllegalStateException("Snapshot test timeout");
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException(e);
        }
      }
      return result;
    }
  }

  static class PortfolioProbe implements PortfolioQuery {
    final WealthService source;
    volatile boolean fail;

    PortfolioProbe(WealthService source) {
      this.source = source;
    }

    public Portfolio portfolio(CustomerId owner) {
      if (fail) throw new IllegalStateException("Injected source failure with secret");
      return source.portfolio(owner);
    }
  }

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

    @Bean
    @Primary
    ProfileProbe profileProbe(
        @Qualifier("customerProfileQuery") CustomerProfileQuery source, JdbcTemplate sql) {
      return new ProfileProbe(source, sql);
    }

    @Bean
    @Primary
    PortfolioProbe portfolioProbe(WealthService service) {
      return new PortfolioProbe(service);
    }
  }

  static void open() {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(Config.class)
            .profiles("local", "test")
            .run("--server.port=0");
    db = context.getBean(JdbcTemplate.class);
    overview = context.getBean(OverviewQueryService.class);
    clock = context.getBean(TransferFixtures.TestClock.class);
    profiles = context.getBean(ProfileProbe.class);
    portfolio = context.getBean(PortfolioProbe.class);
    base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
  }

  @BeforeAll
  static void start() {
    POSTGRES.start();
    open();
    db.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    credentialHash = context.getBean(PasswordEncoder.class).encode("demo-password");
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
    db.execute("truncate investment_products cascade");
    clock.value = Instant.parse("2026-09-27T02:30:00Z");
    profiles.read = null;
    profiles.release = null;
    portfolio.fail = false;
    context
        .getBean(DemoDataInitializer.class)
        .initialize(ReadDomainFixtures.withOther(JSON), TransferFixtures.recipients());
    context.getBean(DemoCardSeed.class).initialize();
    context.getBean(DemoRecurringSeed.class).initialize();
    context.getBean(DemoWealthSeed.class).initialize();
    db.update(
        "insert into customer_credentials values(?,?,?,true),(?,?,?,true)",
        ALEX.value(),
        "alex@aster.local",
        credentialHash,
        OTHER.value(),
        "other@aster.local",
        credentialHash);
  }

  CustomerOverviewView view() {
    return overview.query(ALEX);
  }

  String grant(String type, String id, String hash, String action) {
    return B4TestVerification.domainGrant(
        context,
        ALEX.value(),
        B4TestVerification.session(context, ALEX.value()),
        type,
        id,
        hash,
        com.asterbank.banking.security.domain.VerificationAction.valueOf(action));
  }

  void transfer() {
    var i =
        context
            .getBean(TransferPreparationService.class)
            .prepare(
                ALEX,
                new PrepareTransfer(
                    new AccountId("acc_current"),
                    new RecipientId("recipient_zhang"),
                    Money.of("500", "CNY"),
                    "M20"),
                B4TestVerification.session(context, ALEX.value()));
    context
        .getBean(TransferExecutionService.class)
        .execute(
            ALEX,
            i.terms().id(),
            i.intentHash(),
            "m20-transfer",
            B4TestVerification.session(context, ALEX.value()),
            grant("TRANSFER_INTENT", i.terms().id(), i.intentHash(), "TRANSFER_EXECUTE"),
            null);
  }

  void freeze() {
    var cards = context.getBean(CardService.class);
    var i = cards.prepare(ALEX, "card_aster_debit", CardActionType.FREEZE, null);
    cards.execute(ALEX, "unused-session", i.terms().id(), i.intentHash(), null, "m20-freeze", null);
  }

  void stopNetflix() {
    var recurring = context.getBean(RecurringService.class);
    var i = recurring.prepare(ALEX, "rec_netflix");
    recurring.execute(
        ALEX,
        i.terms().id(),
        i.intentHash(),
        "m20-stop",
        B4TestVerification.session(context, ALEX.value()),
        grant(
            "RECURRING_PAYMENT_INTENT",
            i.terms().id(),
            i.intentHash(),
            "RECURRING_STOP_FUTURE_PAYMENTS"),
        null);
  }

  void invest() {
    var wealth = context.getBean(WealthService.class);
    var s = wealth.check(ALEX, "product_bond");
    var i = wealth.prepare(ALEX, "product_bond", "acc_current", Money.of("1000", "CNY"), s.id());
    wealth.execute(
        ALEX,
        i.terms().id(),
        i.intentHash(),
        "m20-invest",
        B4TestVerification.session(context, ALEX.value()),
        grant(
            "INVESTMENT_ORDER_INTENT", i.terms().id(), i.intentHash(), "INVESTMENT_ORDER_EXECUTE"),
        null);
  }

  com.asterbank.banking.customer.account.domain.Account current(CustomerOverviewView v) {
    return v.accounts().accounts().stream()
        .filter(a -> a.id().value().equals("acc_current"))
        .findFirst()
        .orElseThrow();
  }

  void parity(CustomerId owner, CustomerOverviewView v) {
    assertThat(v.user().id()).isEqualTo(owner);
    assertThat(v.accounts()).isEqualTo(context.getBean(AccountQueryService.class).list(owner));
    assertThat(v.spending().summary())
        .isEqualTo(context.getBean(SpendingQueryService.class).query(owner, Map.of()));
    assertThat(v.recentTransactions())
        .isEqualTo(context.getBean(TransactionQueryService.class).recent(owner, null, 5));
    assertThat(v.cards()).isEqualTo(context.getBean(CardService.class).list(owner));
    assertThat(v.wealth()).isEqualTo(context.getBean(WealthService.class).portfolio(owner));
    assertThat(v.upcomingPayments())
        .isEqualTo(context.getBean(RecurringUpcomingQuery.class).upcoming(owner, v.asOf(), 4));
  }

  @Test
  void baselineEveryFragmentMatchesAuthoritativeQueries() {
    var v = view();
    parity(ALEX, v);
    assertThat(v.accounts().totalBalance().decimal()).isEqualTo("36453.68");
    assertThat(v.spending().summary().totalSpend()).isEqualByComparingTo("4968.00");
    assertThat(v.spending().summary().comparisonTotalSpend()).isEqualByComparingTo("4800.00");
    assertThat(v.spending().summary().percentageChange()).isEqualTo("3.50");
    assertThat(v.spending().trend()).hasSize(6);
    assertThat(v.spending().trend().stream().map(t -> t.amount().toPlainString()).toList())
        .containsExactly("4620.00", "5180.00", "4890.00", "5620.00", "5400.00", "4968.00");
    assertThat(v.wealth().totalValue().decimal()).isEqualTo("18320.00");
    assertThat(v.cards()).hasSize(2);
    assertThat(v.recentTransactions()).hasSize(5);
    assertThat(v.upcomingPayments()).hasSize(4);
    assertThat(v.upcomingPayments())
        .extracting(RecurringUpcomingQuery.Upcoming::title)
        .contains("Netflix");
    assertThat(v.asOf().toInstant()).isEqualTo(clock.instant());
  }

  @Test
  void transferChangesOnlyAffectedFinancialFragments() {
    var before = view();
    transfer();
    var after = view();
    parity(ALEX, after);
    assertThat(current(after).balance().decimal()).isEqualTo("23342.31");
    assertThat(current(after).availableBalance().decimal()).isEqualTo("23310.31");
    assertThat(after.spending()).isEqualTo(before.spending());
    assertThat(after.cards()).isEqualTo(before.cards());
    assertThat(after.wealth()).isEqualTo(before.wealth());
    assertThat(after.recentTransactions().getFirst().type().name()).isEqualTo("BANK_TRANSFER");
  }

  @Test
  void freezeImmediatelyChangesCardSummaryOnly() {
    var before = view();
    freeze();
    var after = view();
    parity(ALEX, after);
    assertThat(
            after.cards().stream()
                .filter(c -> c.id().equals("card_aster_debit"))
                .findFirst()
                .orElseThrow()
                .state()
                .status()
                .name())
        .isEqualTo("FROZEN");
    assertThat(after.accounts()).isEqualTo(before.accounts());
    assertThat(after.spending()).isEqualTo(before.spending());
    assertThat(after.wealth()).isEqualTo(before.wealth());
  }

  @Test
  void recurringStopRemovesUpcomingWithoutDeletingHistory() {
    var before = view();
    var history =
        db.queryForList(
            "select transaction_id from transactions where title='Netflix' order by transaction_id");
    stopNetflix();
    var after = view();
    parity(ALEX, after);
    assertThat(after.upcomingPayments()).noneMatch(p -> p.title().equals("Netflix"));
    assertThat(
            db.queryForList(
                "select transaction_id from transactions where title='Netflix' order by transaction_id"))
        .isEqualTo(history);
    assertThat(after.accounts()).isEqualTo(before.accounts());
    assertThat(after.spending()).isEqualTo(before.spending());
    assertThat(after.recentTransactions()).isEqualTo(before.recentTransactions());
  }

  @Test
  void investmentChangesAccountAndPortfolioButNotSpending() {
    var before = view();
    invest();
    var after = view();
    parity(ALEX, after);
    assertThat(current(after).balance().decimal()).isEqualTo("22842.31");
    assertThat(current(after).availableBalance().decimal()).isEqualTo("22810.31");
    assertThat(current(after).pendingAmount().decimal()).isEqualTo("32.00");
    assertThat(after.wealth().totalValue().decimal()).isEqualTo("19320.00");
    assertThat(after.spending()).isEqualTo(before.spending());
    assertThat(after.recentTransactions().getFirst().type().name())
        .isEqualTo("INVESTMENT_PURCHASE");
  }

  @Test
  void combinedMutationsPreserveAllDirectDomainParity() {
    view();
    transfer();
    freeze();
    stopNetflix();
    invest();
    var v = view();
    parity(ALEX, v);
    assertThat(current(v).balance().decimal()).isEqualTo("22342.31");
    assertThat(v.wealth().totalValue().decimal()).isEqualTo("19320.00");
    assertThat(v.spending().summary().totalSpend()).isEqualByComparingTo("4968");
    assertThat(v.upcomingPayments()).noneMatch(p -> p.title().equals("Netflix"));
    assertThat(v.cards().getFirst().state().status().name()).isEqualTo("FROZEN");
  }

  @Test
  void pendingAndInvestmentAreExcludedFromEveryMonthlyBucket() {
    var before = view().spending();
    db.update("update transactions set amount=99999 where status='PENDING'");
    invest();
    assertThat(view().spending()).isEqualTo(before);
  }

  @Test
  void monthlyBucketsUseReportingTimezoneAndMatchDirectSpending() {
    var v = view();
    for (var month : v.spending().trend()) {
      var end = month.periodStart().plusMonths(1);
      if (end.isAfter(v.asOf())) end = v.asOf();
      var direct =
          context
              .getBean(SpendingQueryService.class)
              .query(
                  ALEX,
                  Map.of(
                      "from",
                      month
                          .periodStart()
                          .format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                      "to",
                      end.format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME)));
      assertThat(month.amount()).isEqualByComparingTo(direct.totalSpend());
    }
  }

  @Test
  void missingRiskProfileDoesNotAffectOverview() {
    db.update("delete from customer_risk_profiles where customer_id=?", ALEX.value());
    assertThat(view().wealth().totalValue().decimal()).isEqualTo("18320.00");
  }

  @Test
  void emptyCustomerReturnsLegalZeroSections() throws Exception {
    db.update("delete from transactions where customer_id=?", OTHER.value());
    db.update("delete from cards where customer_id=?", OTHER.value());
    db.update("delete from customer_risk_profiles where customer_id=?", OTHER.value());
    var v = overview.query(OTHER);
    assertThat(v.recentTransactions()).isEmpty();
    assertThat(v.cards()).isEmpty();
    assertThat(v.upcomingPayments()).isEmpty();
    assertThat(v.wealth().positions()).isEmpty();
    assertThat(v.wealth().totalValue().decimal()).isEqualTo("0.00");
    assertThat(v.spending().summary().totalSpend()).isEqualByComparingTo("0.00");
    assertThat(v.spending().summary().percentageChange()).isNull();
    try (var b = new Browser()) {
      b.login("other@aster.local");
      var j = b.get("/customer/overview", 200);
      assertThat(j.path("wealth").path("monthlyChangePercent").isNull()).isTrue();
      assertThat(j.path("accounts")).hasSize(1);
      assertThat(j.path("spending").path("trend")).hasSize(6);
    }
    db.update("delete from accounts where customer_id=?", OTHER.value());
    assertThat(overview.query(OTHER).accounts().totalBalance().decimal()).isEqualTo("0.00");
  }

  @Test
  void nonEmptyOtherCustomerNeverLeaksAnyFragment() throws Exception {
    // Add independently owned recurring/portfolio evidence so all six fragments exercise isolation.
    db.update(
        "INSERT INTO recurring_payments(recurring_payment_id,customer_id,display_name,type,status,frequency,source,management_capability,source_account_id,usual_amount,currency,next_expected_at,business_version,display_order) VALUES('rec_other',?,'Other private schedule','STANDING_ORDER','ACTIVE','MONTHLY','BANK_MANAGED','STOP_FUTURE_PAYMENTS','acc_other',13,'CNY','2026-10-01T00:00:00Z',0,0)",
        OTHER.value());
    db.update(
        "INSERT INTO portfolio_positions VALUES('holding_other',?,'product_cash','Other private holding','MONEY_MARKET','CNY',77,77,0,0,0,'2026-09-27T00:00:00Z',0)",
        OTHER.value());
    var a = view();
    var o = overview.query(OTHER);
    parity(ALEX, a);
    parity(OTHER, o);
    assertThat(o.accounts().accounts())
        .extracting(x -> x.id().value())
        .containsExactly("acc_other");
    assertThat(o.recentTransactions()).extracting(x -> x.id().value()).containsExactly("txn_other");
    assertThat(o.cards()).extracting(x -> x.id()).containsExactly("card_other");
    assertThat(o.upcomingPayments()).extracting(x -> x.id()).containsExactly("rec_other");
    assertThat(o.wealth().totalValue().decimal()).isEqualTo("77.00");
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var j = b.get("/customer/overview", 200);
      assertThat(j.toString())
          .doesNotContain("acc_other", "txn_other", "card_other", "rec_other", "holding_other");
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"STOPPED", "ENDED"})
  void inactiveRecurringNeverAppears(String status) {
    db.update(
        "update recurring_payments set status=?,next_expected_at=null where recurring_payment_id='rec_netflix'",
        status);
    assertThat(view().upcomingPayments()).noneMatch(p -> p.id().equals("rec_netflix"));
  }

  @Test
  void upcomingIsFutureBankManagedStableAndLimited() {
    db.update(
        "update recurring_payments set next_expected_at=? where recurring_payment_id='rec_netflix'",
        OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC));
    assertThat(view().upcomingPayments()).noneMatch(p -> p.id().equals("rec_netflix"));
    db.update(
        "update recurring_payments set next_expected_at='2026-10-01T00:00:00Z' where customer_id=?",
        ALEX.value());
    assertThat(view().upcomingPayments())
        .extracting(x -> x.id())
        .containsExactly("rec_adobe", "rec_chatgpt", "rec_netflix", "rec_rent");
    assertThat(view().upcomingPayments()).noneMatch(p -> p.id().equals("rec_bookshop"));
  }

  @Test
  void transactionTopFiveOrderingUsesStableTieBreaker() {
    db.update(
        "update transactions set occurred_at='2026-09-27T02:30:00Z' where customer_id=?",
        ALEX.value());
    assertThat(view().recentTransactions())
        .extracting(t -> t.id().value())
        .containsExactlyElementsOf(
            db.queryForList(
                "select transaction_id from transactions where customer_id=? order by transaction_id COLLATE \"C\" limit 5",
                String.class,
                ALEX.value()));
  }

  @Test
  void oneRepeatableReadSnapshotCannotMixBeforeAndAfterInvestment() throws Exception {
    var before = view();
    profiles.read = new CountDownLatch(1);
    profiles.release = new CountDownLatch(1);
    try (var pool = Executors.newSingleThreadExecutor()) {
      var future = pool.submit(this::view);
      try {
        assertThat(profiles.read.await(10, TimeUnit.SECONDS)).isTrue();
        invest();
      } finally {
        profiles.release.countDown();
      }
      var inFlight = future.get(15, TimeUnit.SECONDS);
      assertThat(profiles.isolation).isEqualTo("repeatable read");
      assertThat(profiles.readOnly).isEqualTo("on");
      assertThat(inFlight.accounts()).isEqualTo(before.accounts());
      assertThat(inFlight.wealth()).isEqualTo(before.wealth());
      assertThat(inFlight.recentTransactions()).isEqualTo(before.recentTransactions());
    } finally {
      profiles.read = null;
      profiles.release = null;
    }
    assertThat(current(view()).balance().decimal()).isEqualTo("22842.31");
    assertThat(view().wealth().totalValue().decimal()).isEqualTo("19320.00");
  }

  long measuredQueries() {
    return db.queryForObject(
        "SELECT coalesce(sum(calls),0)::bigint FROM pg_stat_statements WHERE query ~* '^select' AND query !~* '(pg_stat_statements|spring_session|security_sessions|customer_credentials)'",
        Long.class);
  }

  @Test
  void sqlCountDoesNotGrowWithAccountsCardsOrRecurring() throws Exception {
    // Observe real SQL emitted by the request, including JDBC queries invisible to Hibernate
    // statistics.
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      db.execute("SELECT pg_stat_statements_reset()");
      b.get("/customer/overview", 200);
      long baseline = measuredQueries();
      System.out.println("M20_HTTP_OVERVIEW_DOMAIN_SELECTS=" + baseline);
      assertThat(baseline).isBetween(16L, 20L);
      db.update(
          "INSERT INTO accounts SELECT 'acc_extra_'||n,customer_id,display_name,account_type,status,currency,balance,pending_amount,masked_identifier,opened_at,equivalent_amount,equivalent_currency,exchange_rate,conversion_as_of FROM accounts CROSS JOIN generate_series(1,25) n WHERE account_id='acc_savings'");
      db.update(
          "INSERT INTO cards(card_id,customer_id,display_name,masked_number,scheme,card_type,status,linked_account_id,linked_account_name,linked_account_masked_number,online_payments,international_payments,atm_withdrawals,contactless,business_version,row_version,display_order,updated_at) SELECT 'card_extra_'||n,customer_id,display_name,masked_number,scheme,card_type,status,linked_account_id,linked_account_name,linked_account_masked_number,online_payments,international_payments,atm_withdrawals,contactless,business_version,row_version,n+10,updated_at FROM cards CROSS JOIN generate_series(1,25) n WHERE card_id='card_aster_debit'");
      db.update(
          "INSERT INTO recurring_payments(recurring_payment_id,customer_id,display_name,type,status,frequency,source,management_capability,source_account_id,usual_amount,currency,next_expected_at,business_version,display_order) SELECT 'rec_extra_'||n,?,'Extra schedule','STANDING_ORDER','ACTIVE','MONTHLY','BANK_MANAGED','STOP_FUTURE_PAYMENTS','acc_current',13,'CNY','2026-10-01T00:00:00Z',0,n FROM generate_series(1,25) n",
          ALEX.value());
      db.execute("SELECT pg_stat_statements_reset()");
      b.get("/customer/overview", 200);
      long grown = measuredQueries();
      System.out.println("M20_HTTP_OVERVIEW_GROWN_DOMAIN_SELECTS=" + grown);
      assertThat(grown).isEqualTo(baseline);
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/customer/transactions?limit=10",
        "/customer/spending/summary",
        "/customer/wealth/portfolio",
        "/customer/recurring-payments"
      })
  void rcReadQueryCountsRemainBoundedWithExpandedTransactions(String path) throws Exception {
    try (var browser = new Browser()) {
      browser.login("alex@aster.local");
      db.execute("SELECT pg_stat_statements_reset()");
      browser.get(path, 200);
      long baseline = measuredQueries();
      db.execute(
          "INSERT INTO transactions SELECT (jsonb_populate_record(null::transactions, to_jsonb(t) || jsonb_build_object('transaction_id', t.transaction_id || '_rc_' || n))).* FROM transactions t CROSS JOIN generate_series(1,5) n");
      db.execute(
          "INSERT INTO recurring_payments SELECT (jsonb_populate_record(null::recurring_payments, to_jsonb(r) || jsonb_build_object('recurring_payment_id', r.recurring_payment_id || '_rc_' || n))).* FROM recurring_payments r CROSS JOIN generate_series(1,5) n");
      db.execute(
          "INSERT INTO recurring_payment_transaction_links SELECT (jsonb_populate_record(null::recurring_payment_transaction_links, to_jsonb(r) || jsonb_build_object('recurring_payment_id', r.recurring_payment_id || '_rc_' || n))).* FROM recurring_payment_transaction_links r CROSS JOIN generate_series(1,5) n");
      db.execute(
          "INSERT INTO investment_products SELECT (jsonb_populate_record(null::investment_products, to_jsonb(p) || jsonb_build_object('product_id', p.product_id || '_rc_' || n))).* FROM investment_products p CROSS JOIN generate_series(1,5) n");
      db.execute(
          "INSERT INTO portfolio_positions SELECT (jsonb_populate_record(null::portfolio_positions, to_jsonb(p) || jsonb_build_object('position_id', p.position_id || '_rc_' || n, 'product_id', CASE WHEN p.product_id IS NULL THEN NULL ELSE p.product_id || '_rc_' || n END))).* FROM portfolio_positions p CROSS JOIN generate_series(1,5) n");
      db.execute("SELECT pg_stat_statements_reset()");
      browser.get(path, 200);
      long expanded = measuredQueries();
      System.out.println("M23_SQL " + path + " baseline=" + baseline + " expanded=" + expanded);
      assertThat(expanded).isEqualTo(baseline);
      assertThat(baseline).isBetween(1L, 20L);
    }
  }

  @Test
  void internalFragmentFailureReturnsOneErrorWithoutPartialMockFallback() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      portfolio.fail = true;
      var e = b.get("/customer/overview", 500);
      assertThat(e.path("code").asText()).isEqualTo("PERSISTENCE_UNAVAILABLE");
      assertThat(e.toString()).doesNotContain("secret", "accounts", "wealth", "18320");
      portfolio.fail = false;
      b.get("/customer/overview", 200);
    }
  }

  @Test
  void realHttpAuthenticationParityAndSpoofedIdentityAreSafe() throws Exception {
    try (var a = new Browser();
        var b = new Browser()) {
      a.get("/customer/overview", 401);
      a.login("alex@aster.local");
      b.login("other@aster.local");
      var v = a.get("/customer/overview", 200);
      assertThat(v.path("user").path("id").asText()).isEqualTo(ALEX.value());
      assertThat(b.get("/customer/overview", 200).path("user").path("id").asText())
          .isEqualTo(OTHER.value());
      assertThat(a.get("/customer/overview?customerId=customer_other", 200)).isEqualTo(v);
      var spoof =
          HttpRequest.newBuilder(URI.create(base + "/customer/overview"))
              .header("X-Customer-Id", OTHER.value())
              .header("Content-Type", "application/json")
              .method(
                  "GET", HttpRequest.BodyPublishers.ofString("{\"customerId\":\"customer_other\"}"))
              .build();
      assertThat(a.checked(a.client.send(spoof, HttpResponse.BodyHandlers.ofString()), 200))
          .isEqualTo(v);
      assertThat(v.path("accounts")).isEqualTo(a.get("/customer/accounts", 200).path("accounts"));
      assertThat(v.path("cards")).isEqualTo(a.get("/customer/cards", 200).path("items"));
      assertThat(v.path("recentTransactions"))
          .isEqualTo(a.get("/customer/transactions?limit=5", 200).path("items"));
      assertThat(v.path("wealth").path("total"))
          .isEqualTo(a.get("/customer/wealth/portfolio", 200).path("totalValue"));
      var spend = a.get("/customer/spending/summary", 200);
      assertThat(v.path("spending").path("currentPeriod").path("amount"))
          .isEqualTo(spend.path("totalSpend"));
      assertThat(v.path("spending").path("comparisonPeriod").path("amount"))
          .isEqualTo(spend.path("comparisonTotalSpend"));
      assertThat(v.path("spending").path("changePercent"))
          .isEqualTo(spend.path("percentageChange"));
      assertThat(v.path("balanceNote").asText()).contains("estimated");
      assertThat(v.path("exchangeEquivalents").get(0).path("conversionSource").asText())
          .isEqualTo("DEMO_RATE");
      assertThat(v.path("exchangeEquivalents"))
          .isEqualTo(a.get("/customer/accounts", 200).path("exchangeEquivalents"));
      assertThat(v.path("asOf").asText()).matches(".*T[0-9]{2}:[0-9]{2}:[0-9]{2}.*");
      assertThat(v.toString()).doesNotContain("password", "cvv", "securityCode");
    }
  }

  @Test
  void noOverviewStorageOrMigration() {
    assertThat(
            db.queryForList(
                "select table_name from information_schema.tables where table_schema='public'",
                String.class))
        .noneMatch(n -> n.contains("overview"));
    assertThat(
            db.queryForObject(
                "select count(*) from flyway_schema_history where success", Long.class))
        .isGreaterThanOrEqualTo(30);
  }

  @SuppressWarnings("unchecked")
  @Test
  void closureMatchesAllFrozenOperationsAndActualRuntimeAndMatrix() throws Exception {
    Map<String, Object> spec =
        new org.yaml.snakeyaml.Yaml()
            .load(Files.readString(Path.of("../../contracts/openapi/customer.yaml")));
    var paths = (Map<String, Object>) spec.get("paths");
    var expected = new HashSet<String>();
    var operationIds = new HashSet<String>();
    for (var route : paths.entrySet())
      for (var entry : ((Map<String, Object>) route.getValue()).entrySet())
        if (Set.of("get", "post", "put", "patch", "delete").contains(entry.getKey())) {
          String op = (String) ((Map<String, Object>) entry.getValue()).get("operationId");
          operationIds.add(op);
          expected.add(entry.getKey().toUpperCase() + " " + route.getKey() + " " + op);
        }
    var mappings =
        context.getBean(
            "requestMappingHandlerMapping",
            org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
                .class);
    var actual = new HashSet<String>();
    for (var entry : mappings.getHandlerMethods().entrySet())
      for (var path : entry.getKey().getPatternValues()) {
        if (path.startsWith("/customer/"))
          for (var verb : entry.getKey().getMethodsCondition().getMethods())
            actual.add(verb.name() + " " + path + " " + entry.getValue().getMethod().getName());
      }
    assertThat(actual).hasSize(expected.size()).containsExactlyInAnyOrderElementsOf(expected);
    var matrix =
        JSON.readTree(Files.readString(Path.of("../../docs/backend/implementation-status.json")));
    assertThat(matrix.propertyNames()).containsAll(operationIds);
    matrix.forEach(v -> assertThat(v.asText()).isEqualTo("IMPLEMENTED_POSTGRESQL"));
  }

  @Test
  @Order(Integer.MAX_VALUE)
  void overviewAfterApplicationRestartReadsPersistentCombinedState() {
    transfer();
    freeze();
    stopNetflix();
    invest();
    var before = view();
    context.close();
    open();
    clock.value = before.asOf().toInstant();
    var after = view();
    assertThat(after).isEqualTo(before);
    parity(ALEX, after);
  }

  // HTTP uses real persistent session cookies; GET requests deliberately carry no CSRF header.
  static final class Browser implements AutoCloseable {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(String method, String path, Object body, boolean csrf)
        throws Exception {
      var r =
          HttpRequest.newBuilder(URI.create(base + path))
              .timeout(Duration.ofSeconds(20))
              .header("Content-Type", "application/json");
      if (csrf)
        cookies.getCookieStore().getCookies().stream()
            .filter(c -> c.getName().equals("XSRF-TOKEN") && !c.hasExpired())
            .findFirst()
            .ifPresent(c -> r.header("X-XSRF-TOKEN", c.getValue()));
      return client.send(
          r.method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
              .build(),
          HttpResponse.BodyHandlers.ofString());
    }

    JsonNode checked(HttpResponse<String> r, int code) {
      assertThat(r.statusCode()).as(r.body()).isEqualTo(code);
      return JSON.readTree(r.body());
    }

    JsonNode get(String p, int code) throws Exception {
      return checked(call("GET", p, null, false), code);
    }

    void login(String email) throws Exception {
      get("/customer/session", 401);
      checked(
          call(
              "POST",
              "/customer/auth/login",
              Map.of("email", email, "password", "demo-password"),
              true),
          200);
      get("/customer/session", 200);
    }

    public void close() {
      client.close();
    }
  }
}
