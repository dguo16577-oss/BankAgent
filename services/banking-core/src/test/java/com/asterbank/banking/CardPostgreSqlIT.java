package com.asterbank.banking;

import static org.assertj.core.api.Assertions.*;

import com.asterbank.banking.customer.card.adapter.persistence.*;
import com.asterbank.banking.customer.card.application.*;
import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.SecurityState.*;
import com.asterbank.banking.shared.adapter.persistence.*;
import com.asterbank.banking.shared.domain.*;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CardPostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static final CustomerId ALEX = new CustomerId("usr_aster_alex"),
      OTHER = new CustomerId("customer_other");
  static final String DEBIT = "card_aster_debit", CREDIT = "card_aster_credit";
  static final JsonMapper JSON = JsonMapper.builder().build();
  static ConfigurableApplicationContext context;
  static JdbcTemplate db;
  static CardService cards;
  static SecurityService security;
  static CardStore store;
  static TransferFixtures.TestClock clock;
  static Fault fault;
  static String session, base, credentialHash;

  static final class Fault implements CardExecutionCheckpoint {
    volatile Stage failAt;

    public void reached(Stage stage) {
      if (stage == failAt) throw new IllegalStateException("test-only injected failure");
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
    Fault cardTestFault() {
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
    cards = context.getBean(CardService.class);
    store = context.getBean(CardStore.class);
    security = context.getBean(SecurityService.class);
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
    clock.value = Instant.parse("2026-09-28T08:00:00Z");
    fault.failAt = null;
    context
        .getBean(DemoDataInitializer.class)
        .initialize(ReadDomainFixtures.withOther(JSON), TransferFixtures.recipients());
    context.getBean(DemoCardSeed.class).initialize();
    db.update(
        "insert into customer_credentials values(?,?,?,true),(?,?,?,true)",
        ALEX.value(),
        "alex@aster.local",
        credentialHash,
        OTHER.value(),
        "other@aster.local",
        credentialHash);
    B4TestVerification.phones(db);
    session = UUID.randomUUID().toString();
    security.login(ALEX.value(), session, null);
  }

  long count(String table) {
    return db.queryForObject("select count(*) from " + table, Long.class);
  }

  CardActionIntent prepare(CardActionType type) {
    return cards.prepare(ALEX, DEBIT, type, null);
  }

  CardAction execute(CardActionIntent i, String auth, String key) {
    if (auth == null
        && i.terms().actionType() == CardActionType.UPDATE_CONTROLS
        && i.terms().change().risk().name().equals("PROTECTIVE")) auth = authorize(i).id();
    return cards.execute(ALEX, session, i.terms().id(), i.intentHash(), auth, key, null);
  }

  Authorization authorize(CardActionIntent i) {
    return authorize(ALEX, session, i.terms().id(), i.intentHash());
  }

  Authorization authorize(CustomerId owner, String s, String id, String hash) {
    var b = new Binding(owner.value(), s, "CARD_ACTION_INTENT", id, hash);
    B4TestVerification.phones(db);
    var intent = store.intent(owner, id).orElse(null);
    var c =
        security.create(
            b,
            intent == null
                ? com.asterbank.banking.security.domain.VerificationAction.CARD_UNFREEZE
                : CardService.verificationAction(intent.terms()),
            null);
    return B4TestVerification.verify(db, security, owner.value(), s, c.id(), "246810", null)
        .authorization();
  }

  CardActionIntent risky() {
    execute(prepare(CardActionType.FREEZE), null, "initial_freeze");
    return prepare(CardActionType.UNFREEZE);
  }

  void failure(Runnable work, String code) {
    assertThatThrownBy(work::run)
        .satisfies(
            e -> {
              String actual =
                  e instanceof CardFailure f
                      ? f.code().name()
                      : e instanceof SecurityFailure f
                          ? f.code()
                          : e instanceof CardRuleViolation f
                              ? f.code().name()
                              : e.getClass().getName();
              assertThat(actual).isEqualTo(code);
            });
  }

  Object financial() {
    return List.of(
        db.queryForList("select * from accounts order by account_id"),
        db.queryForList("select * from transactions order by transaction_id"),
        db.queryForList("select * from customers order by customer_id"));
  }

  Object mutation() {
    return List.of(
        db.queryForList("select * from cards order by card_id"),
        db.queryForList("select * from card_actions order by action_id"),
        db.queryForList("select * from card_action_intents order by intent_id"),
        db.queryForList("select * from action_authorizations order by authorization_id"),
        db.queryForList("select * from security_events order by event_id"),
        db.queryForList(
            "select * from idempotency_records order by customer_id,operation,idempotency_key"));
  }

  @Test
  void initialCardsMatchM5AndAreMaskedOrderedAndOwned() {
    var list = cards.list(ALEX);
    assertThat(list).extracting(Card::id).containsExactly(DEBIT, CREDIT);
    assertThat(list).extracting(Card::maskedNumber).containsExactly("••8821", "••1937");
    for (var card : list) {
      assertThat(card.state()).isEqualTo(new Card.State(Card.Status.ACTIVE, CardDomainTest.ON, 0));
      assertThat(card.linkedAccount().id()).isEqualTo("acc_current");
    }
    assertThat(cards.list(OTHER)).extracting(Card::id).containsExactly("card_other");
    failure(() -> cards.card(ALEX, "unknown"), "CARD_NOT_FOUND");
    failure(() -> cards.card(ALEX, "card_other"), "CARD_NOT_FOUND");
    failure(() -> cards.card(OTHER, DEBIT), "CARD_NOT_FOUND");
    assertThat(
            db.queryForObject(
                "select count(*) from flyway_schema_history where success", Long.class))
        .isEqualTo(34);
  }

  @Test
  void prepareCreatesOnlyImmutableIntentAndFullControlSnapshots() {
    var before = financial();
    var cardBefore = db.queryForList("select * from cards order by card_id");
    var off = new CardControls(false, true, true, true);
    var i = cards.prepare(ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, off);
    assertThat(i.terms().change().before().controls()).isEqualTo(CardDomainTest.ON);
    assertThat(i.terms().change().after().controls()).isEqualTo(off);
    assertThat(i.terms().change().risk()).isEqualTo(RiskDirection.PROTECTIVE);
    assertThat(financial()).isEqualTo(before);
    assertThat(db.queryForList("select * from cards order by card_id")).isEqualTo(cardBefore);
    assertThat(count("card_action_intents")).isEqualTo(1);
    assertThat(count("card_actions")).isZero();
    assertThat(count("idempotency_records")).isZero();
    assertThat(count("action_authorizations")).isZero();
    execute(prepare(CardActionType.FREEZE), null, "freeze_other");
    assertThat(cards.intent(ALEX, i.terms().id()).terms()).isEqualTo(i.terms());
    assertThat(cards.intent(ALEX, i.terms().id()).terms().card().state().status())
        .isEqualTo(Card.Status.ACTIVE);
    failure(() -> cards.intent(OTHER, i.terms().id()), "CARD_ACTION_INTENT_NOT_FOUND");
    failure(() -> cards.intent(ALEX, "missing"), "CARD_ACTION_INTENT_NOT_FOUND");
  }

  @Test
  void storedReviewBusinessTermsCannotBeUpdated() {
    var i = prepare(CardActionType.FREEZE);
    var t = i.terms();
    var changed =
        new CardIntentTerms(
            t.id(),
            t.card(),
            t.actionType(),
            t.change(),
            t.createdAt(),
            t.expiresAt().plusSeconds(1));
    failure(
        () ->
            store.write(
                () -> {
                  store.save(new CardActionIntent(changed, i.intentHash(), i.status()));
                  return null;
                }),
        "PERSISTENCE_UNAVAILABLE");
    assertThat(cards.intent(ALEX, t.id())).isEqualTo(i);
  }

  @Test
  void protectiveFreezeCommitsWithoutAuthorizationOrFinancialChanges() {
    var finances = financial();
    var receipt = execute(prepare(CardActionType.FREEZE), null, "freeze");
    assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.FROZEN);
    assertThat(cards.card(ALEX, DEBIT).state().version()).isEqualTo(1);
    assertThat(
            db.queryForObject("select row_version from cards where card_id=?", Long.class, DEBIT))
        .isEqualTo(1);
    assertThat(cards.action(ALEX, receipt.id())).isEqualTo(receipt);
    assertThat(cards.intent(ALEX, receipt.terms().id()).status())
        .isEqualTo(CardActionIntent.Status.EXECUTED);
    assertThat(count("action_authorizations")).isZero();
    assertThat(
            db.queryForObject(
                "select count(*) from security_events where type='AUTHORIZATION_CONSUMED'",
                Long.class))
        .isZero();
    assertThat(financial()).isEqualTo(finances);
    failure(() -> cards.action(OTHER, receipt.id()), "CARD_ACTION_NOT_FOUND");
    failure(() -> cards.action(ALEX, "unknown"), "CARD_ACTION_NOT_FOUND");
  }

  @Test
  void standardUnfreezeConsumesIntentBoundGrantAndReplaysAfterConsumptionAndExpiry() {
    var i = risky();
    assertThat(i.terms().change().authorization()).isEqualTo(AuthorizationRequirement.STEP_UP_AUTH);
    var auth = authorize(i);
    var finances = financial();
    var receipt = execute(i, auth.id(), "unfreeze");
    assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.ACTIVE);
    assertThat(financial()).isEqualTo(finances);
    assertThat(
            db.queryForObject(
                "select status from action_authorizations where authorization_id=?",
                String.class,
                auth.id()))
        .isEqualTo("CONSUMED");
    assertThat(
            db.queryForObject(
                "select count(*) from security_events where type='AUTHORIZATION_CONSUMED'",
                Long.class))
        .isEqualTo(1);
    clock.value = clock.value.plusSeconds(1000);
    assertThat(execute(i, auth.id(), "unfreeze")).isEqualTo(receipt);
    assertThat(count("card_actions")).isEqualTo(2);
    assertThat(count("idempotency_records")).isEqualTo(2);
  }

  @Test
  void offToOnAndMixedControlsRequireStepUpAndPreserveExactAfter() {
    var off = new CardControls(false, true, true, true);
    execute(cards.prepare(ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, off), null, "off");
    var mixed = new CardControls(true, true, true, false);
    var i = cards.prepare(ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, mixed);
    assertThat(i.terms().change().risk()).isEqualTo(RiskDirection.RISK_INCREASING);
    var receipt = execute(i, authorize(i).id(), "mixed");
    assertThat(receipt.card().state().controls()).isEqualTo(mixed);
    assertThat(receipt.terms().change().before().controls()).isEqualTo(off);
    assertThat(receipt.terms().change().after().controls()).isEqualTo(mixed);
  }

  @Test
  void onlineOffToOnStandardScenario() {
    execute(
        cards.prepare(
            ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, new CardControls(false, true, true, true)),
        null,
        "off");
    var i = cards.prepare(ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, CardDomainTest.ON);
    var a = authorize(i);
    execute(i, a.id(), "on");
    assertThat(cards.card(ALEX, DEBIT).state().controls().onlinePayments()).isTrue();
  }

  @Test
  void missingUnknownConsumedAndExpiredAuthorizationRejectWithoutCardMutation() {
    var i = risky();
    var before = mutation();
    failure(() -> execute(i, null, "missing"), "STEP_UP_AUTH_REQUIRED");
    failure(() -> execute(i, "unknown", "unknown"), "ACTION_AUTHORIZATION_NOT_FOUND");
    assertThat(mutation()).isEqualTo(before);
    var a = authorize(i);
    security.consume(a.id(), a.binding(), null);
    before = mutation();
    failure(() -> execute(i, a.id(), "consumed"), "ACTION_AUTHORIZATION_CONSUMED");
    assertThat(mutation()).isEqualTo(before);
    var b = authorize(i);
    clock.value = b.expiresAt();
    before = mutation();
    failure(() -> execute(i, b.id(), "expired"), "ACTION_AUTHORIZATION_EXPIRED");
    assertThat(mutation()).isEqualTo(before);
  }

  @ParameterizedTest
  @ValueSource(strings = {"customer", "session", "intent", "hash"})
  void everyUsableGrantMustMatchExecutionBinding(String field) {
    var i = risky();
    String s = session;
    CustomerId owner = ALEX;
    String resource = i.terms().id(), hash = i.intentHash();
    if (field.equals("customer")) {
      owner = OTHER;
      s = UUID.randomUUID().toString();
      security.login(owner.value(), s, null);
    }
    if (field.equals("session")) {
      s = UUID.randomUUID().toString();
      security.login(owner.value(), s, null);
    }
    if (field.equals("intent")) resource = "another_intent";
    if (field.equals("hash")) hash = "another_hash";
    var a = authorize(owner, s, resource, hash);
    var before = mutation();
    failure(() -> execute(i, a.id(), "binding"), "ACTION_AUTHORIZATION_MISMATCH");
    assertThat(mutation()).isEqualTo(before);
  }

  @Test
  void resourceTypeIsFixedAtCardBoundaryAndCheckedBySecurityPort() {
    var i = risky();
    var a = authorize(i);
    var wrong =
        new Binding(ALEX.value(), session, "OTHER_RESOURCE", i.terms().id(), i.intentHash());
    failure(
        () -> context.getBean(ActionAuthorizationService.class).validate(a.id(), wrong),
        "ACTION_AUTHORIZATION_MISMATCH");
    assertThat(execute(i, a.id(), "correct_type").id()).isNotBlank();
  }

  @ParameterizedTest
  @ValueSource(strings = {"intent", "hash", "authorization"})
  void sameKeyDifferentRequestAlwaysConflictsBeforeAuthorizationValidation(String field) {
    var i = risky();
    var a = authorize(i);
    execute(i, a.id(), "key");
    var before = mutation();
    failure(
        () ->
            cards.execute(
                ALEX,
                session,
                field.equals("intent") ? "other" : i.terms().id(),
                field.equals("hash") ? "other" : i.intentHash(),
                field.equals("authorization") ? "other" : a.id(),
                "key",
                null),
        "IDEMPOTENCY_KEY_REUSED");
    assertThat(mutation()).isEqualTo(before);
  }

  @Test
  void sameKeyIsScopedByCustomerAndOperation() {
    var i = prepare(CardActionType.FREEZE);
    var receipt = execute(i, null, "shared_key");
    var transfer =
        context
            .getBean(TransferPreparationService.class)
            .prepare(
                ALEX,
                new PrepareTransfer(
                    new com.asterbank.banking.customer.account.domain.AccountId("acc_current"),
                    new com.asterbank.banking.customer.payment.domain.RecipientId(
                        "recipient_zhang"),
                    Money.of("1.00", "CNY"),
                    null),
                session);
    context
        .getBean(TransferExecutionService.class)
        .execute(
            ALEX,
            transfer.terms().id(),
            transfer.intentHash(),
            "shared_key",
            session,
            B4TestVerification.domainGrant(
                context,
                ALEX.value(),
                session,
                "TRANSFER_INTENT",
                transfer.terms().id(),
                transfer.intentHash(),
                com.asterbank.banking.security.domain.VerificationAction.TRANSFER_EXECUTE),
            null);
    var other = cards.prepare(OTHER, "card_other", CardActionType.FREEZE, null);
    cards.execute(
        OTHER,
        "test-trusted-caller",
        other.terms().id(),
        other.intentHash(),
        null,
        "shared_key",
        null);
    assertThat(count("idempotency_records")).isEqualTo(3);
    assertThat(execute(i, null, "shared_key")).isEqualTo(receipt);
  }

  @Test
  void expiredHashMismatchAndAlreadyExecutedIntentsAreRejected() {
    var i = prepare(CardActionType.FREEZE);
    failure(
        () -> cards.execute(ALEX, session, i.terms().id(), "wrong", null, "hash", null),
        "CARD_ACTION_INTENT_HASH_MISMATCH");
    clock.value = i.terms().expiresAt().toInstant();
    failure(() -> execute(i, null, "expired"), "CARD_ACTION_INTENT_EXPIRED");
    assertThat(cards.intent(ALEX, i.terms().id()).status())
        .isEqualTo(CardActionIntent.Status.EXPIRED);
    clock.value = i.terms().createdAt().toInstant();
    execute(i, null, "first");
    failure(() -> execute(i, null, "second"), "CARD_ACTION_INTENT_ALREADY_EXECUTED");
  }

  @Test
  void staleControlsAndVersionRejectWithoutConsumingGrant() {
    var i = risky();
    var auth = authorize(i);
    execute(
        cards.prepare(
            ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, new CardControls(false, true, true, true)),
        null,
        "change_while_frozen");
    var before = mutation();
    failure(() -> execute(i, auth.id(), "stale"), "CARD_STATE_CHANGED");
    assertThat(mutation()).isEqualTo(before);
  }

  @ParameterizedTest
  @EnumSource(CardExecutionCheckpoint.Stage.class)
  void allInjectedFailuresRollbackCardReceiptIntentAuthorizationAuditAndKey(
      CardExecutionCheckpoint.Stage stage) {
    var i = risky();
    var a = authorize(i);
    var before = mutation();
    var money = financial();
    fault.failAt = stage;
    failure(() -> execute(i, a.id(), "rollback"), "PERSISTENCE_UNAVAILABLE");
    fault.failAt = null;
    assertThat(mutation()).isEqualTo(before);
    assertThat(financial()).isEqualTo(money);
    assertThat(security.validate(a.id(), a.binding()).status())
        .isEqualTo(AuthorizationStatus.ACTIVE);
    assertThat(execute(i, a.id(), "rollback").id()).isNotBlank();
  }

  @Test
  void actualDatabaseConstraintFailureAfterConsumptionRollsBackEntireExecution() {
    var i = risky();
    var a = authorize(i);
    var before = mutation();
    db.execute(
        "alter table idempotency_records add constraint test_card_commit_failure check(operation<>'EXECUTE_CARD_ACTION') not valid");
    try {
      failure(() -> execute(i, a.id(), "db_failure"), "PERSISTENCE_UNAVAILABLE");
      assertThat(mutation()).isEqualTo(before);
    } finally {
      db.execute("alter table idempotency_records drop constraint test_card_commit_failure");
    }
    assertThat(security.validate(a.id(), a.binding()).status())
        .isEqualTo(AuthorizationStatus.ACTIVE);
  }

  List<Object> race(Callable<CardAction> first, Callable<CardAction> second) throws Exception {
    try (var pool = Executors.newFixedThreadPool(2)) {
      var gate = new CountDownLatch(1);
      Callable<Object> a =
          () -> {
            gate.await();
            try {
              return first.call();
            } catch (CardFailure | SecurityFailure | CardRuleViolation e) {
              return e;
            }
          };
      Callable<Object> b =
          () -> {
            gate.await();
            try {
              return second.call();
            } catch (CardFailure | SecurityFailure | CardRuleViolation e) {
              return e;
            }
          };
      var x = pool.submit(a);
      var y = pool.submit(b);
      gate.countDown();
      return List.of(x.get(20, TimeUnit.SECONDS), y.get(20, TimeUnit.SECONDS));
    }
  }

  @Test
  void sameIntentSameKeyConcurrentlyReturnsOneReceipt() throws Exception {
    var i = prepare(CardActionType.FREEZE);
    var results = race(() -> execute(i, null, "same"), () -> execute(i, null, "same"));
    assertThat(results.get(0)).isEqualTo(results.get(1));
    assertThat(count("card_actions")).isEqualTo(1);
    assertThat(cards.card(ALEX, DEBIT).state().version()).isEqualTo(1);
  }

  @Test
  void sameIntentDifferentKeysCanOnlyExecuteOnce() throws Exception {
    var i = prepare(CardActionType.FREEZE);
    var results = race(() -> execute(i, null, "one"), () -> execute(i, null, "two"));
    assertThat(results.stream().filter(CardAction.class::isInstance)).hasSize(1);
    assertThat(count("card_actions")).isEqualTo(1);
    assertThat(results.stream().filter(CardFailure.class::isInstance).map(CardFailure.class::cast))
        .extracting(f -> f.code().name())
        .containsExactly("CARD_ACTION_INTENT_ALREADY_EXECUTED");
  }

  @Test
  void competingProtectiveFreezeIntentsProduceOneMutation() throws Exception {
    var a = prepare(CardActionType.FREEZE);
    var b = prepare(CardActionType.FREEZE);
    var results = race(() -> execute(a, null, "a"), () -> execute(b, null, "b"));
    assertThat(results.stream().filter(CardAction.class::isInstance)).hasSize(1);
    assertThat(results.stream().filter(CardFailure.class::isInstance).map(CardFailure.class::cast))
        .extracting(f -> f.code().name())
        .containsExactly("CARD_STATE_CHANGED");
    assertThat(count("card_actions")).isEqualTo(1);
    assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.FROZEN);
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void concurrentSingleAuthorizationCannotCauseTwoMutations(boolean sameKey) throws Exception {
    var i = risky();
    var a = authorize(i);
    var results =
        race(() -> execute(i, a.id(), "a"), () -> execute(i, a.id(), sameKey ? "a" : "b"));
    if (sameKey) assertThat(results.get(0)).isEqualTo(results.get(1));
    else assertThat(results.stream().filter(CardAction.class::isInstance)).hasSize(1);
    assertThat(count("card_actions")).isEqualTo(2);
    assertThat(
            db.queryForObject(
                "select count(*) from security_events where type='AUTHORIZATION_CONSUMED'",
                Long.class))
        .isEqualTo(1);
  }

  @Test
  void competingOffToOnIntentsAndGrantsCannotBothSucceed() throws Exception {
    execute(
        cards.prepare(
            ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, new CardControls(false, true, true, true)),
        null,
        "off");
    var a = cards.prepare(ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, CardDomainTest.ON);
    var b = cards.prepare(ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, CardDomainTest.ON);
    var aa = authorize(a);
    var ab = authorize(b);
    var results = race(() -> execute(a, aa.id(), "a"), () -> execute(b, ab.id(), "b"));
    assertThat(results.stream().filter(CardAction.class::isInstance)).hasSize(1);
    assertThat(count("card_actions")).isEqualTo(2);
    assertThat(
            db.queryForObject(
                "select count(*) from action_authorizations where status='ACTIVE'", Long.class))
        .isEqualTo(1);
  }

  @Test
  void customerWriteLockAllowsSecurityForeignKeyAuditInsertion() throws Exception {
    var tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
    try (var pool = Executors.newSingleThreadExecutor()) {
      tx.executeWithoutResult(
          status -> {
            context.getBean(DatabaseScope.class).lockOwnerForWrite(ALEX);
            var future =
                pool.submit(
                    () ->
                        B4TestVerification.create(
                            db,
                            security,
                            new Binding(
                                ALEX.value(), session, "CARD_ACTION_INTENT", "lock_probe", "hash"),
                            null));
            try {
              assertThat(future.get(5, TimeUnit.SECONDS).status())
                  .isEqualTo(ChallengeStatus.PENDING);
            } catch (Exception e) {
              throw new AssertionError("Customer row lock must allow security event FK checks", e);
            }
          });
    }
  }

  @Test
  void seedIsIdempotentAndSensitiveCardDataHasNoStorageColumns() {
    execute(prepare(CardActionType.FREEZE), null, "freeze");
    context.getBean(DemoCardSeed.class).initialize();
    assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.FROZEN);
    assertThat(
            db.queryForList(
                "select column_name from information_schema.columns where table_schema='public' and table_name in ('cards','card_action_intents','card_actions')",
                String.class))
        .noneMatch(s -> s.matches("(?i).*(full_pan|cvv|pin|card_number).*"));
  }

  static final class Browser implements AutoCloseable {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    HttpResponse<String> call(String method, String path, String body, String key, boolean csrf)
        throws Exception {
      var builder =
          HttpRequest.newBuilder(URI.create(base + path))
              .timeout(Duration.ofSeconds(20))
              .header("Content-Type", "application/json");
      if (key != null) builder.header("Idempotency-Key", key);
      if (csrf)
        cookies.getCookieStore().getCookies().stream()
            .filter(c -> c.getName().equals("XSRF-TOKEN") && !c.hasExpired())
            .findFirst()
            .ifPresent(c -> builder.header("X-XSRF-TOKEN", c.getValue()));
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

    JsonNode get(String path, int status) throws Exception {
      return checked(call("GET", path, null, null, false), status);
    }

    final java.util.Map<String, String> verifiedGrants = new java.util.HashMap<>();

    JsonNode post(String path, Object body, String key, int status) throws Exception {
      if (status < 400)
        body =
            JSON.readTree(
                B4TestVerification.verifiedBody(
                    db,
                    p -> call("GET", p, null, null, false),
                    (p, value) -> call("POST", p, value, null, true),
                    path,
                    JSON.writeValueAsString(body),
                    verifiedGrants));
      return checked(call("POST", path, JSON.writeValueAsString(body), key, true), status);
    }

    JsonNode checked(HttpResponse<String> r, int status) {
      assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
      return JSON.readTree(r.body());
    }

    void login(String email) throws Exception {
      get("/customer/session", 401);
      post("/customer/auth/login", Map.of("email", email, "password", "demo-password"), null, 200);
      get("/customer/session", 200);
    }

    JsonNode prepare(String type) throws Exception {
      return post(
          "/customer/card-action-intents", Map.of("cardId", DEBIT, "actionType", type), null, 201);
    }

    Map<String, String> request(JsonNode intent, String auth) {
      var body = new HashMap<String, String>();
      body.put("intentId", intent.path("id").asText());
      body.put("intentHash", intent.path("intentHash").asText());
      if (auth != null) body.put("actionAuthorizationId", auth);
      return body;
    }

    public void close() {
      client.close();
    }
  }

  @Test
  void realHttpFreezeChallengeVerifyUnfreezeReceiptAndReplay() throws Exception {
    try (var b = new Browser()) {
      b.get("/customer/cards", 401);
      b.login("alex@aster.local");
      var list = b.get("/customer/cards", 200);
      assertThat(list.path("items")).hasSize(2);
      var freeze = b.prepare("FREEZE");
      assertThat(freeze.path("authorizationRequirement").asText()).isEqualTo("CONFIRMATION");
      assertThat(b.get("/customer/card-action-intents/" + freeze.path("id").asText(), 200))
          .isEqualTo(freeze);
      var receipt = b.post("/customer/card-actions", b.request(freeze, null), "http_freeze", 200);
      assertThat(b.get("/customer/card-actions/" + receipt.path("id").asText(), 200))
          .isEqualTo(receipt);
      assertThat(b.get("/customer/cards/" + DEBIT, 200).path("status").asText())
          .isEqualTo("FROZEN");
      var unfreeze = b.prepare("UNFREEZE");
      assertThat(unfreeze.path("authorizationRequirement").asText()).isEqualTo("STEP_UP_AUTH");
      var missing =
          b.post("/customer/card-actions", b.request(unfreeze, null), "http_unfreeze", 403);
      assertThat(missing.path("code").asText()).isEqualTo("STEP_UP_AUTH_REQUIRED");
      var challenge =
          b.post(
              "/customer/auth/step-up-challenges",
              Map.of(
                  "actionType",
                  "CARD_UNFREEZE",
                  "resourceType",
                  "CARD_ACTION_INTENT",
                  "resourceId",
                  unfreeze.path("id").asText(),
                  "resourceHash",
                  unfreeze.path("intentHash").asText()),
              null,
              200);
      var verified =
          b.post(
              "/customer/auth/step-up-challenges/" + challenge.path("id").asText() + "/verify",
              Map.of(
                  "code",
                  B4TestVerification.code(db, challenge.path("id").asText()),
                  "password",
                  "demo-password"),
              null,
              200);
      String auth = verified.path("authorization").path("id").asText();
      var unfreezeReceipt =
          b.post("/customer/card-actions", b.request(unfreeze, auth), "http_unfreeze", 200);
      assertThat(b.post("/customer/card-actions", b.request(unfreeze, auth), "http_unfreeze", 200))
          .isEqualTo(unfreezeReceipt);
      assertThat(b.get("/customer/cards/" + DEBIT, 200).path("status").asText())
          .isEqualTo("ACTIVE");
      assertThat(b.get("/customer/session", 200).path("assuranceLevel").asText()).isEqualTo("AAL1");
      assertThat(unfreezeReceipt.toString())
          .doesNotContain(
              "actionAuthorizationId",
              "246810",
              "demo-password",
              "password",
              "fullPan",
              "cvv",
              "pin");
    }
  }

  @Test
  void realHttpControlVariantsValidateWireTypesAndDoNotTrustClientRisk() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var controls =
          Map.of(
              "onlinePayments",
              false,
              "internationalPayments",
              true,
              "atmWithdrawals",
              true,
              "contactless",
              true);
      var off =
          b.post(
              "/customer/card-action-intents",
              Map.of("cardId", DEBIT, "actionType", "UPDATE_CONTROLS", "controls", controls),
              null,
              201);
      assertThat(off.path("riskDirection").asText()).isEqualTo("PROTECTIVE");
      b.post("/customer/card-actions", b.request(off, null), "off_http", 200);
      var on =
          b.post(
              "/customer/card-action-intents",
              Map.of(
                  "cardId",
                  DEBIT,
                  "actionType",
                  "UPDATE_CONTROLS",
                  "controls",
                  Map.of(
                      "onlinePayments",
                      true,
                      "internationalPayments",
                      true,
                      "atmWithdrawals",
                      true,
                      "contactless",
                      true)),
              null,
              201);
      assertThat(on.path("authorizationRequirement").asText()).isEqualTo("STEP_UP_AUTH");
      var limit =
          b.post(
              "/customer/card-action-intents",
              Map.of(
                  "cardId",
                  DEBIT,
                  "actionType",
                  "UPDATE_LIMITS",
                  "limits",
                  Map.of("perTransaction", "1500.00", "daily", "5000.00")),
              null,
              201);
      assertThat(limit.path("after").path("limits").path("perTransaction").asText())
          .isEqualTo("1500.00");
      var lost =
          b.post(
              "/customer/card-action-intents",
              Map.of("cardId", DEBIT, "actionType", "REPORT_LOST"),
              null,
              201);
      assertThat(lost.path("after").path("status").asText()).isEqualTo("REPORTED_LOST");
      for (String json :
          List.of(
              "{\"cardId\":\"card_aster_debit\",\"actionType\":\"FREEZE\",\"riskDirection\":\"PROTECTIVE\"}",
              "{\"cardId\":\"card_aster_debit\",\"actionType\":\"FREEZE\",\"controls\":{}}",
              "{\"cardId\":\"card_aster_debit\",\"actionType\":\"UPDATE_CONTROLS\",\"controls\":{\"onlinePayments\":\"false\",\"internationalPayments\":true,\"atmWithdrawals\":true,\"contactless\":true}}",
              "{\"cardId\":\"card_aster_debit\",\"actionType\":\"UPDATE_CONTROLS\",\"controls\":{}}",
              "{\"cardId\":\"card_aster_debit\",\"actionType\":\"UPDATE_LIMITS\",\"limits\":{\"perTransaction\":\"1500\"}}")) {
        assertThat(
                b.checked(b.call("POST", "/customer/card-action-intents", json, null, true), 400)
                    .path("code")
                    .asText())
            .isEqualTo("INVALID_REQUEST");
      }
      assertThat(
              b.call(
                      "POST",
                      "/customer/card-action-intents",
                      "{\"cardId\":\"card_aster_debit\",\"actionType\":\"FREEZE\"}",
                      null,
                      false)
                  .statusCode())
          .isEqualTo(403);
      b.post("/customer/card-actions", b.request(on, null), null, 400);
      b.post(
          "/customer/card-actions",
          Map.of(
              "intentId",
              on.path("id").asText(),
              "intentHash",
              on.path("intentHash").asText(),
              "cardId",
              DEBIT),
          "extra",
          400);
    }
  }

  @Test
  void realHttpCustomerIsolationAndCallerSuppliedCustomerAreRejected() throws Exception {
    try (var a = new Browser();
        var b = new Browser()) {
      a.login("alex@aster.local");
      b.login("other@aster.local");
      assertThat(b.get("/customer/cards", 200).path("items")).hasSize(1);
      assertThat(a.get("/customer/cards/card_other", 404).path("code").asText())
          .isEqualTo("CARD_NOT_FOUND");
      assertThat(b.get("/customer/cards/" + DEBIT, 404).path("code").asText())
          .isEqualTo("CARD_NOT_FOUND");
      a.get("/customer/cards?customerId=customer_other", 400);
      var i = a.prepare("FREEZE");
      b.get("/customer/card-action-intents/" + i.path("id").asText(), 404);
      b.post("/customer/card-actions", b.request(i, null), "other_execute", 404);
      var r = a.post("/customer/card-actions", a.request(i, null), "alex_execute", 200);
      b.get("/customer/card-actions/" + r.path("id").asText(), 404);
    }
  }

  @Test
  void frozenCardRetainsHistoricalTransactionsAndCardFilter() throws Exception {
    try (var b = new Browser()) {
      b.login("alex@aster.local");
      var before = b.get("/customer/transactions?cardId=" + DEBIT + "&limit=50", 200);
      assertThat(before.path("items")).isNotEmpty();
      var accounts = b.get("/customer/accounts", 200);
      var i = b.prepare("FREEZE");
      b.post("/customer/card-actions", b.request(i, null), "freeze_history", 200);
      assertThat(b.get("/customer/transactions?cardId=" + DEBIT + "&limit=50", 200))
          .isEqualTo(before);
      assertThat(b.get("/customer/accounts", 200)).isEqualTo(accounts);
    }
  }

  @Test
  void cancelledIntentCannotBeExecutedAndLostCardCannotBeUnlocked() {
    var pending = prepare(CardActionType.FREEZE);
    cards.cancel(ALEX, pending.terms().id());
    failure(() -> execute(pending, null, "cancelled_freeze"), "CARD_ACTION_INTENT_CANCELLED");
    assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.ACTIVE);
    failure(() -> cards.cancel(OTHER, pending.terms().id()), "CARD_ACTION_INTENT_NOT_FOUND");

    var lost = prepare(CardActionType.REPORT_LOST);
    var auth = authorize(lost);
    execute(lost, auth.id(), "reported_lost");
    assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.REPORTED_LOST);
    failure(() -> prepare(CardActionType.UNFREEZE), "CARD_NOT_ELIGIBLE");
    var decision =
        context
            .getBean(CardAuthorizationService.class)
            .authorize(
                ALEX,
                DEBIT,
                new java.math.BigDecimal("10.00"),
                CardAuthorization.Channel.ONLINE,
                false,
                "lost_card_authorization");
    assertThat(decision.status()).isEqualTo(CardAuthorization.Status.DECLINED);
    assertThat(decision.reason()).isEqualTo(CardAuthorization.Reason.CARD_INACTIVE);
  }

  @Test
  void cancellationAndExecutionCannotBothWin() throws Exception {
    var intent = prepare(CardActionType.FREEZE);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var gate = new CountDownLatch(1);
      var cancel =
          pool.submit(
              () -> {
                gate.await();
                try {
                  return (Object) cards.cancel(ALEX, intent.terms().id());
                } catch (CardFailure failure) {
                  return failure;
                }
              });
      var execute =
          pool.submit(
              () -> {
                gate.await();
                try {
                  return (Object) execute(intent, null, "cancel_execute_race");
                } catch (CardFailure failure) {
                  return failure;
                }
              });
      gate.countDown();
      var cancellation = cancel.get(20, TimeUnit.SECONDS);
      var action = execute.get(20, TimeUnit.SECONDS);
      assertThat(cancellation instanceof CardActionIntent && action instanceof CardAction)
          .isFalse();
      assertThat((cancellation instanceof CardActionIntent) ^ (action instanceof CardAction))
          .isTrue();
      if (cancellation instanceof CardActionIntent) {
        assertThat(count("card_actions")).isZero();
        assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.ACTIVE);
      } else {
        assertThat(count("card_actions")).isEqualTo(1);
        assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.FROZEN);
      }
    }
  }

  @Test
  void cardLimitsAndControlsAreEnforcedByPersistedSimulatedAuthorization() {
    var authorizations = context.getBean(CardAuthorizationService.class);
    var initial =
        authorizations.authorize(
            ALEX,
            DEBIT,
            new java.math.BigDecimal("20.00"),
            CardAuthorization.Channel.ONLINE,
            false,
            "before_limit");
    assertThat(initial.status()).isEqualTo(CardAuthorization.Status.APPROVED);
    var changed =
        cards
            .card(ALEX, DEBIT)
            .state()
            .limits()
            .withCustomerLimits(
                new java.math.BigDecimal("50.00"), new java.math.BigDecimal("100.00"));
    var limitIntent = cards.prepare(ALEX, DEBIT, CardActionType.UPDATE_LIMITS, null, changed);
    execute(limitIntent, authorize(limitIntent).id(), "set_limit");
    assertThat(
            authorizations
                .authorize(
                    ALEX,
                    DEBIT,
                    new java.math.BigDecimal("60.00"),
                    CardAuthorization.Channel.ONLINE,
                    false,
                    "above_limit")
                .reason())
        .isEqualTo(CardAuthorization.Reason.PER_TRANSACTION_LIMIT);
    var controlsIntent =
        cards.prepare(
            ALEX, DEBIT, CardActionType.UPDATE_CONTROLS, new CardControls(false, true, true, true));
    execute(controlsIntent, authorize(controlsIntent).id(), "disable_online");
    assertThat(
            authorizations
                .authorize(
                    ALEX,
                    DEBIT,
                    new java.math.BigDecimal("10.00"),
                    CardAuthorization.Channel.ONLINE,
                    false,
                    "online_blocked")
                .reason())
        .isEqualTo(CardAuthorization.Reason.ONLINE_DISABLED);
    assertThat(
            authorizations
                .authorize(
                    ALEX,
                    DEBIT,
                    new java.math.BigDecimal("10.00"),
                    CardAuthorization.Channel.ATM,
                    false,
                    "atm_enabled")
                .status())
        .isEqualTo(CardAuthorization.Status.APPROVED);
    assertThat(financial()).isNotNull();
  }

  @Test
  void creditIncreaseIsASeparateBankReviewApplication() {
    var credit = context.getBean(CreditLimitService.class);
    var before =
        db.queryForObject(
            "select credit_limit from cards where card_id=?", java.math.BigDecimal.class, CREDIT);
    var intent =
        credit.prepare(ALEX, session, CREDIT, before.add(new java.math.BigDecimal("1000.00")));
    assertThat(count("credit_limit_applications")).isZero();
    var grant =
        B4TestVerification.grant(
            db,
            security,
            new Binding(
                ALEX.value(), session, "CREDIT_LIMIT_INTENT", intent.id(), intent.intentHash()),
            com.asterbank.banking.security.domain.VerificationAction
                .CREDIT_LIMIT_APPLICATION_SUBMIT);
    var submitted =
        credit.submit(ALEX, session, intent.id(), intent.intentHash(), grant, "limit_review", null);
    assertThat(submitted.status()).isEqualTo(CreditLimitApplication.Status.UNDER_REVIEW);
    assertThat(
            credit.submit(
                ALEX, session, intent.id(), intent.intentHash(), grant, "limit_review", null))
        .isEqualTo(submitted);
    assertThat(
            db.queryForObject(
                "select credit_limit from cards where card_id=?",
                java.math.BigDecimal.class,
                CREDIT))
        .isEqualByComparingTo(before);
    assertThat(count("credit_limit_applications")).isEqualTo(1);
    failure(() -> cards.card(OTHER, CREDIT), "CARD_NOT_FOUND");
  }

  @Test
  @Order(Integer.MAX_VALUE)
  void cardReceiptIntentAuthorizationAndReplaySurviveFullContextRestart() {
    var i = risky();
    var a = authorize(i);
    var receipt = execute(i, a.id(), "durable");
    var time = clock.value;
    context.close();
    open();
    clock.value = time;
    assertThat(cards.action(ALEX, receipt.id())).isEqualTo(receipt);
    assertThat(cards.intent(ALEX, i.terms().id()).status())
        .isEqualTo(CardActionIntent.Status.EXECUTED);
    assertThat(cards.card(ALEX, DEBIT).state().status()).isEqualTo(Card.Status.ACTIVE);
    assertThat(
            db.queryForObject(
                "select status from action_authorizations where authorization_id=?",
                String.class,
                a.id()))
        .isEqualTo("CONSUMED");
    assertThat(execute(i, a.id(), "durable")).isEqualTo(receipt);
  }
}
