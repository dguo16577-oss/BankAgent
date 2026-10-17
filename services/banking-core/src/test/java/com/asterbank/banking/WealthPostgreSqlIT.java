package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.account.application.AccountRepository;
import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.spending.application.SpendingQueryService;
import com.asterbank.banking.customer.transaction.application.TransactionRepository;
import com.asterbank.banking.customer.transaction.domain.TransactionId;
import com.asterbank.banking.customer.wealth.adapter.persistence.*;
import com.asterbank.banking.customer.wealth.application.*;
import com.asterbank.banking.customer.wealth.domain.*;
import com.asterbank.banking.shared.adapter.persistence.*;
import com.asterbank.banking.shared.domain.*;
import java.math.BigDecimal;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
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
class WealthPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final CustomerId ALEX = new CustomerId("usr_aster_alex"),
      OTHER = new CustomerId("customer_other");
  static final JsonMapper JSON = JsonMapper.builder().build();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
  static WealthService service;
  static WealthStore store;
  static TransferFixtures.TestClock clock;
  static Fault fault;
  static String base, credentialHash;

  static final class Fault implements WealthExecutionCheckpoint {
    volatile Stage failAt;

    public void reached(Stage s) {
      if (s == failAt) throw new IllegalStateException("Injected rollback");
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
    Fault wealthTestFault() {
      return new Fault();
    }
  }

  static void open() {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(Config.class)
            .profiles("local", "test")
            .run("--server.port=0");
    db = context.getBean(JdbcTemplate.class);
    service = context.getBean(WealthService.class);
    store = context.getBean(WealthStore.class);
    clock = context.getBean(TransferFixtures.TestClock.class);
    fault = context.getBean(Fault.class);
    base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
  }

  @BeforeAll
  static void start() {
    POSTGRES.start();
    open();
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
    fault.failAt = null;
    context
        .getBean(DemoDataInitializer.class)
        .initialize(ReadDomainFixtures.withOther(JSON), TransferFixtures.recipients());
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

  InvestmentOrder executeAuthorized(CustomerId owner, String id, String hash, String key) {
    var session = B4TestVerification.session(context, owner.value());
    var grant =
        B4TestVerification.domainGrant(
            context,
            owner.value(),
            session,
            "INVESTMENT_ORDER_INTENT",
            id,
            hash,
            com.asterbank.banking.security.domain.VerificationAction.INVESTMENT_ORDER_EXECUTE);
    return service.execute(owner, id, hash, key, session, grant, null);
  }

  RedemptionOrder redeemAuthorized(CustomerId owner, RedemptionIntent intent, String key) {
    var session = B4TestVerification.session(context, owner.value());
    var grant =
        B4TestVerification.domainGrant(
            context,
            owner.value(),
            session,
            "INVESTMENT_ORDER_INTENT",
            intent.terms().id(),
            intent.intentHash(),
            com.asterbank.banking.security.domain.VerificationAction.INVESTMENT_ORDER_EXECUTE);
    return service.executeRedemption(
        owner, intent.terms().id(), intent.intentHash(), key, session, grant, null);
  }

  @Test
  void redemptionIsReviewableAtomicAndIdempotent() {
    var beforeAccount = account().balance();
    var beforeHolding =
        service.portfolio(ALEX).positions().stream()
            .filter(p -> p.id().equals("holding_market"))
            .findFirst()
            .orElseThrow();
    var intent =
        service.prepareRedemption(ALEX, "holding_market", "acc_current", Money.of("500.00", "CNY"));
    assertThat(account().balance()).isEqualTo(beforeAccount);
    assertThat(beforeHolding.currentValue()).isEqualTo(Money.of("10000.00", "CNY"));
    var receipt = redeemAuthorized(ALEX, intent, "redeem_once");
    assertThat(redeemAuthorized(ALEX, intent, "redeem_once").id()).isEqualTo(receipt.id());
    assertThat(account().balance()).isEqualTo(beforeAccount.add(Money.of("500.00", "CNY")));
    assertThat(
            service.portfolio(ALEX).positions().stream()
                .filter(p -> p.id().equals("holding_market"))
                .findFirst()
                .orElseThrow()
                .currentValue())
        .isEqualTo(Money.of("9500.00", "CNY"));
    assertThat(count("investment_redemption_orders")).isEqualTo(1);
    assertThat(count("investment_redemption_intents")).isEqualTo(1);
  }

  @Test
  void redemptionFailsClosedForExcessCancellationAndChangedHolding() {
    failure(
        () ->
            service.prepareRedemption(
                ALEX, "holding_market", "acc_current", Money.of("10001.00", "CNY")),
        "REDEMPTION_EXCEEDS_HOLDING");
    var old =
        service.prepareRedemption(ALEX, "holding_market", "acc_current", Money.of("500.00", "CNY"));
    service.cancelRedemption(ALEX, old.terms().id());
    failure(
        () -> redeemAuthorized(ALEX, old, "cancelled_redemption"), "REDEMPTION_INTENT_CANCELLED");
    var stale =
        service.prepareRedemption(ALEX, "holding_market", "acc_current", Money.of("500.00", "CNY"));
    var another =
        service.prepareRedemption(ALEX, "holding_market", "acc_current", Money.of("100.00", "CNY"));
    redeemAuthorized(ALEX, another, "other_redemption");
    failure(() -> redeemAuthorized(ALEX, stale, "stale_redemption"), "INVESTMENT_STATE_CHANGED");
    assertThat(count("investment_redemption_orders")).isEqualTo(1);
  }

  @Test
  void redemptionIsOwnerScoped() {
    var intent =
        service.prepareRedemption(ALEX, "holding_market", "acc_current", Money.of("100.00", "CNY"));
    failure(
        () -> service.redemptionIntent(OTHER, intent.terms().id()), "REDEMPTION_INTENT_NOT_FOUND");
    failure(
        () ->
            service.prepareRedemption(
                OTHER, "holding_market", "acc_current", Money.of("100.00", "CNY")),
        "HOLDING_NOT_FOUND");
  }

  @Test
  void purchaseCancellationPreventsLaterExecution() {
    var intent = prepare();
    assertThat(service.cancel(ALEX, intent.terms().id()).status())
        .isEqualTo(InvestmentIntent.Status.CANCELLED);
    assertThat(service.cancel(ALEX, intent.terms().id()).status())
        .isEqualTo(InvestmentIntent.Status.CANCELLED);
    failure(() -> execute(intent, "cancelled_purchase"), "INVESTMENT_INTENT_CANCELLED");
    assertThat(count("investment_orders")).isZero();
  }

  long count(String table) {
    return db.queryForObject("select count(*) from " + table, Long.class);
  }

  InvestmentIntent prepare() {
    return prepare("acc_current", "product_bond", "1000");
  }

  InvestmentIntent prepare(String account, String product, String amount) {
    return service.prepare(
        ALEX, product, account, Money.of(amount, "CNY"), service.check(ALEX, product).id());
  }

  InvestmentOrder execute(InvestmentIntent i, String key) {
    return executeAuthorized(ALEX, i.terms().id(), i.intentHash(), key);
  }

  void failure(Runnable r, String code) {
    assertThatThrownBy(r::run).isInstanceOf(WealthFailure.class).hasMessage(code);
  }

  com.asterbank.banking.customer.account.domain.Account account() {
    return context
        .getBean(AccountRepository.class)
        .find(ALEX, new AccountId("acc_current"))
        .orElseThrow();
  }

  Object spending() {
    return context.getBean(SpendingQueryService.class).query(ALEX, Map.of());
  }

  String finances() {
    return JSON.writeValueAsString(
        List.of(
            db.queryForList("select * from accounts order by account_id"),
            db.queryForList("select * from portfolio_positions order by position_id"),
            db.queryForList(
                "select transaction_revision,account_as_of from customers order by customer_id"),
            db.queryForList("select * from transactions order by transaction_id")));
  }

  @Test
  void initialReferenceDataAndPortfolioSums() {
    assertThat(service.products(null, null)).hasSize(4);
    assertThat(service.product("product_bond").riskLevel()).isEqualTo(RiskLevel.R2);
    assertThat(service.product("product_balanced").riskLevel()).isEqualTo(RiskLevel.R3);
    assertThat(service.products(InvestmentProduct.Type.BOND_FUND, RiskLevel.R2)).hasSize(1);
    assertThat(service.products(InvestmentProduct.Type.BOND_FUND, RiskLevel.R3)).isEmpty();
    var p = service.portfolio(ALEX);
    assertThat(p.totalValue().decimal()).isEqualTo("18320.00");
    assertThat(p.investedAmount().decimal()).isEqualTo("18100.00");
    assertThat(p.gainLoss().decimal()).isEqualTo("220.00");
    assertThat(p.monthlyChangePercent()).isEqualTo("1.22");
    assertThat(
            p.positions().stream()
                .map(x -> x.currentValue().amount())
                .reduce(BigDecimal.ZERO, BigDecimal::add))
        .isEqualByComparingTo(p.totalValue().amount());
    assertThat(service.portfolio(OTHER).positions()).isEmpty();
    assertThat(service.portfolio(OTHER).totalValue().decimal()).isEqualTo("0.00");
    assertThat(service.risk(ALEX).riskLevel()).isEqualTo(RiskLevel.R2);
  }

  @ParameterizedTest
  @CsvSource({
    "product_cash,SUITABLE",
    "product_bond,SUITABLE",
    "product_balanced,NOT_SUITABLE",
    "product_equity,NOT_SUITABLE"
  })
  void frozenRiskCompatibilityCases(String product, String result) {
    assertThat(service.check(ALEX, product).result().name()).isEqualTo(result);
    assertThat(service.check(ALEX, product).result().name()).isEqualTo(result);
  }

  @Test
  void investmentPreservesCardsRecurringOtherAccountsAndKeysetPagination() throws Exception {
    context
        .getBean(com.asterbank.banking.customer.card.adapter.persistence.DemoCardSeed.class)
        .initialize();
    context
        .getBean(
            com.asterbank.banking.customer.recurring.adapter.persistence.DemoRecurringSeed.class)
        .initialize();
    var cards = db.queryForList("select * from cards order by card_id");
    var recurring =
        db.queryForList("select * from recurring_payments order by recurring_payment_id");
    var links =
        db.queryForList(
            "select * from recurring_payment_transaction_links order by recurring_payment_id,position");
    var otherAccounts =
        db.queryForList(
            "select * from accounts where account_id<>'acc_current' order by account_id");
    var o = execute(prepare(), "pagination");
    assertThat(db.queryForList("select * from cards order by card_id")).isEqualTo(cards);
    assertThat(db.queryForList("select * from recurring_payments order by recurring_payment_id"))
        .isEqualTo(recurring);
    assertThat(
            db.queryForList(
                "select * from recurring_payment_transaction_links order by recurring_payment_id,position"))
        .isEqualTo(links);
    assertThat(
            db.queryForList(
                "select * from accounts where account_id<>'acc_current' order by account_id"))
        .isEqualTo(otherAccounts);
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var all = new ArrayList<String>();
      String cursor = null;
      do {
        var page =
            b.get(
                "/customer/transactions?limit=7"
                    + (cursor == null
                        ? ""
                        : "&cursor="
                            + URLEncoder.encode(cursor, java.nio.charset.StandardCharsets.UTF_8)),
                200);
        page.path("items").forEach(t -> all.add(t.path("id").asText()));
        cursor = page.path("hasMore").asBoolean() ? page.path("nextCursor").asText() : null;
      } while (cursor != null);
      assertThat(all).doesNotHaveDuplicates().contains(o.transactionId());
      assertThat(all)
          .containsExactlyElementsOf(
              db.queryForList(
                  "select transaction_id from transactions where customer_id=? order by occurred_at desc,transaction_id COLLATE \"C\"",
                  String.class,
                  ALEX.value()));
    }
  }

  @Test
  void immutableSuitableAndUnsuitableEvidence() {
    var s = service.check(ALEX, "product_bond");
    assertThat(s.result()).isEqualTo(Suitability.Result.SUITABLE);
    assertThat(s.expiresAt()).isEqualTo(s.createdAt().plusMinutes(30));
    assertThat(service.suitability(ALEX, s.id())).isEqualTo(s);
    var no = service.check(ALEX, "product_balanced");
    assertThat(no.result()).isEqualTo(Suitability.Result.NOT_SUITABLE);
    failure(
        () ->
            service.prepare(
                ALEX, "product_balanced", "acc_current", Money.of("1000", "CNY"), no.id()),
        "PRODUCT_NOT_SUITABLE");
    db.update(
        "update customer_risk_profiles set risk_level='R1',business_version=1 where customer_id=?",
        ALEX.value());
    assertThat(service.suitability(ALEX, s.id())).isEqualTo(s);
    failure(
        () -> service.prepare(ALEX, "product_bond", "acc_current", Money.of("1000", "CNY"), s.id()),
        "INVESTMENT_STATE_CHANGED");
  }

  @Test
  void prepareOnlyPersistsIntentAndReturnsCompleteReview() {
    var before = finances();
    var i = prepare();
    assertThat(finances()).isEqualTo(before);
    assertThat(i.terms().totalDebit().decimal()).isEqualTo("1000.00");
    assertThat(i.terms().projectedAvailableBalance().decimal()).isEqualTo("22810.31");
    assertThat(i.terms().expiresAt()).isEqualTo(i.terms().createdAt().plusMinutes(15));
    assertThat(i.intentHash()).matches("[a-f0-9]{64}");
    assertThat(service.intent(ALEX, i.terms().id())).isEqualTo(i);
    assertThat(count("investment_orders")).isZero();
    assertThat(count("idempotency_records")).isZero();
  }

  @Test
  void standardPurchaseIsAtomicAndSpendingNeverCountsPrincipal() {
    var beforeSpending = spending();
    var beforeTx = count("transactions");
    var i = prepare();
    var o = execute(i, "standard");
    assertThat(account().balance().decimal()).isEqualTo("22842.31");
    assertThat(account().availableBalance().decimal()).isEqualTo("22810.31");
    assertThat(account().pendingAmount().decimal()).isEqualTo("32.00");
    var p = service.portfolio(ALEX);
    assertThat(p.totalValue().decimal()).isEqualTo("19320.00");
    assertThat(
            p.positions().stream()
                .filter(x -> x.id().equals("holding_bond"))
                .findFirst()
                .orElseThrow()
                .currentValue()
                .decimal())
        .isEqualTo("6320.00");
    assertThat(p.investedAmount().decimal()).isEqualTo("19100.00");
    assertThat(p.gainLoss().decimal()).isEqualTo("220.00");
    assertThat(p.monthlyChangePercent()).isEqualTo("1.22");
    assertThat(p.monthlyNetContributions().decimal()).isEqualTo("1000.00");
    assertThat(count("transactions")).isEqualTo(beforeTx + 1);
    assertThat(spending()).isEqualTo(beforeSpending);
    var t =
        context
            .getBean(TransactionRepository.class)
            .find(ALEX, new TransactionId(o.transactionId()))
            .orElseThrow();
    assertThat(t.type().name()).isEqualTo("INVESTMENT_PURCHASE");
    assertThat(t.category().name()).isEqualTo("INVESTMENT");
    assertThat(t.direction().name()).isEqualTo("DEBIT");
    assertThat(t.status().name()).isEqualTo("COMPLETED");
    assertThat(t.amount().decimal()).isEqualTo("1000.00");
    assertThat(t.merchant()).isNull();
    assertThat(t.counterparty()).isNull();
    assertThat(service.intent(ALEX, i.terms().id()).status())
        .isEqualTo(InvestmentIntent.Status.EXECUTED);
    assertThat(service.order(ALEX, o.id())).isEqualTo(o);
    assertThat(execute(i, "standard")).isEqualTo(o);
    assertThat(count("investment_orders")).isEqualTo(1);
    assertThat(
            db.queryForObject(
                "select count(*) from action_authorizations where status='CONSUMED'", Long.class))
        .isEqualTo(1);
  }

  @Test
  void feesAreDebitedButNeverAddedToPositionOrSpending() {
    db.update("update investment_products set fees=10.50 where product_id='product_bond'");
    var before = spending();
    var o = execute(prepare(), "fee");
    assertThat(account().balance().decimal()).isEqualTo("22831.81");
    assertThat(service.portfolio(ALEX).totalValue().decimal()).isEqualTo("19320.00");
    assertThat(
            context
                .getBean(TransactionRepository.class)
                .find(ALEX, new TransactionId(o.transactionId()))
                .orElseThrow()
                .amount()
                .decimal())
        .isEqualTo("1010.50");
    assertThat(spending()).isEqualTo(before);
  }

  @Test
  void amountPlusFeeMustFitAvailable() {
    db.update("update accounts set balance=1032.00 where account_id='acc_current'");
    db.update("update investment_products set fees=0.01 where product_id='product_bond'");
    failure(this::prepare, "INSUFFICIENT_FUNDS");
  }

  @Test
  void purchaseCanCreateOwnedPositionForPreviouslyEmptyPortfolio() {
    var s = service.check(OTHER, "product_cash");
    var i = service.prepare(OTHER, "product_cash", "acc_other", Money.of("100", "CNY"), s.id());
    var o = executeAuthorized(OTHER, i.terms().id(), i.intentHash(), "other");
    assertThat(service.portfolio(OTHER).totalValue().decimal()).isEqualTo("100.00");
    assertThat(service.portfolio(ALEX).totalValue().decimal()).isEqualTo("18320.00");
    assertThat(o.positionId()).startsWith("position");
  }

  @Test
  void checkMismatchAndMissingResources() {
    var s = service.check(ALEX, "product_cash");
    failure(
        () -> service.prepare(ALEX, "product_bond", "acc_current", Money.of("1000", "CNY"), s.id()),
        "SUITABILITY_CHECK_MISMATCH");
    failure(() -> service.product("missing"), "INVESTMENT_PRODUCT_NOT_FOUND");
    failure(() -> service.suitability(ALEX, "missing"), "SUITABILITY_CHECK_NOT_FOUND");
    failure(() -> service.intent(ALEX, "missing"), "INVESTMENT_INTENT_NOT_FOUND");
    failure(() -> service.order(ALEX, "missing"), "INVESTMENT_ORDER_NOT_FOUND");
    db.update("delete from customer_risk_profiles where customer_id=?", ALEX.value());
    failure(() -> service.risk(ALEX), "RISK_PROFILE_NOT_FOUND");
  }

  @ParameterizedTest
  @ValueSource(strings = {"FROZEN", "RESTRICTED", "CLOSED"})
  void inactiveAccountRejected(String status) {
    db.update("update accounts set status=? where account_id='acc_current'", status);
    failure(this::prepare, "ACCOUNT_NOT_ELIGIBLE");
  }

  @ParameterizedTest
  @CsvSource({
    "0,INVALID_AMOUNT",
    "-1,INVALID_AMOUNT",
    "999,INVESTMENT_AMOUNT_BELOW_MINIMUM",
    "100000,INSUFFICIENT_FUNDS",
    "1000000000000,INVALID_AMOUNT"
  })
  void amountValidation(String amount, String code) {
    failure(() -> prepare("acc_current", "product_bond", amount), code);
  }

  @Test
  void usdCannotBePurchasedOrDebited() {
    var s = service.check(ALEX, "product_bond");
    failure(
        () -> service.prepare(ALEX, "product_bond", "acc_usd", Money.of("1000", "CNY"), s.id()),
        "CURRENCY_MISMATCH");
    failure(
        () -> service.prepare(ALEX, "product_bond", "acc_current", Money.of("1000", "USD"), s.id()),
        "CURRENCY_MISMATCH");
    db.update("update investment_products set currency='USD' where product_id='product_bond'");
    failure(this::prepare, "CURRENCY_MISMATCH");
  }

  @ParameterizedTest
  @ValueSource(strings = {"PREPARE", "EXECUTE"})
  void unavailableProductCannotProceed(String phase) {
    InvestmentIntent i = phase.equals("EXECUTE") ? prepare() : null;
    db.update(
        "update investment_products set status='UNAVAILABLE' where product_id='product_bond'");
    failure(
        () -> {
          if (i == null) prepare();
          else execute(i, "unavailable");
        },
        "INVESTMENT_PRODUCT_UNAVAILABLE");
  }

  @Test
  void exactExpiryBoundaries() {
    var s = service.check(ALEX, "product_bond");
    clock.value = s.expiresAt().toInstant();
    failure(
        () -> service.prepare(ALEX, "product_bond", "acc_current", Money.of("1000", "CNY"), s.id()),
        "SUITABILITY_CHECK_EXPIRED");
    var i = prepare();
    clock.value = i.terms().expiresAt().toInstant();
    assertThat(service.intent(ALEX, i.terms().id()).status())
        .isEqualTo(InvestmentIntent.Status.EXPIRED);
    failure(() -> execute(i, "expired"), "INVESTMENT_INTENT_EXPIRED");
    clock.value = service.risk(ALEX).expiresAt().toInstant();
    failure(() -> service.check(ALEX, "product_bond"), "RISK_PROFILE_EXPIRED");
  }

  @Test
  void expiredEvidenceBlocksStillLiveIntent() {
    var s = service.check(ALEX, "product_bond");
    clock.value = s.createdAt().plusMinutes(20).toInstant();
    var i = service.prepare(ALEX, "product_bond", "acc_current", Money.of("1000", "CNY"), s.id());
    clock.value = s.expiresAt().toInstant();
    failure(() -> execute(i, "check-expired"), "SUITABILITY_CHECK_EXPIRED");
  }

  @Test
  void expiredRiskBlocksExecution() {
    var i = prepare();
    db.update(
        "update customer_risk_profiles set expires_at=? where customer_id=?",
        OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC),
        ALEX.value());
    failure(() -> execute(i, "risk"), "RISK_PROFILE_EXPIRED");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "update investment_products set business_version=1 where product_id='product_bond'",
        "update investment_products set fees=1 where product_id='product_bond'",
        "update investment_products set risk_level='R3' where product_id='product_bond'",
        "update investment_products set minimum_investment=2000 where product_id='product_bond'",
        "update customer_risk_profiles set business_version=1 where customer_id='usr_aster_alex'",
        "update customer_risk_profiles set risk_level='R1' where customer_id='usr_aster_alex'",
        "update accounts set balance=balance+1 where account_id='acc_current'",
        "update accounts set pending_amount=pending_amount+1 where account_id='acc_current'",
        "update accounts set status='FROZEN' where account_id='acc_current'"
      })
  void changedPrerequisitesCannotExecuteOldReview(String mutation) {
    var i = prepare();
    db.update(mutation);
    var before = finances();
    failure(() -> execute(i, "stale"), "INVESTMENT_STATE_CHANGED");
    assertThat(finances()).isEqualTo(before);
    assertThat(count("investment_orders")).isZero();
  }

  @Test
  void hashAndIdempotencyConflictReplayBeforeExpiry() {
    var i = prepare();
    failure(
        () -> executeAuthorized(ALEX, i.terms().id(), "0".repeat(64), "hash"),
        "INVESTMENT_INTENT_HASH_MISMATCH");
    var o = execute(i, "key");
    failure(() -> execute(i, "different"), "INVESTMENT_INTENT_ALREADY_EXECUTED");
    failure(
        () -> executeAuthorized(ALEX, i.terms().id(), "0".repeat(64), "key"),
        "IDEMPOTENCY_KEY_REUSED");
    clock.value = clock.value.plus(Duration.ofDays(500));
    assertThat(execute(i, "key")).isEqualTo(o);
  }

  @ParameterizedTest
  @EnumSource(WealthExecutionCheckpoint.Stage.class)
  void eachMutationStageRollsBackEverything(WealthExecutionCheckpoint.Stage stage) {
    var i = prepare();
    var before = finances();
    fault.failAt = stage;
    failure(() -> execute(i, "rollback"), "PERSISTENCE_UNAVAILABLE");
    assertThat(finances()).isEqualTo(before);
    assertThat(count("investment_orders")).isZero();
    assertThat(count("idempotency_records")).isZero();
    assertThat(service.intent(ALEX, i.terms().id()).status())
        .isEqualTo(InvestmentIntent.Status.PREPARED);
    fault.failAt = null;
    execute(i, "rollback");
    assertThat(count("investment_orders")).isEqualTo(1);
  }

  @Test
  void actualDatabaseConstraintFailureRollsBackDebitPositionAndTransaction() {
    var i = prepare();
    var before = finances();
    db.execute(
        "alter table investment_orders add constraint test_reject_order check(false) NOT VALID");
    try {
      failure(() -> execute(i, "constraint"), "PERSISTENCE_UNAVAILABLE");
      assertThat(finances()).isEqualTo(before);
      assertThat(count("investment_orders")).isZero();
      assertThat(count("idempotency_records")).isZero();
    } finally {
      db.execute("alter table investment_orders drop constraint test_reject_order");
    }
  }

  List<Object> race(Callable<InvestmentOrder> a, Callable<InvestmentOrder> b) throws Exception {
    var gate = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var tasks = new ArrayList<Future<Object>>();
      for (var job : List.of(a, b))
        tasks.add(
            pool.submit(
                () -> {
                  gate.await();
                  try {
                    return job.call();
                  } catch (WealthFailure e) {
                    return e.code().name();
                  }
                }));
      gate.countDown();
      var out = new ArrayList<Object>();
      for (var f : tasks) out.add(f.get(30, TimeUnit.SECONDS));
      return out;
    }
  }

  @Test
  void concurrentSameKeyOneOrderAndIdenticalReceipt() throws Exception {
    var i = prepare();
    var r = race(() -> execute(i, "same"), () -> execute(i, "same"));
    assertThat(r.get(0)).isInstanceOf(InvestmentOrder.class).isEqualTo(r.get(1));
    assertThat(count("investment_orders")).isEqualTo(1);
    assertThat(account().balance().decimal()).isEqualTo("22842.31");
  }

  @Test
  void concurrentDifferentKeysOneOrder() throws Exception {
    var i = prepare();
    var r = race(() -> execute(i, "a"), () -> execute(i, "b"));
    assertThat(r.stream().filter(InvestmentOrder.class::isInstance).count()).isEqualTo(1);
    assertThat(r).contains("INVESTMENT_INTENT_ALREADY_EXECUTED");
    assertThat(count("idempotency_records")).isEqualTo(1);
  }

  @Test
  void competingInsufficientFundsNeverOverdraw() throws Exception {
    db.update("update accounts set balance=1532 where account_id='acc_current'");
    var a = prepare();
    var b = prepare();
    var r = race(() -> execute(a, "a"), () -> execute(b, "b"));
    assertThat(r.stream().filter(InvestmentOrder.class::isInstance).count()).isEqualTo(1);
    assertThat(r).contains("INVESTMENT_STATE_CHANGED");
    assertThat(account().availableBalance().decimal()).isEqualTo("500.00");
  }

  @Test
  void independentAccountsSamePositionHaveNoLostUpdate() throws Exception {
    var a = prepare();
    var b = prepare("acc_savings", "product_bond", "1000");
    var r = race(() -> execute(a, "a"), () -> execute(b, "b"));
    assertThat(r).allMatch(InvestmentOrder.class::isInstance);
    assertThat(service.portfolio(ALEX).totalValue().decimal()).isEqualTo("20320.00");
    assertThat(
            service.portfolio(ALEX).positions().stream()
                .filter(x -> x.id().equals("holding_bond"))
                .findFirst()
                .orElseThrow()
                .currentValue()
                .decimal())
        .isEqualTo("7320.00");
    assertThat(count("investment_orders")).isEqualTo(2);
  }

  @Test
  void ownerIsolationAtEveryStage() {
    var i = prepare();
    failure(
        () -> service.suitability(OTHER, i.terms().suitability().id()),
        "SUITABILITY_CHECK_NOT_FOUND");
    failure(() -> service.intent(OTHER, i.terms().id()), "INVESTMENT_INTENT_NOT_FOUND");
    failure(
        () -> executeAuthorized(OTHER, i.terms().id(), i.intentHash(), "other"),
        "INVESTMENT_INTENT_NOT_FOUND");
    failure(
        () ->
            service.prepare(
                ALEX,
                "product_bond",
                "acc_other",
                Money.of("1000", "CNY"),
                i.terms().suitability().id()),
        "ACCOUNT_NOT_FOUND");
    failure(
        () ->
            service.prepare(
                OTHER,
                "product_bond",
                "acc_other",
                Money.of("1000", "CNY"),
                i.terms().suitability().id()),
        "SUITABILITY_CHECK_NOT_FOUND");
    var o = execute(i, "owner");
    failure(() -> service.order(OTHER, o.id()), "INVESTMENT_ORDER_NOT_FOUND");
  }

  @Test
  void immutableIntentPersistenceAndForeignKeys() {
    var i = prepare();
    var t = i.terms();
    var changed =
        new InvestmentIntent.Terms(
            t.id(),
            t.product(),
            t.sourceAccount(),
            t.suitability(),
            Money.of("2000", "CNY"),
            t.fees(),
            t.totalDebit(),
            t.projectedAvailableBalance(),
            t.createdAt(),
            t.expiresAt());
    failure(
        () ->
            store.write(
                ALEX,
                () -> {
                  store.save(new InvestmentIntent(changed, i.intentHash(), i.status()));
                  return null;
                }),
        "PERSISTENCE_UNAVAILABLE");
    assertThatThrownBy(
            () ->
                db.update(
                    "update investment_order_intents set customer_id=? where intent_id=?",
                    OTHER.value(),
                    t.id()))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    execute(i, "seed");
    context.getBean(DemoWealthSeed.class).initialize();
    assertThat(service.portfolio(ALEX).totalValue().decimal()).isEqualTo("19320.00");
    assertThat(
            db.queryForObject(
                "select count(*) from flyway_schema_history where success", Long.class))
        .isEqualTo(33);
  }

  // Real HTTP exercises generated interfaces, authentication, CSRF and request validation.
  static final class Browser implements AutoCloseable {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(String method, String path, Object body, String key, boolean csrf)
        throws Exception {
      var r =
          HttpRequest.newBuilder(URI.create(base + path))
              .timeout(Duration.ofSeconds(20))
              .header("Content-Type", "application/json");
      if (key != null) r.header("Idempotency-Key", key);
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
      return checked(call("GET", p, null, null, false), code);
    }

    final java.util.Map<String, String> verifiedGrants = new java.util.HashMap<>();

    JsonNode post(String p, Object b, String key, int code) throws Exception {
      var verified =
          B4TestVerification.verifiedBody(
              db,
              path -> call("GET", path, null, null, false),
              (path, body) -> call("POST", path, JSON.readTree(body), null, true),
              p,
              JSON.writeValueAsString(b),
              verifiedGrants);
      b = JSON.readTree(verified);
      return checked(call("POST", p, b, key, true), code);
    }

    void login(String email) throws Exception {
      get("/customer/session", 401);
      post("/customer/auth/login", Map.of("email", email, "password", "demo-password"), null, 200);
      get("/customer/session", 200);
    }

    public void close() {
      client.close();
    }
  }

  static final String PRODUCTS = "/customer/wealth/products",
      CHECKS = "/customer/wealth/suitability-checks",
      INTENTS = "/customer/investment-order-intents",
      ORDERS = "/customer/investment-orders",
      REDEMPTION_INTENTS = "/customer/investment-redemption-intents",
      REDEMPTIONS = "/customer/investment-redemptions";

  Map<String, Object> intentBody(String check) {
    return Map.of(
        "productId",
        "product_bond",
        "sourceAccountId",
        "acc_current",
        "amount",
        Map.of("amount", "1000.00", "currency", "CNY"),
        "suitabilityCheckId",
        check);
  }

  @Test
  void realHttpCompleteReviewExecutionReplayAndPrivacy() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      assertThat(b.get(PRODUCTS, 200).path("items")).hasSize(4);
      b.get(PRODUCTS + "/product_bond", 200);
      b.get("/customer/wealth/risk-profile", 200);
      var before = b.get("/customer/spending/summary", 200);
      var check = b.post(CHECKS, Map.of("productId", "product_bond"), null, 201);
      b.get(CHECKS + "/" + check.path("id").asText(), 200);
      var i = b.post(INTENTS, intentBody(check.path("id").asText()), null, 201);
      assertThat(i.path("authorizationRequirement").asText()).isEqualTo("CONFIRMATION");
      assertThat(i.path("createdAt").asText()).matches(".*T[0-9]{2}:[0-9]{2}:[0-9]{2}.*");
      assertThat(b.get(INTENTS + "/" + i.path("id").asText(), 200)).isEqualTo(i);
      var body =
          Map.of("intentId", i.path("id").asText(), "intentHash", i.path("intentHash").asText());
      var rejected = b.call("POST", ORDERS, body, "missing-verification", true);
      assertThat(rejected.statusCode()).as(rejected.body()).isEqualTo(403);
      assertThat(count("investment_orders")).isZero();
      var o = b.post(ORDERS, body, "http", 200);
      assertThat(b.post(ORDERS, body, "http", 200)).isEqualTo(o);
      assertThat(b.get(ORDERS + "/" + o.path("id").asText(), 200)).isEqualTo(o);
      assertThat(
              b.get("/customer/accounts/acc_current", 200).path("balance").path("amount").asText())
          .isEqualTo("22842.31");
      assertThat(
              b.get("/customer/wealth/portfolio", 200).path("totalValue").path("amount").asText())
          .isEqualTo("19320.00");
      b.get("/customer/transactions/" + o.path("transactionId").asText(), 200);
      assertThat(b.get("/customer/spending/summary", 200)).isEqualTo(before);
      assertThat(o.path("sourceAccount").path("maskedAccountNumber").asText())
          .matches("•••• [0-9]{4}");
      assertThat(o.toString())
          .doesNotContain("password", "cvv", "fullAccountNumber", "securityCode");
      assertThat(
              db.queryForObject(
                  "select count(*) from action_authorizations where status='CONSUMED'", Long.class))
          .isEqualTo(1);
    }
  }

  @Test
  void realHttpRedemptionRequiresVerificationAndCreditsOnce() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before =
          new BigDecimal(
              b.get("/customer/accounts/acc_current", 200).path("balance").path("amount").asText());
      var intent =
          b.post(
              REDEMPTION_INTENTS,
              Map.of(
                  "holdingId", "holding_market",
                  "destinationAccountId", "acc_current",
                  "amount", Map.of("amount", "500.00", "currency", "CNY")),
              null,
              201);
      var id = intent.path("id").asText();
      assertThat(b.get(REDEMPTION_INTENTS + "/" + id, 200)).isEqualTo(intent);
      assertThat(
              new BigDecimal(
                  b.get("/customer/accounts/acc_current", 200)
                      .path("balance")
                      .path("amount")
                      .asText()))
          .isEqualByComparingTo(before);
      var body = Map.of("intentId", id, "intentHash", intent.path("intentHash").asText());
      assertThat(b.call("POST", REDEMPTIONS, body, "unverified", true).statusCode()).isEqualTo(403);
      var receipt = b.post(REDEMPTIONS, body, "redeem-http", 200);
      assertThat(b.post(REDEMPTIONS, body, "redeem-http", 200)).isEqualTo(receipt);
      assertThat(receipt.path("intentId").asText()).isEqualTo(id);
      assertThat(
              new BigDecimal(
                  b.get("/customer/accounts/acc_current", 200)
                      .path("balance")
                      .path("amount")
                      .asText()))
          .isEqualByComparingTo(before.add(new BigDecimal("500.00")));
      assertThat(count("investment_redemption_orders")).isEqualTo(1);
      assertThat(
              b.get("/customer/transactions/" + receipt.path("transactionId").asText(), 200)
                  .path("type")
                  .asText())
          .isEqualTo("INVESTMENT_REDEMPTION");
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/customer/wealth/suitability-checks",
        "/customer/investment-order-intents",
        "/customer/investment-orders"
      })
  void everyMutationRequiresSessionAndCsrf(String path) throws Exception {
    var i = prepare();
    Object body =
        path.equals(CHECKS)
            ? Map.of("productId", "product_bond")
            : path.equals(INTENTS)
                ? intentBody(i.terms().suitability().id())
                : Map.of("intentId", i.terms().id(), "intentHash", i.intentHash());
    try (var b = new Browser()) {
      assertThat(b.call("POST", path, body, "security", false).statusCode()).isEqualTo(401);
      b.login("alex@aster.local");
      assertThat(b.call("POST", path, body, "security", false).statusCode()).isEqualTo(403);
      b.post(path, body, "security", path.equals(ORDERS) ? 200 : 201);
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/customer/wealth/portfolio",
        "/customer/wealth/products",
        "/customer/wealth/products/product_bond",
        "/customer/wealth/risk-profile",
        "/customer/wealth/suitability-checks/missing",
        "/customer/investment-order-intents/missing",
        "/customer/investment-orders/missing"
      })
  void readsRequireAuthentication(String path) throws Exception {
    try (var b = new Browser()) {
      b.get(path, 401);
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "?type=",
        "?riskLevel=",
        "?type=bond_fund",
        "?riskLevel=R9",
        "?customerId=customer_other",
        "?type=BOND_FUND&type=BOND_FUND",
        "?riskLevel=R2&riskLevel=R3"
      })
  void invalidProductQueries(String suffix) throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      assertThat(b.get(PRODUCTS + suffix, 400).path("code").asText()).isEqualTo("INVALID_QUERY");
    }
  }

  @Test
  void productFiltersAreConjunctive() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      assertThat(b.get(PRODUCTS + "?type=BOND_FUND&riskLevel=R2", 200).path("items")).hasSize(1);
      assertThat(b.get(PRODUCTS + "?type=BOND_FUND&riskLevel=R3", 200).path("items")).isEmpty();
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"0", "-1", "1000.001", "1e3", "1000000000000", "01.00", "NaN"})
  void invalidWireAmounts(String amount) throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var req = new HashMap<>(intentBody(service.check(ALEX, "product_bond").id()));
      req.put("amount", Map.of("amount", amount, "currency", "CNY"));
      assertThat(b.post(INTENTS, req, null, 422).path("code").asText()).isEqualTo("INVALID_AMOUNT");
    }
  }

  @Test
  void strictWireBodyAndUnknownForeignNotFound() throws Exception {
    var i = prepare();
    var o = execute(i, "owner-http");
    try (var a = new Browser();
        var b = new Browser()) {
      a.login("alex@aster.local");
      b.login("other@aster.local");
      b.get(CHECKS + "/" + i.terms().suitability().id(), 404);
      b.get(INTENTS + "/" + i.terms().id(), 404);
      b.get(ORDERS + "/" + o.id(), 404);
      b.post(
          ORDERS, Map.of("intentId", i.terms().id(), "intentHash", i.intentHash()), "foreign", 404);
      a.get(PRODUCTS + "/missing", 404);
      a.get(CHECKS + "/missing", 404);
      a.get(INTENTS + "/missing", 404);
      a.get(ORDERS + "/missing", 404);
      var req = new HashMap<>(intentBody(i.terms().suitability().id()));
      req.put("customerId", OTHER.value());
      a.post(INTENTS, req, null, 400);
      req.remove("customerId");
      req.put("amount", Map.of("amount", 1000, "currency", "CNY"));
      a.post(INTENTS, req, null, 422);
      a.post(
          ORDERS,
          Map.of("intentId", i.terms().id(), "intentHash", i.intentHash(), "amount", "1.00"),
          "extra",
          400);
      a.post(ORDERS, Map.of("intentId", i.terms().id(), "intentHash", i.intentHash()), null, 400);
      assertThat(b.get("/customer/wealth/portfolio", 200).path("positions")).isEmpty();
    }
  }

  @Test
  @Order(Integer.MAX_VALUE)
  void restartPreservesWealthEvidenceOrderBalancesAndIdempotency() {
    var i = prepare();
    var o = execute(i, "restart");
    var p = service.portfolio(ALEX);
    var before = account();
    var s = service.suitability(ALEX, i.terms().suitability().id());
    context.close();
    open();
    assertThat(service.portfolio(ALEX)).isEqualTo(p);
    assertThat(account()).isEqualTo(before);
    assertThat(service.suitability(ALEX, s.id())).isEqualTo(s);
    assertThat(service.order(ALEX, o.id())).isEqualTo(o);
    assertThat(execute(i, "restart")).isEqualTo(o);
    assertThat(service.intent(ALEX, i.terms().id()).status())
        .isEqualTo(InvestmentIntent.Status.EXECUTED);
  }
}
