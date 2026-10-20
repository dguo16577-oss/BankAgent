package com.asterbank.banking;

import static com.asterbank.banking.TransferDomainTest.fails;
import static com.asterbank.banking.TransferFixtures.*;
import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.payment.adapter.persistence.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.transaction.adapter.inmemory.InMemoryTransactionRepository;
import com.asterbank.banking.customer.transaction.application.*;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.adapter.persistence.*;
import com.asterbank.banking.shared.config.DemoSeed;
import com.asterbank.banking.shared.domain.*;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

/** Never disabled when Docker is absent: failsafe verify must exercise a real PostgreSQL server. */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PostgreSqlIT {
  static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
  static ConfigurableApplicationContext context;
  static MockMvc mvc;
  static JdbcTemplate jdbc;
  static TransferPreparationService preparation;
  static TransferExecutionService execution;
  static AccountRepository accounts;
  static TransactionQueryService transactions;
  static DemoSeed seed;

  @TestConfiguration(proxyBeanMethods = false)
  static class ConnectionConfig {
    // Explicit connection details let a new Spring context reuse the same externally owned test
    // container.
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
    TransferFixtures.TestClock clockForDatabaseTests() {
      return new TransferFixtures.TestClock();
    }
  }

  @BeforeAll
  static void start() throws Exception {
    POSTGRES.start();
    seed = ReadDomainFixtures.withOther(JsonMapper.builder().build());
    open();
  }

  static void open() {
    context =
        new SpringApplicationBuilder(BankingCoreApplication.class)
            .sources(ConnectionConfig.class)
            .profiles("integration", "test")
            .run("--server.port=0");
    mvc =
        MockMvcBuilders.webAppContextSetup((WebApplicationContext) context)
            .apply(springSecurity())
            .build();
    jdbc = context.getBean(JdbcTemplate.class);
    preparation = context.getBean(TransferPreparationService.class);
    execution = context.getBean(TransferExecutionService.class);
    accounts = context.getBean(AccountRepository.class);
    transactions = context.getBean(TransactionQueryService.class);
  }

  @AfterAll
  static void stop() {
    if (context != null) context.close();
    POSTGRES.stop();
  }

  @BeforeEach
  void reset() {
    jdbc.execute("truncate customers cascade");
    context.getBean(TransferFixtures.TestClock.class).value = Instant.parse("2026-09-27T02:30:00Z");
    context.getBean(DemoDataInitializer.class).initialize(seed, TransferFixtures.recipients());
  }

  PrepareTransfer command(String amount) {
    return new PrepareTransfer(
        new AccountId("acc_current"),
        new RecipientId("recipient_zhang"),
        Money.of(amount, "CNY"),
        "Persistent transfer");
  }

  TransferIntent prepare() {
    return prepareAuthorized(ALEX, command("500.00"));
  }

  TransferIntent prepareAuthorized(CustomerId owner, PrepareTransfer command) {
    return preparation.prepare(owner, command, B4TestVerification.session(context, owner.value()));
  }

  Transfer executeAuthorized(CustomerId owner, String id, String hash, String key) {
    var session = B4TestVerification.session(context, owner.value());
    var intent = context.getBean(TransferIntentRepository.class).find(owner, id);
    String grant =
        intent.isPresent()
            ? B4TestVerification.domainGrant(
                context,
                owner.value(),
                session,
                "TRANSFER_INTENT",
                id,
                intent.get().intentHash(),
                com.asterbank.banking.security.domain.VerificationAction.TRANSFER_EXECUTE)
            : null;
    return execution.execute(owner, id, hash, key, session, grant, null);
  }

  Transfer execute(TransferIntent i, String key) {
    return executeAuthorized(ALEX, i.terms().id(), i.intentHash(), key);
  }

  Account current() {
    return accounts.find(ALEX, new AccountId("acc_current")).orElseThrow();
  }

  long count(String table) {
    return jdbc.queryForObject("select count(*) from " + table, Long.class);
  }

  List<Object> state() {
    return List.of(
        current(),
        count("transactions"),
        count("transfers"),
        count("idempotency_records"),
        jdbc.queryForList(
            "select intent_id,status,intent_hash,snapshot::text from transfer_intents order by intent_id"),
        jdbc.queryForObject(
            "select transaction_revision from customers where customer_id='usr_aster_alex'",
            Long.class));
  }

  @Test
  void emptyDatabaseMigratesAndHibernateValidatesWithoutMemoryBeans() {
    assertThat(
            jdbc.queryForObject(
                "select count(*) from flyway_schema_history where success", Integer.class))
        .isEqualTo(34);
    assertThat(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto"))
        .isEqualTo("validate");
    assertThat(
            context.getBeansOfType(
                com.asterbank.banking.shared.adapter.inmemory.BankingMemoryLock.class))
        .isEmpty();
    assertThat(count("accounts")).isEqualTo(4);
    assertThat(count("transactions")).isEqualTo(62);
    assertThat(
            jdbc.queryForList(
                "select indexname from pg_indexes where tablename='transactions'", String.class))
        .contains("tx_customer_order", "tx_account_order", "tx_card_order");
  }

  @Test
  void moneyOffsetAndMasksRoundTrip() {
    var initial = seed.accounts().getFirst();
    var loaded = current();
    assertThat(loaded.balance()).isEqualTo(initial.balance());
    assertThat(loaded.pendingAmount()).isEqualTo(initial.pendingAmount());
    assertThat(loaded.openedAt().toInstant()).isEqualTo(initial.openedAt().toInstant());
    assertThat(loaded.availableBalance().decimal()).isEqualTo("23810.31");
    assertThat(loaded.maskedAccountNumber()).isEqualTo("•••• 1048");
    var usd = accounts.find(ALEX, new AccountId("acc_usd")).orElseThrow();
    assertThat(usd.equivalent().value().decimal()).isEqualTo("4411.37");
    assertThat(usd.equivalent().exchangeRate()).isEqualByComparingTo("7.10");
    var original = seed.transactions().getFirst();
    var tx = transactions.detail(ALEX, original.id()).transaction();
    assertThat(tx.occurredAt().toInstant()).isEqualTo(original.occurredAt().toInstant());
    assertThat(tx.amount()).isEqualTo(original.amount());
  }

  @Test
  void numericStorageRetainsTwentyTwoWholeDigitsExactly() {
    jdbc.update(
        "update accounts set balance=1234567890123456789012.34 where account_id='acc_current'");
    assertThat(current().balance().decimal()).isEqualTo("1234567890123456789012.34");
    assertThat(current().availableBalance().decimal()).isEqualTo("1234567890123456788980.34");
  }

  @Test
  void unavailableDatabaseFailsStartupWithoutInMemoryFallback() {
    assertThatThrownBy(
            () -> {
              try (var ignored =
                  new SpringApplicationBuilder(BankingCoreApplication.class)
                      .profiles("local")
                      .run(
                          "--server.port=0",
                          "--spring.datasource.url=jdbc:postgresql://127.0.0.1:1/unavailable?connectTimeout=1",
                          "--spring.datasource.username=local_test",
                          "--spring.datasource.password=local_test",
                          "--spring.datasource.hikari.connection-timeout=1000",
                          "--spring.datasource.hikari.initialization-fail-timeout=1000")) {
                fail("Database-free startup must fail");
              }
            })
        .isInstanceOf(org.springframework.beans.BeansException.class);
  }

  @Test
  @Order(Integer.MAX_VALUE)
  void unavailableDatabaseMakesHealthDownWithoutSecretDetails() throws Exception {
    POSTGRES.stop();
    mvc.perform(get("/actuator/health"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.status").value("DOWN"))
        .andExpect(jsonPath("$.components").doesNotExist())
        .andExpect(jsonPath("$.details").doesNotExist());
  }

  @Test
  void allFiltersAndKeysetPagesHaveExactInMemoryParity() {
    var memory = new InMemoryTransactionRepository(seed.transactions(), "fixture");
    var filters = new ArrayList<TransactionFilter>();
    filters.add(TransactionFilter.defaults());
    for (var a : seed.accounts())
      filters.add(new TransactionFilter(a.id(), null, null, null, null, null, null, null, "", 10));
    filters.add(
        new TransactionFilter(
            null, new CardId("card_aster_debit"), null, null, null, null, null, null, "", 10));
    for (var s : TransactionStatus.values())
      filters.add(new TransactionFilter(null, null, null, null, s, null, null, null, "", 10));
    for (var d : TransactionDirection.values())
      filters.add(new TransactionFilter(null, null, null, null, null, d, null, null, "", 10));
    for (var t : TransactionType.values())
      filters.add(new TransactionFilter(null, null, null, null, null, null, t, null, "", 10));
    for (var c : TransactionCategory.values())
      filters.add(new TransactionFilter(null, null, null, null, null, null, null, c, "", 10));
    for (var search : List.of("STARBUCKS", " zhang ", "Salary", "%", "_", "ASTER", "not present"))
      filters.add(
          new TransactionFilter(null, null, null, null, null, null, null, null, search, 10));
    filters.add(
        new TransactionFilter(
            null,
            null,
            OffsetDateTime.parse("2026-09-01T00:00:00+08:00"),
            OffsetDateTime.parse("2026-09-28T00:00:00+08:00"),
            null,
            null,
            null,
            null,
            "",
            10));
    filters.add(
        new TransactionFilter(
            new AccountId("acc_current"),
            null,
            null,
            null,
            TransactionStatus.COMPLETED,
            TransactionDirection.DEBIT,
            TransactionType.CARD_PAYMENT,
            TransactionCategory.DINING,
            "",
            10));
    for (var filter : filters)
      for (int limit : List.of(1, 2, 7, 10, 50)) {
        var f =
            new TransactionFilter(
                filter.accountId(),
                filter.cardId(),
                filter.from(),
                filter.to(),
                filter.status(),
                filter.direction(),
                filter.type(),
                filter.category(),
                filter.search(),
                limit);
        var expected = memory.matching(ALEX, f).stream().map(Transaction::id).toList();
        var ids = new ArrayList<TransactionId>();
        String cursor = null;
        int pages = 0;
        do {
          var page = transactions.list(ALEX, f, cursor);
          assertThat(page.items().size()).isLessThanOrEqualTo(limit);
          ids.addAll(page.items().stream().map(Transaction::id).toList());
          assertThat(page.hasMore()).isEqualTo(page.nextCursor() != null);
          cursor = page.nextCursor();
          assertThat(++pages).isLessThan(100);
        } while (cursor != null);
        assertThat(ids)
            .as("filter %s, limit %s", f, limit)
            .containsExactlyElementsOf(expected)
            .doesNotHaveDuplicates();
      }
  }

  @Test
  void prepareIsFinanciallyReadOnlyAndReviewSurvivesSourceChanges() {
    var account = current();
    var count = count("transactions");
    var i = prepare();
    assertThat(current()).isEqualTo(account);
    assertThat(count("transactions")).isEqualTo(count);
    assertThat(count("transfers")).isZero();
    assertThat(count("idempotency_records")).isZero();
    jdbc.update("update accounts set balance=balance-100 where account_id='acc_current'");
    assertThat(preparation.get(ALEX, i.terms().id())).isEqualTo(i);
    var receipt = execute(i, "key");
    assertThat(current().balance().decimal()).isEqualTo("23242.31");
    assertThat(receipt.sourceAccount().balance().decimal()).isEqualTo("23742.31");
  }

  @Test
  void fullTransferAndIdempotencySurviveSpringContextRestart() {
    var i = prepare();
    var receipt = execute(i, "persistent-key");
    var before = state();
    context.close();
    open();
    // Rerunning the seed must not reset any mutation.
    context.getBean(DemoDataInitializer.class).initialize(seed, TransferFixtures.recipients());
    assertThat(state()).isEqualTo(before);
    assertThat(execute(i, "persistent-key")).isEqualTo(receipt);
    assertThat(state()).isEqualTo(before);
    assertThat(execution.get(ALEX, receipt.id())).isEqualTo(receipt);
    assertThat(transactions.detail(ALEX, receipt.transactionId()).transaction().amount())
        .isEqualTo(Money.of("500", "CNY"));
    assertThat(current().balance().decimal()).isEqualTo("23342.31");
    assertThat(current().pendingAmount().decimal()).isEqualTo("32.00");
    assertThat(current().availableBalance().decimal()).isEqualTo("23310.31");
  }

  @ParameterizedTest
  @ValueSource(strings = {"transactions", "transfers"})
  void actualDatabaseConstraintFailureRollsBackAllFiveResources(String table) {
    var i = prepare();
    var before = state();
    jdbc.execute(
        "alter table "
            + table
            + " add constraint injected_write_failure check(amount <> 500.00) not valid");
    try {
      fails(PERSISTENCE_UNAVAILABLE, () -> execute(i, "key"));
      assertThat(state()).isEqualTo(before);
    } finally {
      jdbc.execute("alter table " + table + " drop constraint injected_write_failure");
    }
    execute(i, "key");
    assertThat(count("transfers")).isEqualTo(1);
    assertThat(count("idempotency_records")).isEqualTo(1);
  }

  List<Object> race(Callable<Transfer> one, Callable<Transfer> two) throws Exception {
    var ready = new CountDownLatch(2);
    var start = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var jobs = new ArrayList<Future<Object>>();
      for (var action : List.of(one, two))
        jobs.add(
            pool.submit(
                () -> {
                  ready.countDown();
                  if (!start.await(10, TimeUnit.SECONDS))
                    throw new AssertionError("barrier timeout");
                  try {
                    return action.call();
                  } catch (PaymentFailure e) {
                    return e.code();
                  }
                }));
      assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      return List.of(jobs.get(0).get(20, TimeUnit.SECONDS), jobs.get(1).get(20, TimeUnit.SECONDS));
    }
  }

  @Test
  void concurrentSameIntentDifferentKeys() throws Exception {
    var i = prepare();
    var results = race(() -> execute(i, "one"), () -> execute(i, "two"));
    assertThat(results.stream().filter(Transfer.class::isInstance).count()).isEqualTo(1);
    assertThat(results).contains(TRANSFER_INTENT_ALREADY_EXECUTED);
    oneDebit("23342.31");
  }

  @Test
  void cancelBeforeExecutionPersistsReasonAndPreventsDebit() {
    var intent = prepare();
    String session = B4TestVerification.session(context, ALEX.value());
    var cancelled = preparation.cancel(ALEX, intent.terms().id(), session, "TASK_REVISED");
    assertThat(cancelled.status()).isEqualTo(TransferIntent.Status.CANCELLED);
    assertThat(preparation.cancel(ALEX, intent.terms().id(), session, "TASK_REVISED").status())
        .isEqualTo(TransferIntent.Status.CANCELLED);
    assertThat(
            jdbc.queryForObject(
                "select cancellation_reason from transfer_intents where intent_id=?",
                String.class,
                intent.terms().id()))
        .isEqualTo("TASK_REVISED");
    fails(TRANSFER_INTENT_CANCELLED, () -> execute(intent, "after_cancel"));
    assertThat(current().balance().decimal()).isEqualTo("23842.31");
    assertThat(count("transfers")).isZero();
  }

  @Test
  void executeBeforeCancelPreservesExactlyOneDebit() {
    var intent = prepare();
    execute(intent, "first");
    String session = B4TestVerification.session(context, ALEX.value());
    fails(
        TRANSFER_INTENT_ALREADY_EXECUTED,
        () -> preparation.cancel(ALEX, intent.terms().id(), session, "TASK_REVISED"));
    oneDebit("23342.31");
    assertThat(preparation.get(ALEX, intent.terms().id()).status())
        .isEqualTo(TransferIntent.Status.EXECUTED);
  }

  @Test
  void concurrentCancelAndExecuteNeverProduceCancelledWithDebit() throws Exception {
    var intent = prepare();
    String session = B4TestVerification.session(context, ALEX.value());
    var ready = new CountDownLatch(2);
    var start = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      Future<Object> cancel =
          pool.submit(
              () -> {
                ready.countDown();
                start.await(10, TimeUnit.SECONDS);
                try {
                  return preparation
                      .cancel(ALEX, intent.terms().id(), session, "TASK_REVISED")
                      .status();
                } catch (PaymentFailure e) {
                  return e.code();
                }
              });
      Future<Object> execute =
          pool.submit(
              () -> {
                ready.countDown();
                start.await(10, TimeUnit.SECONDS);
                try {
                  return execute(intent, "race");
                } catch (PaymentFailure e) {
                  return e.code();
                }
              });
      assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      cancel.get(20, TimeUnit.SECONDS);
      execute.get(20, TimeUnit.SECONDS);
    }
    var status = preparation.get(ALEX, intent.terms().id()).status();
    if (status == TransferIntent.Status.CANCELLED) {
      assertThat(current().balance().decimal()).isEqualTo("23842.31");
      assertThat(count("transfers")).isZero();
    } else {
      assertThat(status).isEqualTo(TransferIntent.Status.EXECUTED);
      oneDebit("23342.31");
    }
  }

  @Test
  void concurrentSameIntentSameKey() throws Exception {
    var i = prepare();
    var results = race(() -> execute(i, "same"), () -> execute(i, "same"));
    assertThat(results.getFirst()).isInstanceOf(Transfer.class).isEqualTo(results.getLast());
    oneDebit("23342.31");
  }

  @Test
  void concurrentTwoIntentsCannotOverdraw600Available() throws Exception {
    jdbc.update("update accounts set balance=632 where account_id='acc_current'");
    var one = prepare();
    var two = prepare();
    var results = race(() -> execute(one, "one"), () -> execute(two, "two"));
    assertThat(results.stream().filter(Transfer.class::isInstance).count()).isEqualTo(1);
    assertThat(results).contains(INSUFFICIENT_FUNDS);
    oneDebit("132.00");
  }

  void oneDebit(String balance) {
    assertThat(current().balance().decimal()).isEqualTo(balance);
    assertThat(current().pendingAmount().decimal()).isEqualTo("32.00");
    assertThat(count("transfers")).isEqualTo(1);
    assertThat(count("transactions")).isEqualTo(63);
    assertThat(count("idempotency_records")).isEqualTo(1);
  }

  @Test
  void customerIsolationCoversAllResourcesAndKeyScopes() {
    assertThat(accounts.find(ALEX, new AccountId("acc_other"))).isEmpty();
    assertThat(accounts.find(OTHER, new AccountId("acc_current"))).isEmpty();
    assertThat(
            context.getBean(TransactionRepository.class).find(ALEX, new TransactionId("txn_other")))
        .isEmpty();
    assertThat(
            context
                .getBean(RecipientRepository.class)
                .find(ALEX, new RecipientId("recipient_other")))
        .isEmpty();
    var i = prepare();
    fails(TRANSFER_INTENT_NOT_FOUND, () -> preparation.get(OTHER, i.terms().id()));
    fails(
        TRANSFER_INTENT_NOT_FOUND,
        () -> executeAuthorized(OTHER, i.terms().id(), i.intentHash(), "same"));
    var receipt = execute(i, "same");
    fails(TRANSFER_NOT_FOUND, () -> execution.get(OTHER, receipt.id()));
    var other =
        prepareAuthorized(
            OTHER,
            new PrepareTransfer(
                new AccountId("acc_other"),
                new RecipientId("recipient_other"),
                Money.of("100", "CNY"),
                ""));
    var otherReceipt = executeAuthorized(OTHER, other.terms().id(), other.intentHash(), "same");
    fails(TRANSFER_NOT_FOUND, () -> execution.get(ALEX, otherReceipt.id()));
    assertThat(count("idempotency_records")).isEqualTo(2);
  }

  @Test
  void hashExpiryFundsAndStaleIdentityFailuresHaveNoMutation() {
    var i = prepare();
    var before = state();
    fails(
        TRANSFER_INTENT_HASH_MISMATCH, () -> executeAuthorized(ALEX, i.terms().id(), "bad", "key"));
    assertThat(state()).isEqualTo(before);
    jdbc.update("update accounts set balance=400 where account_id='acc_current'");
    before = state();
    fails(INSUFFICIENT_FUNDS, () -> execute(i, "key"));
    assertThat(state()).isEqualTo(before);
    jdbc.update("update accounts set balance=23842.31 where account_id='acc_current'");
    jdbc.update(
        "update recipients set display_name='Changed' where recipient_id='recipient_zhang'");
    before = state();
    fails(TRANSFER_INTENT_HASH_MISMATCH, () -> execute(i, "key"));
    assertThat(state()).isEqualTo(before);
    context.getBean(TransferFixtures.TestClock.class).value = i.terms().expiresAt().toInstant();
    fails(TRANSFER_INTENT_EXPIRED, () -> execute(i, "key"));
    assertThat(state()).isEqualTo(before);
  }

  @Test
  void keyConflictAndReplayAfterExpiryPreserveState() {
    var i = prepare();
    var receipt = execute(i, "key");
    var other = prepare();
    var before = state();
    fails(IDEMPOTENCY_KEY_REUSED, () -> execute(other, "key"));
    fails(TRANSFER_INTENT_ALREADY_EXECUTED, () -> execute(i, "new"));
    assertThat(state()).isEqualTo(before);
    context.getBean(TransferFixtures.TestClock.class).value = i.terms().expiresAt().toInstant();
    assertThat(execute(i, "key")).isEqualTo(receipt);
    assertThat(state()).isEqualTo(before);
  }

  @Test
  void cursorInvalidationAndCustomerScopeArePreserved() {
    var f = TransactionFilter.defaults();
    var page = transactions.list(ALEX, f, null);
    assertThatThrownBy(() -> transactions.list(OTHER, f, page.nextCursor()))
        .isInstanceOf(InvalidCursor.class);
    assertThatThrownBy(() -> transactions.list(ALEX, f, "malformed!"))
        .isInstanceOf(InvalidCursor.class);
    execute(prepare(), "key");
    assertThatThrownBy(() -> transactions.list(ALEX, f, page.nextCursor()))
        .isInstanceOf(InvalidCursor.class);
  }

  @Test
  void databaseProtectsNegativeAmountsOwnershipAndUniqueIntent() {
    assertThatThrownBy(
            () -> jdbc.update("update accounts set balance=-1 where account_id='acc_current'"))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "update transactions set customer_id='customer_other' where transaction_id='txn_coffee'"))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    var receipt = execute(prepare(), "key");
    var txColumns =
        jdbc.queryForList(
            "select column_name from information_schema.columns where table_name='transactions' and table_schema='public' order by ordinal_position",
            String.class);
    var txValues =
        txColumns.stream()
            .map(c -> c.equals("transaction_id") ? "'txn_constraint_probe'" : c)
            .toList();
    jdbc.update(
        "insert into transactions ("
            + String.join(",", txColumns)
            + ") select "
            + String.join(",", txValues)
            + " from transactions where transaction_id=?",
        receipt.transactionId().value());
    var transferColumns =
        jdbc.queryForList(
            "select column_name from information_schema.columns where table_name='transfers' and table_schema='public' order by ordinal_position",
            String.class);
    var transferValues =
        transferColumns.stream()
            .map(
                c ->
                    c.equals("transfer_id")
                        ? "'transfer_constraint_probe'"
                        : c.equals("transaction_id") ? "'txn_constraint_probe'" : c)
            .toList();
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into transfers ("
                        + String.join(",", transferColumns)
                        + ") select "
                        + String.join(",", transferValues)
                        + " from transfers where transfer_id=?",
                    receipt.id()))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class)
        .hasMessageContaining("transfers_intent_id_key");
    assertThatThrownBy(
            () -> jdbc.update("insert into idempotency_records select * from idempotency_records"))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from transfers where intent_id=?",
                Integer.class,
                receipt.terms().id()))
        .isEqualTo(1);
  }

  @Test
  void realDatabaseEndpointsUseGeneratedShapesAndSecurity() throws Exception {
    mvc.perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"))
        .andExpect(jsonPath("$.components").doesNotExist());
    mvc.perform(get("/customer/accounts")).andExpect(status().isUnauthorized());
    mvc.perform(get("/customer/accounts").with(user(ALEX.value())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accounts.length()").value(3));
    mvc.perform(get("/customer/transactions").with(user(ALEX.value())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(10));
    mvc.perform(get("/customer/accounts/acc_other").with(user(ALEX.value())))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
    var session = new org.springframework.mock.web.MockHttpSession();
    var body =
        "{\"sourceAccountId\":\"acc_current\",\"recipientId\":\"recipient_zhang\",\"amount\":{\"amount\":\"500.00\",\"currency\":\"CNY\"}}";
    var json = JsonMapper.builder().build();
    var intent =
        json.readTree(
            mvc.perform(
                    post("/customer/transfer-intents")
                        .with(user(ALEX.value()))
                        .with(csrf().asHeader())
                        .with(
                            r -> {
                              r.setSession(session);
                              return r;
                            })
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString());
    var execute =
        "{\"intentId\":\""
            + intent.get("id").asString()
            + "\",\"intentHash\":\""
            + intent.get("intentHash").asString()
            + "\"}";
    context
        .getBean(com.asterbank.banking.security.application.SecurityService.class)
        .login(ALEX.value(), session.getId(), null);
    var grant =
        B4TestVerification.domainGrant(
            context,
            ALEX.value(),
            session.getId(),
            "TRANSFER_INTENT",
            intent.path("id").asText(),
            intent.path("intentHash").asText(),
            com.asterbank.banking.security.domain.VerificationAction.TRANSFER_EXECUTE);
    execute =
        execute.substring(0, execute.length() - 1)
            + ",\"actionAuthorizationId\":\""
            + grant
            + "\"}";
    mvc.perform(
            post("/customer/transfers")
                .with(user(ALEX.value()))
                .with(csrf().asHeader())
                .with(
                    r -> {
                      r.setSession(session);
                      return r;
                    })
                .header("Idempotency-Key", "http")
                .contentType("application/json")
                .content(execute))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COMPLETED"))
        .andExpect(jsonPath("$.amount.amount").value("500.00"));
    mvc.perform(get("/customer/accounts/acc_current").with(user(ALEX.value())))
        .andExpect(jsonPath("$.balance.amount").value("23342.31"))
        .andExpect(jsonPath("$.recentTransactions[0].type").value("BANK_TRANSFER"));
    var saved =
        execution.execute(
            ALEX,
            intent.get("id").asString(),
            intent.get("intentHash").asString(),
            "http",
            session.getId(),
            grant,
            "test");
    mvc.perform(get("/customer/recipients").with(user(ALEX.value())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(3));
    mvc.perform(
            get("/customer/transfer-intents/" + intent.get("id").asString())
                .with(user(ALEX.value())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("EXECUTED"));
    mvc.perform(get("/customer/transfers/" + saved.id()).with(user(ALEX.value())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.transactionId").value(saved.transactionId().value()));
    mvc.perform(
            get("/customer/transactions/" + saved.transactionId().value()).with(user(ALEX.value())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.counterparty.maskedAccountNumber").value("•••• 6018"));
    mvc.perform(get("/customer/transactions/txn_other").with(user(ALEX.value())))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_FOUND"));
  }
}
